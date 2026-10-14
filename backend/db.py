import os
import sqlite3
from pathlib import Path

# 저장 파일 위치: backend/data/todo.db
# 시험할 때는 환경 변수 TODO_DB_PATH로 다른 파일을 쓴다
DB_PATH = Path(os.environ.get("TODO_DB_PATH") or Path(__file__).parent / "data" / "todo.db")

# 표 모양은 DATA-MODEL.md "SQLite 변환 초안"과 같다
SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK (trim(title) <> ''),
    description TEXT DEFAULT NULL CHECK (description IS NULL OR trim(description) <> ''),
    status TEXT NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE')),
    position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS position_counter (
    last_position INTEGER NOT NULL DEFAULT 0
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(SCHEMA)
        # position_counter에는 줄을 하나만 둔다
        if conn.execute("SELECT COUNT(*) FROM position_counter").fetchone()[0] == 0:
            conn.execute("INSERT INTO position_counter (last_position) VALUES (0)")
    conn.close()
