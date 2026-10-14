from contextlib import asynccontextmanager

from fastapi import FastAPI

import db


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(lifespan=lifespan)


# 목록 보기: position이 큰 카드부터 (API-SPEC "엔드포인트")
@app.get("/api/tasks")
def list_tasks():
    conn = db.connect()
    try:
        rows = conn.execute(
            "SELECT id, title, description, status, position FROM tasks ORDER BY position DESC"
        ).fetchall()
    finally:
        conn.close()
    return [dict(row) for row in rows]
