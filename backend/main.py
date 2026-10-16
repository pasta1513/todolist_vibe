import logging
import re
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

import auth
import db

# 카드 응답에 user_id는 담지 않는다 (DATA-MODEL 결정 기록 10의 API 영향)
TASK_COLUMNS = "id, title, description, status, position"
STATUSES = ("TODO", "IN_PROGRESS", "DONE")
# 아이디는 영문 소문자와 숫자만, 4~20자 (R-031)
USERNAME_PATTERN = re.compile(r"[a-z0-9]{4,20}")
# 비밀번호는 8자 이상 (R-032)
PASSWORD_MIN = 8


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        db.init_db()
    except db.OldDatabaseError as err:
        # 옛 모양 저장 파일이면 안내만 보이고 켜지지 않는다 (DATA-MODEL 결정 기록 16)
        logging.getLogger("uvicorn.error").error("%s", err)
        raise
    yield


app = FastAPI(lifespan=lifespan)


# 로그인한 요청이면, 하루 이상 지난 로그인 기록의 쿠키를 400일로 다시 준다 (API-SPEC "로그인 쿠키")
@app.middleware("http")
async def refresh_cookie(request: Request, call_next):
    response = await call_next(request)
    token = getattr(request.state, "refresh_token", None)
    if token:
        auth.set_cookie(response, token)
    return response


# 입력 오류 응답 (API-SPEC "실패 응답")
def invalid_input(fields: dict[str, str]) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": "INVALID_INPUT", "fields": fields})


