import { useEffect, useRef, useState } from "react";
import Alerts, {
  failureMessage,
  isFailure,
  LOAD_FAILED_MESSAGE,
  LOGOUT_FAILED_MESSAGE,
  type Alert,
} from "./Alerts";
import { fetchMe, fetchTasks, logout, type Account, type Task, type TaskStatus } from "./api";
import AuthScreen from "./AuthScreen";
import CreateDialog from "./CreateDialog";
import TaskCard from "./TaskCard";
import "./App.css";

// 세 칸 보드 (SCREEN-SPEC "1. 세 칸 보드", R-007)
const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: "TODO", title: "할 일" },
  { status: "IN_PROGRESS", title: "진행 중" },
  { status: "DONE", title: "완료" },
];

// 로그인 확인 전(checking), 확인 실패(failed), 로그인 안 됨(loggedOut), 로그인됨(Account)
type Session = "checking" | "failed" | "loggedOut" | Account;

export default function App() {
  const [session, setSession] = useState<Session>("checking");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [creating, setCreating] = useState(false);
  // 한 번에 한 장만 고친다 (D-018)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const nextAlertId = useRef(1);

  // 알림은 5초 뒤 사라진다. 목록 불러오기 실패 알림만 남는다 (SCREEN-SPEC 대안과 결정 8)
  function addAlert(message: string, persistent = false) {
    const id = nextAlertId.current++;
    // 사라지지 않는 알림은 같은 문구를 두 번 쌓지 않는다
    setAlerts((prev) =>
      persistent && prev.some((alert) => alert.message === message) ? prev : [...prev, { id, message }],
    );
    if (!persistent) {
      setTimeout(() => setAlerts((prev) => prev.filter((alert) => alert.id !== id)), 5000);
    }
  }

  // 로그인 화면으로 돌아간다. 보드, 만들기 창, 고치던 내용은 모두 비운다
  // (SCREEN-SPEC 규칙 "로그인이 풀렸을 때", "로그아웃과 적던 내용")
  function showLogin() {
    setSession("loggedOut");
    setTasks([]);
    setCreating(false);
    setEditingId(null);
  }

  function handleFailure(err: unknown) {
    console.error(err);
    // 쓰는 중에 로그인이 풀리면 로그인 화면으로 바꾼다 (SCREEN-SPEC 대안과 결정 16)
    if (isFailure(err, "NOT_LOGGED_IN")) {
      showLogin();
    }
    addAlert(failureMessage(err));
  }

  // 목록을 못 불러오면 "카드가 없음"과 구별되게 알린다 (ARCHITECTURE A-5)
  function loadTasks() {
    fetchTasks()
      .then(setTasks)
      .catch((err) => {
        console.error(err);
        if (isFailure(err, "NOT_LOGGED_IN")) {
          showLogin();
          addAlert(failureMessage(err));
        } else {
          addAlert(LOAD_FAILED_MESSAGE, true);
        }
      });
  }

  useEffect(() => {
    // 앱을 열면 먼저 로그인을 확인한다 (ARCHITECTURE 흐름 8, API-SPEC 결정 기록 13)
    fetchMe()
      .then((account) => {
        setSession(account);
        loadTasks();
      })
      .catch((err) => {
        if (isFailure(err, "NOT_LOGGED_IN")) {
          setSession("loggedOut");
          return;
        }
        // 서버 문제를 로그인 문제로 착각하지 않게, 로그인 화면 대신 사라지지 않는 알림을 보인다
        // (SCREEN-SPEC 규칙 "앱을 열 때 로그인 확인 실패", 대안과 결정 17)
        console.error(err);
        setSession("failed");
        addAlert(LOAD_FAILED_MESSAGE, true);
      });
  }, []);

  // 로그인·가입에 성공하면 그 계정의 보드를 연다 (R-021, R-029)
  function handleLoggedIn(account: Account) {
    setSession(account);
    setTasks([]);
    loadTasks();
  }

  // 묻지 않고 로그아웃한다 (SCREEN-SPEC 대안과 결정 13)
  async function handleLogout() {
    setLogoutPending(true);
    try {
      await logout();
      showLogin();
    } catch (err) {
      console.error(err);
      // 실패하면 로그인된 채로 있다 (SCREEN-SPEC "5. 실패 알림")
      addAlert(isFailure(err, "SAVE_FAILED") ? LOGOUT_FAILED_MESSAGE : failureMessage(err));
    } finally {
      setLogoutPending(false);
    }
  }

  // 서버가 성공을 응답한 뒤에만 카드를 더한다 (D-014)
  // 새 카드는 가장 큰 position을 받으므로 맨 끝에 놓으면 "할 일" 칸 맨 아래가 된다 (R-008, D-020)
  function handleCreated(task: Task) {
    setTasks((prev) => [...prev, task]);
    setCreating(false);
  }

  // 바뀐 카드를 넣고 position이 작은 순서로 다시 놓는다.
  // 상태가 바뀐 카드는 가장 큰 position을 받아 새 칸 맨 아래에 온다 (D-015, R-008, D-020)
  function handleChanged(changed: Task) {
    setTasks((prev) =>
      prev
        .map((task) => (task.id === changed.id ? changed : task))
        .sort((a, b) => a.position - b.position),
    );
  }

  // 서버가 지우기에 성공했거나, 카드가 이미 없다고 응답했을 때 카드를 뺀다 (D-014, D-021)
  // 그 카드를 고치는 중이었으면 입력칸도 닫는다
  function handleDeleted(id: number) {
    setTasks((prev) => prev.filter((task) => task.id !== id));
    setEditingId((current) => (current === id ? null : current));
  }

  // 로그인 확인 전에는 아무것도 보이지 않는다 (SCREEN-SPEC 열린 질문 6)
  if (session === "checking" || session === "failed") {
    return (
      <div className="app">
        <Alerts alerts={alerts} />
      </div>
    );
  }

  if (session === "loggedOut") {
    return (
      <div className="app">
        <AuthScreen onLoggedIn={handleLoggedIn} onFailure={handleFailure} />
        <Alerts alerts={alerts} />
      </div>
    );
  }

  return (
    <div className="app">
      {/* 보드 위쪽 오른쪽에 로그인한 아이디와 로그아웃 (SCREEN-SPEC "8. 계정 줄") */}
      <div className="account-bar">
        <span className="account-name">{session.username}</span>
        <button type="button" className="btn" onClick={handleLogout} disabled={logoutPending}>
          로그아웃
        </button>
      </div>
      <div className="toolbar">
        <button type="button" className="btn btn-large btn-primary" onClick={() => setCreating(true)}>
          새 카드
        </button>
      </div>
      <main className="board">
        {COLUMNS.map((column) => (
          <section key={column.status} className="column">
            <h2 className="column-title">{column.title}</h2>
            {/* 서버가 준 순서대로 놓는다 (D-015) */}
            {tasks
              .filter((task) => task.status === column.status)
              .map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  editing={editingId === task.id}
                  editLocked={editingId !== null && editingId !== task.id}
                  onStartEdit={() => setEditingId(task.id)}
                  onEndEdit={() => setEditingId(null)}
                  onChanged={handleChanged}
                  onDeleted={handleDeleted}
                  onFailure={handleFailure}
                />
              ))}
          </section>
        ))}
      </main>
      {creating && (
        <CreateDialog
          onCreated={handleCreated}
          onClose={() => setCreating(false)}
          onFailure={handleFailure}
        />
      )}
      <Alerts alerts={alerts} />
    </div>
  );
}
