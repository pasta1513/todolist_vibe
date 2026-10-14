import { useEffect, useState } from "react";
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

  useEffect(() => {
    // 실패 알림은 P-18에서 만든다
    fetchTasks()
      .then(setTasks)
      .catch((err) => console.error(err));
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
                <TaskCard key={task.id} task={task} onChanged={handleChanged} />
              ))}
          </section>
        ))}
      </main>
      {creating && <CreateDialog onCreated={handleCreated} onClose={() => setCreating(false)} />}
    </>
  );
}
