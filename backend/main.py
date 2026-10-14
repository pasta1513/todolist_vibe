import sqlite3
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

import db

TASK_COLUMNS = "id, title, description, status, position"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(lifespan=lifespan)


# 입력 오류 응답 (API-SPEC "실패 응답")
def invalid_input(fields: dict[str, str]) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": "INVALID_INPUT", "fields": fields})


def is_blank(text: str) -> bool:
    # 띄어쓰기, 탭, 줄바꿈 같은 빈칸 글자만 있으면 빈 글자로 본다 (API-SPEC 결정 기록 6)
    return text.strip() == ""


# 목록 보기: position이 큰 카드부터 (API-SPEC "엔드포인트")
@app.get("/api/tasks")
def list_tasks():
    conn = db.connect()
    try:
        rows = conn.execute(f"SELECT {TASK_COLUMNS} FROM tasks ORDER BY position DESC").fetchall()
    finally:
        conn.close()
    return [dict(row) for row in rows]


# 새 카드 만들기 (API-SPEC "사용자 행동 계약", "서버 입력 검사")
@app.post("/api/tasks", status_code=201)
async def create_task(request: Request):
    try:
        body = await request.json()
    except ValueError:
        return invalid_input({})
    # 본문이 JSON 객체가 아니면 거절한다 (API-SPEC "요청 본문")
    if not isinstance(body, dict):
        return invalid_input({})

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
    if fields:
        return invalid_input(fields)

    # 적은 글은 그대로 저장하고, 빈칸 글자만 든 설명은 null로 바꾼다 (API-SPEC 결정 기록 7)
    title = body["title"]
    description = body["description"]
    if description is not None and is_blank(description):
        description = None

    conn = db.connect()
    try:
        # 카드 넣기와 last_position 올리기는 함께 저장한다 (DATA-MODEL "순서 번호 기억 표")
        with conn:
            conn.execute("UPDATE position_counter SET last_position = last_position + 1")
            position = conn.execute("SELECT last_position FROM position_counter").fetchone()[0]
            cursor = conn.execute(
                "INSERT INTO tasks (title, description, status, position) VALUES (?, ?, 'TODO', ?)",
                (title, description, position),
            )
            row = conn.execute(
                f"SELECT {TASK_COLUMNS} FROM tasks WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
    except sqlite3.Error:
        return JSONResponse(status_code=500, content={"error": "SAVE_FAILED"})
    finally:
        conn.close()
    return dict(row)
