import re
import sqlite3
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

import db

TASK_COLUMNS = "id, title, description, status, position"
STATUSES = ("TODO", "IN_PROGRESS", "DONE")


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


async def read_body(request: Request) -> dict | None:
    # 본문이 JSON 객체가 아니면 None (API-SPEC "요청 본문")
    try:
        body = await request.json()
    except ValueError:
        return None
    return body if isinstance(body, dict) else None


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
def list_tasks():
    conn = db.connect()
    try:
        rows = conn.execute(f"SELECT {TASK_COLUMNS} FROM tasks ORDER BY position ASC").fetchall()
    finally:
        conn.close()
    return [dict(row) for row in rows]


# 새 카드 만들기 (API-SPEC "사용자 행동 계약", "서버 입력 검사")
@app.post("/api/tasks", status_code=201)
async def create_task(request: Request):
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


# 상태 바꾸기 (API-SPEC "사용자 행동 계약", 결정 기록 5)
@app.patch("/api/tasks/{task_id}/status")
async def change_status(task_id: str, request: Request):
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
            row = conn.execute(f"SELECT {TASK_COLUMNS} FROM tasks WHERE id = ?", (id_,)).fetchone()
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
# 검사 순서: {id} 형식 → 본문 → 카드가 있는지 (API-SPEC "검사 순서")
@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, request: Request):
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
                "UPDATE tasks SET title = ?, description = ? WHERE id = ?", (title, description, id_)
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
def delete_task(task_id: str):
    id_ = parse_id(task_id)
    if id_ is None:
        return invalid_input({"id": "WRONG_TYPE"})

    conn = db.connect()
    try:
        with conn:
            cursor = conn.execute("DELETE FROM tasks WHERE id = ?", (id_,))
            if cursor.rowcount == 0:
                return JSONResponse(status_code=404, content={"error": "NOT_FOUND"})
    except sqlite3.Error:
        return JSONResponse(status_code=500, content={"error": "SAVE_FAILED"})
    finally:
        conn.close()
    return Response(status_code=204)