def failure(status_code: int, error: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": error})


def is_blank(text: str) -> bool:
    # 띄어쓰기, 탭, 줄바꿈 같은 빈칸 글자만 있으면 빈 글자로 본다 (API-SPEC 결정 기록 6)
    return text.strip() == ""


async def read_body(request: Request) -> dict | None:
    # 본문이 JSON이 아니라고 적힌 요청은 받지 않는다 (API-SPEC 결정 기록 20)
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type != "application/json":
        return None
    # 본문이 JSON 객체가 아니면 None (API-SPEC "요청 본문")
    try:
        body = await request.json()
    except ValueError:
        return None
    return body if isinstance(body, dict) else None


def login_user(request: Request, read_failure: str) -> int | JSONResponse:
    """로그인한 계정 번호를 돌려준다. 로그인하지 않았으면 401 응답을 돌려준다.

    카드 요청은 이 검사를 가장 먼저 한다 (API-SPEC "검사 순서").
    로그인 기록을 읽지 못하면 read_failure(LOAD_FAILED 또는 SAVE_FAILED)로 응답한다.
    """
    token = request.cookies.get(auth.COOKIE_NAME)
    if not token:
        return failure(401, "NOT_LOGGED_IN")
    conn = db.connect()
    try:
        row, refresh = auth.find_session(conn, token)
    except sqlite3.Error:
        return failure(500, read_failure)
    finally:
        conn.close()
    if row is None:
        return failure(401, "NOT_LOGGED_IN")
    if refresh:
        request.state.refresh_token = token
    request.state.username = row["username"]
    return row["user_id"]


def check_account(body: dict, signup: bool) -> dict[str, str]:
    # 가입은 규칙까지 보고, 로그인은 형식만 본다 (API-SPEC "서버 입력 검사")
    fields: dict[str, str] = {}
    for name in ("username", "password"):
        if name not in body:
            fields[name] = "MISSING"
        elif not isinstance(body[name], str):
            fields[name] = "WRONG_TYPE"
    if signup:
        if "username" not in fields and USERNAME_PATTERN.fullmatch(body["username"]) is None:
            fields["username"] = "BAD_FORMAT"
        if "password" not in fields and len(body["password"]) < PASSWORD_MIN:
            fields["password"] = "TOO_SHORT"
    return fields


def logged_in(status_code: int, username: str, token: str) -> JSONResponse:
    response = JSONResponse(status_code=status_code, content={"username": username})
    auth.set_cookie(response, token)
    return response


# 로그인 확인 (API-SPEC 결정 기록 13)
@app.get("/api/auth/me")
def me(request: Request):
    user = login_user(request, "LOAD_FAILED")
    if isinstance(user, JSONResponse):
        return user
    return {"username": request.state.username}


# 회원가입: 계정과 로그인 기록을 함께 저장하고 쿠키를 준다 (API-SPEC "사용자 행동 계약", R-029)
@app.post("/api/auth/signup", status_code=201)
async def signup(request: Request):
    body = await read_body(request)
    if body is None:
        return invalid_input({})
    fields = check_account(body, signup=True)
    if fields:
        return invalid_input(fields)
    username = body["username"]
    salt, hashed = auth.new_password(body["password"])

    conn = db.connect()
    try:
        with conn:
            if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
                return failure(409, "USERNAME_TAKEN")
            cursor = conn.execute(
                "INSERT INTO users (username, password_salt, password_hash) VALUES (?, ?, ?)",
                (username, salt, hashed),
            )
            token = auth.start_session(conn, cursor.lastrowid, request.cookies.get(auth.COOKIE_NAME))
    except sqlite3.IntegrityError:
        # 같은 아이디가 거의 같은 때에 먼저 저장된 경우
        return failure(409, "USERNAME_TAKEN")
    except sqlite3.Error:
        return failure(500, "SAVE_FAILED")
    finally:
        conn.close()
    return logged_in(201, username, token)


# 로그인: 아이디가 없는지 비밀번호가 틀렸는지 나누지 않는다 (R-028)
@app.post("/api/auth/login")
async def login(request: Request):
    body = await read_body(request)
    if body is None:
        return invalid_input({})
    fields = check_account(body, signup=False)
    if fields:
        return invalid_input(fields)
    username, password = body["username"], body["password"]

    conn = db.connect()
    try:
        user = conn.execute(
            "SELECT id, password_salt, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
        if user is None:
            auth.burn_password_time(password)
            return failure(401, "LOGIN_FAILED")
        if not auth.check_password(password, user["password_salt"], user["password_hash"]):
            return failure(401, "LOGIN_FAILED")
        with conn:
            token = auth.start_session(conn, user["id"], request.cookies.get(auth.COOKIE_NAME))
    except sqlite3.Error:
        return failure(500, "SAVE_FAILED")
    finally:
        conn.close()
    return logged_in(200, username, token)


# 로그아웃: 이 브라우저의 로그인 기록만 지운다. 로그인하지 않았어도 204 (R-033, API-SPEC "엔드포인트")
@app.post("/api/auth/logout", status_code=204)
def logout(request: Request):
    token = request.cookies.get(auth.COOKIE_NAME)
    if token:
        conn = db.connect()
        try:
            with conn:
                auth.end_session(conn, token)
        except sqlite3.Error:
            return failure(500, "SAVE_FAILED")
        finally:
            conn.close()
    response = Response(status_code=204)
    auth.clear_cookie(response)
    return response


def check_title_description(body: dict) -> dict[str, str]:
    # 만들기와 내용 수정이 함께 쓰는 검사 (API-SPEC "서버 입력 검사")
    # 틀린 칸은 모두 모아 돌려준다 (API-SPEC 결정 기록 11)
    # 정해지지 않은 필드(status, id 등)는 쓰지 않는다 (API-SPEC "정해지지 않은 필드")
    fields: dict[str, str] = {}
    if "title" not in body:
        fields["title"] = "MISSING"
    elif not isinstance(body["title"], str):
        fields["title"] = "WRONG_TYPE"
    elif is_blank(body["title"]):
        fields["title"] = "EMPTY"
    if "description" not in body:
        fields["description"] = "MISSING"
    elif body["description"] is not None and not isinstance(body["description"], str):
        fields["description"] = "WRONG_TYPE"
    return fields


def title_description(body: dict) -> tuple[str, str | None]:
    # 적은 글은 그대로 저장하고, 빈칸 글자만 든 설명은 null로 바꾼다 (API-SPEC 결정 기록 7)
    description = body["description"]
    if description is not None and is_blank(description):
        description = None
    return body["title"], description


def parse_id(raw: str) -> int | None:
    # 주소의 {id}가 숫자가 아니면 None (API-SPEC "서버 입력 검사" {id})
    if re.fullmatch(r"-?[0-9]+", raw) is None:
        return None
    return int(raw)


# 목록 보기: position이 작은 카드부터 (API-SPEC "엔드포인트", D-020)
@app.get("/api/tasks")
def list_tasks(request: Request):
    user = login_user(request, "LOAD_FAILED")
    if isinstance(user, JSONResponse):
        return user
    conn = db.connect()
    try:
        # 로그인한 계정의 카드만 (A-9)
        rows = conn.execute(
            f"SELECT {TASK_COLUMNS} FROM tasks WHERE user_id = ? ORDER BY position ASC", (user,)
        ).fetchall()
    except sqlite3.Error:
        # 저장소에서 읽지 못했다 (API-SPEC "실패 응답" LOAD_FAILED)
        return JSONResponse(status_code=500, content={"error": "LOAD_FAILED"})
    finally:
        conn.close()
    return [dict(row) for row in rows]


# 새 카드 만들기 (API-SPEC "사용자 행동 계약", "서버 입력 검사")
@app.post("/api/tasks", status_code=201)
async def create_task(request: Request):
    user = login_user(request, "SAVE_FAILED")
    if isinstance(user, JSONResponse):
        return user
    body = await read_body(request)
    if body is None:
        return invalid_input({})
    fields = check_title_description(body)
    if fields:
        return invalid_input(fields)
    title, description = title_description(body)

    conn = db.connect()
    try:
        # 카드 넣기와 last_position 올리기는 함께 저장한다 (DATA-MODEL "순서 번호 기억 표")
        with conn:
            conn.execute("UPDATE position_counter SET last_position = last_position + 1")
            position = conn.execute("SELECT last_position FROM position_counter").fetchone()[0]
            cursor = conn.execute(
                "INSERT INTO tasks (title, description, status, position, user_id)"
                " VALUES (?, ?, 'TODO', ?, ?)",
                (title, description, position, user),
            )
            row = conn.execute(
                f"SELECT {TASK_COLUMNS} FROM tasks WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
    except sqlite3.Error:
        return JSONResponse(status_code=500, content={"error": "SAVE_FAILED"})
    finally:
        conn.close()
    return dict(row)


# 상태 바꾸기 (API-SPEC "사용자 행동 계약", 결정 기록 5)
@app.patch("/api/tasks/{task_id}/status")
async def change_status(task_id: str, request: Request):
    user = login_user(request, "SAVE_FAILED")
    if isinstance(user, JSONResponse):
        return user
    id_ = parse_id(task_id)
    if id_ is None:
        return invalid_input({"id": "WRONG_TYPE"})
    body = await read_body(request)
    if body is None:
        return invalid_input({})
    # 세 상태 값만 받는다 (DATA-MODEL 결정 기록 3)
    if "status" not in body:
        return invalid_input({"status": "MISSING"})
    status = body["status"]
    if status not in STATUSES:
        return invalid_input({"status": "NOT_ALLOWED"})

    conn = db.connect()
    try:
        with conn:
            # 다른 계정의 카드는 없는 카드와 같다 (A-10)
            row = conn.execute(
                f"SELECT {TASK_COLUMNS} FROM tasks WHERE id = ? AND user_id = ?", (id_, user)
            ).fetchone()
            if row is None:
                return JSONResponse(status_code=404, content={"error": "NOT_FOUND"})
            # 지금과 같은 상태면 아무것도 바꾸지 않는다 (API-SPEC 결정 기록 5)
            if row["status"] == status:
                return dict(row)
            # 상태와 새 position, last_position은 함께 저장한다 (DATA-MODEL "순서 번호 기억 표")
            conn.execute("UPDATE position_counter SET last_position = last_position + 1")
            position = conn.execute("SELECT last_position FROM position_counter").fetchone()[0]
            conn.execute(
                "UPDATE tasks SET status = ?, position = ? WHERE id = ?", (status, position, id_)
            )
            row = conn.execute(f"SELECT {TASK_COLUMNS} FROM tasks WHERE id = ?", (id_,)).fetchone()
    except sqlite3.Error:
        return JSONResponse(status_code=500, content={"error": "SAVE_FAILED"})
    finally:
        conn.close()
    return dict(row)


# 내용 수정: title과 description만 바꾸고 순서는 그대로 둔다 (API-SPEC "사용자 행동 계약", R-008)
# 검사 순서: 로그인 → {id} 형식 → 본문 → 그 계정에 카드가 있는지 (API-SPEC "검사 순서")
@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, request: Request):
    user = login_user(request, "SAVE_FAILED")
    if isinstance(user, JSONResponse):
        return user
    id_ = parse_id(task_id)
    if id_ is None:
        return invalid_input({"id": "WRONG_TYPE"})
    body = await read_body(request)
    if body is None:
        return invalid_input({})
    fields = check_title_description(body)
    if fields:
        return invalid_input(fields)
    title, description = title_description(body)

    conn = db.connect()
    try:
        with conn:
            cursor = conn.execute(
                "UPDATE tasks SET title = ?, description = ? WHERE id = ? AND user_id = ?",
                (title, description, id_, user),
            )
            if cursor.rowcount == 0:
                return JSONResponse(status_code=404, content={"error": "NOT_FOUND"})
            row = conn.execute(f"SELECT {TASK_COLUMNS} FROM tasks WHERE id = ?", (id_,)).fetchone()
    except sqlite3.Error:
        return JSONResponse(status_code=500, content={"error": "SAVE_FAILED"})
    finally:
        conn.close()
    return dict(row)


# 삭제: 되돌릴 수 없고, last_position은 줄이지 않는다 (API-SPEC "사용자 행동 계약", D-004)
@app.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: str, request: Request):
    user = login_user(request, "SAVE_FAILED")
    if isinstance(user, JSONResponse):
        return user
    id_ = parse_id(task_id)
    if id_ is None:
        return invalid_input({"id": "WRONG_TYPE"})

    conn = db.connect()
    try:
        with conn:
            cursor = conn.execute("DELETE FROM tasks WHERE id = ? AND user_id = ?", (id_, user))
            if cursor.rowcount == 0:
                return JSONResponse(status_code=404, content={"error": "NOT_FOUND"})
    except sqlite3.Error:
        return JSONResponse(status_code=500, content={"error": "SAVE_FAILED"})
    finally:
        conn.close()
    return Response(status_code=204)


# 다 만든 뒤에는 FastAPI가 빌드된 화면 파일도 내보낸다 (D-013).
# /api 요청은 위의 엔드포인트가 먼저 받고, 그 밖의 주소는 화면 파일이다 (API-SPEC "주소 앞부분").
# 만드는 동안(D-011)처럼 화면을 빌드하지 않았으면 /api만 동작한다.
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    logging.getLogger("uvicorn.error").warning(
        "화면 빌드 파일이 없습니다 (%s). /api만 동작합니다.", FRONTEND_DIST
    )
