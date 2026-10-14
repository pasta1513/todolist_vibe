// 상태 값은 세 개뿐이다 (D-001, DATA-MODEL "상태 값")
export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

// 카드 모양 (API-SPEC "카드(Task) 모양")
export type Task = {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  position: number;
};

// 목록 보기: position이 작은 카드부터 온다 (D-015, D-020)
export async function fetchTasks(): Promise<Task[]> {
  const res = await fetch("/api/tasks");
  if (!res.ok) {
    throw new Error(`GET /api/tasks failed: ${res.status}`);
  }
  return res.json();
}

// 상태 바꾸기: 바뀐 카드를 돌려받는다 (API-SPEC "엔드포인트")
export async function changeStatus(id: number, status: TaskStatus): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw new Error(`PATCH /api/tasks/${id}/status failed: ${res.status}`);
  }
  return res.json();
}

// 새 카드 만들기: 설명이 없으면 null을 보낸다 (API-SPEC S-8)
export async function createTask(title: string, description: string | null): Promise<Task> {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description }),
  });
  if (!res.ok) {
    throw new Error(`POST /api/tasks failed: ${res.status}`);
  }
  return res.json();
}

// 내용 수정: 제목과 설명을 함께 보낸다 (API-SPEC S-7)
export async function updateTask(id: number, title: string, description: string | null): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description }),
  });
  if (!res.ok) {
    throw new Error(`PATCH /api/tasks/${id} failed: ${res.status}`);
  }
  return res.json();
}

// 삭제: 성공하면 204, 응답 본문은 읽지 않는다 (API-SPEC 결정 기록 10)
export async function deleteTask(id: number): Promise<void> {
  const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`DELETE /api/tasks/${id} failed: ${res.status}`);
  }
}
