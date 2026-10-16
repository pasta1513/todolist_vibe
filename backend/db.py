import os
import sqlite3
from pathlib import Path

# 저장 파일 위치: backend/data/todo.db
# 시험할 때는 환경 변수 TODO_DB_PATH로 다른 파일을 쓴다
DB_PATH = Path(os.environ.get("TODO_DB_PATH") or Path(__file__).parent / "data" / "todo.db")

# 표 모양은 DATA-MODEL.md "SQLite 변환 초안"과 같다 (두 번째 버전)
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE
        CHECK (length(username) BETWEEN 4 AND 20 AND username NOT GLOB '*[^a-z0-9]*'),
    password_salt BLOB NOT NULL,
    password_hash BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK (trim(title) <> ''),
    description TEXT DEFAULT NULL CHECK (description IS NULL OR trim(description) <> ''),
    status TEXT NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE')),
    position INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    last_used_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS position_counter (
    last_position INTEGER NOT NULL DEFAULT 0
);
"""


class OldDatabaseError(RuntimeError):
    """저장 파일이 첫 버전 모양이다 (DATA-MODEL 결정 기록 16)"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # SQLite는 REFERENCES 검사를 기본으로 하지 않는다 (DATA-MODEL "로그인 기록 표")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def is_old_format() -> bool:
    # tasks 표가 있는데 user_id가 없으면 첫 버전 모양이다. 읽기만 한다
    conn = sqlite3.connect(DB_PATH)
    try:
        has_tasks = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tasks'"
        ).fetchone()
        if has_tasks is None:
            return False
        columns = [row[1] for row in conn.execute("PRAGMA table_info(tasks)")]
        return "user_id" not in columns
    finally:
        conn.close()


def init_db() -> None:
    # 옛 모양 저장 파일이면 아무것도 쓰지 않고 멈춘다 (DATA-MODEL 결정 기록 16)
    if DB_PATH.exists() and is_old_format():
        raise OldDatabaseError(
            f"저장 파일이 첫 버전 모양이라 서버를 켜지 않습니다: {DB_PATH}\n"
            "PLAN.md P-26대로 저장 파일을 정리한 뒤 다시 켜 주세요. 파일은 바꾸지 않았습니다."
        )
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(SCHEMA)
        # position_counter에는 줄을 하나만 두고, 모든 계정이 함께 쓴다 (DATA-MODEL 결정 기록 14)
        if conn.execute("SELECT COUNT(*) FROM position_counter").fetchone()[0] == 0:
            conn.execute("INSERT INTO position_counter (last_position) VALUES (0)")
    conn.close()
