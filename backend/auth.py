import hashlib
import hmac
import secrets
import sqlite3
import time

from starlette.responses import Response

# 로그인 쿠키 (API-SPEC "로그인 쿠키")
COOKIE_NAME = "todo_session"
# 400일. Chrome과 Edge가 쿠키를 두는 가장 긴 기간이다 (ARCHITECTURE A-7)
MAX_AGE = 400 * 24 * 60 * 60
# 마지막으로 쓴 때가 하루 이상 지났을 때만 새로 적는다 (API-SPEC 결정 기록 16)
REFRESH_AFTER = 24 * 60 * 60

# scrypt 설정은 고정 값이다. 바꾸면 이미 만든 계정이 로그인할 수 없다 (DATA-MODEL 결정 기록 11)
SCRYPT_N = 16384
SCRYPT_R = 8
SCRYPT_P = 1
HASH_BYTES = 64
SALT_BYTES = 16

# 없는 아이디로 로그인할 때 비교할 값 (API-SPEC 결정 기록 19)
_DUMMY_SALT = secrets.token_bytes(SALT_BYTES)


def hash_password(password: str, salt: bytes) -> bytes:
    # 비밀번호 원문은 저장하지 않는다 (ARCHITECTURE A-8)
    return hashlib.scrypt(
        password.encode("utf-8", "surrogatepass"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=HASH_BYTES,
    )


def new_password(password: str) -> tuple[bytes, bytes]:
    salt = secrets.token_bytes(SALT_BYTES)
    return salt, hash_password(password, salt)


def check_password(password: str, salt: bytes, expected: bytes) -> bool:
    return hmac.compare_digest(hash_password(password, salt), expected)


def burn_password_time(password: str) -> None:
    # 없는 아이디도 비밀번호 계산을 한 번 해서, 걸리는 시간으로 아이디가 있는지 알 수 없게 한다
    hash_password(password, _DUMMY_SALT)


def token_hash(token: str) -> str:
    # 쿠키 값의 원문은 저장하지 않는다 (DATA-MODEL 결정 기록 12)
    return hashlib.sha256(token.encode("utf-8", "surrogatepass")).hexdigest()


def now() -> int:
    return int(time.time())


def start_session(conn: sqlite3.Connection, user_id: int, old_token: str | None) -> str:
    # 이 브라우저의 옛 로그인 기록은 지우고 새로 만든다 (API-SPEC 결정 기록 17)
    if old_token:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(old_token),))
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, last_used_at) VALUES (?, ?, ?)",
        (token_hash(token), user_id, now()),
    )
    return token


def find_session(conn: sqlite3.Connection, token: str) -> tuple[sqlite3.Row | None, bool]:
    """로그인 기록과 계정을 찾는다. 두 번째 값은 쿠키를 다시 줘야 하는지다.

    읽기에 실패하면 sqlite3.Error가 그대로 나간다.
    """
    hashed = token_hash(token)
    row = conn.execute(
        "SELECT sessions.user_id, sessions.last_used_at, users.username"
        " FROM sessions JOIN users ON users.id = sessions.user_id"
        " WHERE sessions.token_hash = ?",
        (hashed,),
    ).fetchone()
    if row is None:
        return None, False
    current = now()
    # 400일이 지난 로그인 기록은 없는 것으로 보고 지운다 (DATA-MODEL 결정 기록 13)
    if current - row["last_used_at"] > MAX_AGE:
        try:
            with conn:
                conn.execute("DELETE FROM sessions WHERE token_hash = ?", (hashed,))
        except sqlite3.Error:
            pass
        return None, False
    if current - row["last_used_at"] < REFRESH_AFTER:
        return row, False
    # 새로 적기에 실패해도 요청은 그대로 처리한다 (API-SPEC "로그인 쿠키" 늘리기)
    try:
        with conn:
            conn.execute(
                "UPDATE sessions SET last_used_at = ? WHERE token_hash = ?", (current, hashed)
            )
    except sqlite3.Error:
        return row, False
    return row, True


def end_session(conn: sqlite3.Connection, token: str) -> None:
    conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))


def set_cookie(response: Response, token: str) -> None:
    # HTTP로 주고받으므로 Secure는 붙이지 않는다 (D-024)
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=MAX_AGE,
        path="/",
        httponly=True,
        samesite="Lax",
    )


def clear_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="Lax")
