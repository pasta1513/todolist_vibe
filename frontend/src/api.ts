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

// 실패 종류 (API-SPEC "실패 응답"). CONNECTION은 "연결 안 됨"이다
const FAILURES = [
  "INVALID_INPUT",
  "NOT_FOUND",
  "SAVE_FAILED",
  "LOAD_FAILED",
  // 두 번째 버전 (API-SPEC "실패 응답")
  "NOT_LOGGED_IN",
  "LOGIN_FAILED",
  "USERNAME_TAKEN",
] as const;
export type ApiFailure = (typeof FAILURES)[number] | "CONNECTION";

export class ApiError extends Error {
  readonly kind: ApiFailure;

  constructor(kind: ApiFailure) {
    super(kind);
    this.kind = kind;
  }
}

// 응답이 오지 않거나, 실패 응답에 실패 종류 이름이 없으면 "연결 안 됨"으로 본다 (API-SPEC "실패 응답")
async function request(url: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("CONNECTION");
  }
  if (!res.ok) {
    throw new ApiError(await failureOf(res));
  }
  return res;
}

async function failureOf(res: Response): Promise<ApiFailure> {
  try {
    const body = await res.json();
    const kind = FAILURES.find((name) => name === body?.error);
    if (kind) {
      return kind;
    }
  } catch {
    // 만드는 동안 서버가 꺼지면 Vite 프록시가 502를 글자로 돌려준다
  }
  return "CONNECTION";
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// 목록 보기: position이 작은 카드부터 온다 (D-015, D-020)
export async function fetchTasks(): Promise<Task[]> {
  return (await request("/api/tasks")).json();
}

// 상태 바꾸기: 바뀐 카드를 돌려받는다 (API-SPEC "엔드포인트")
export async function changeStatus(id: number, status: TaskStatus): Promise<Task> {
  return (await request(`/api/tasks/${id}/status`, jsonInit("PATCH", { status }))).json();
}

// 새 카드 만들기: 설명이 없으면 null을 보낸다 (API-SPEC S-8)
export async function createTask(title: string, description: string | null): Promise<Task> {
  return (await request("/api/tasks", jsonInit("POST", { title, description }))).json();
}

// 내용 수정: 제목과 설명을 함께 보낸다 (API-SPEC S-7)
export async function updateTask(id: number, title: string, description: string | null): Promise<Task> {
  return (await request(`/api/tasks/${id}`, jsonInit("PATCH", { title, description }))).json();
}

// 삭제: 성공하면 204, 응답 본문은 읽지 않는다 (API-SPEC 결정 기록 10)
export async function deleteTask(id: number): Promise<void> {
  await request(`/api/tasks/${id}`, { method: "DELETE" });
}

// 로그인한 계정 (API-SPEC "엔드포인트" /api/auth/…)
// 로그인 상태는 서버가 준 쿠키에 맡기고, 화면 코드는 쿠키를 다루지 않는다 (ARCHITECTURE A-6)
export type Account = {
  username: string;
};

// 로그인 확인: 로그인하지 않았으면 NOT_LOGGED_IN (API-SPEC 결정 기록 13)
export async function fetchMe(): Promise<Account> {
  return (await request("/api/auth/me")).json();
}

// 회원가입: 성공하면 바로 로그인된다 (R-029)
export async function signup(username: string, password: string): Promise<Account> {
  return (await request("/api/auth/signup", jsonInit("POST", { username, password }))).json();
}

export async function login(username: string, password: string): Promise<Account> {
  return (await request("/api/auth/login", jsonInit("POST", { username, password }))).json();
}

// 로그아웃: 성공하면 204, 응답 본문은 읽지 않는다
export async function logout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST" });
}
