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

// 목록 보기: position이 큰 카드부터 온다 (D-015)
export async function fetchTasks(): Promise<Task[]> {
  const res = await fetch("/api/tasks");
  if (!res.ok) {
    throw new Error(`GET /api/tasks failed: ${res.status}`);
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
