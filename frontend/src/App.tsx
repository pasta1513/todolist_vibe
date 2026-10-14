import { useEffect, useRef, useState } from "react";
import Alerts, { failureMessage, LOAD_FAILED_MESSAGE, type Alert } from "./Alerts";
import { fetchTasks, type Task, type TaskStatus } from "./api";
import CreateDialog from "./CreateDialog";
import TaskCard from "./TaskCard";
import "./App.css";

// 세 칸 보드 (SCREEN-SPEC "1. 세 칸 보드", R-007)
const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: "TODO", title: "할 일" },
  { status: "IN_PROGRESS", title: "진행 중" },
  { status: "DONE", title: "완료" },
];

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [creating, setCreating] = useState(false);
  // 한 번에 한 장만 고친다 (D-018)
  const [editingId, setEditingId] = useState<number | null>(null);
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

  function handleFailure(err: unknown) {
    console.error(err);
    addAlert(failureMessage(err));
  }

  useEffect(() => {
    // 목록을 못 불러오면 "카드가 없음"과 구별되게 알린다 (ARCHITECTURE A-5)
    fetchTasks()
      .then(setTasks)
      .catch((err) => {
        console.error(err);
        addAlert(LOAD_FAILED_MESSAGE, true);
      });
  }, []);

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

  return (
    <>
      <button type="button" onClick={() => setCreating(true)}>
        새 카드
      </button>
      <main className="board">
        {COLUMNS.map((column) => (
          <section key={column.status} className="column">
            <h2>{column.title}</h2>
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
    </>
  );
}
