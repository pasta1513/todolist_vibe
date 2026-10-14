import { useEffect, useState } from "react";
import { fetchTasks, type Task, type TaskStatus } from "./api";
import CreateDialog from "./CreateDialog";

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
  // 새 카드는 가장 큰 position을 받으므로 맨 앞에 놓으면 "할 일" 칸 맨 위가 된다 (R-008)
  function handleCreated(task: Task) {
    setTasks((prev) => [task, ...prev]);
    setCreating(false);
  }

  return (
    <>
      <button type="button" onClick={() => setCreating(true)}>
        새 카드
      </button>
      <main style={{ display: "flex", gap: "16px" }}>
        {COLUMNS.map((column) => (
          <section key={column.status} style={{ flex: 1 }}>
            <h2>{column.title}</h2>
            {/* 서버가 준 순서대로 놓는다 (D-015) */}
            {tasks
              .filter((task) => task.status === column.status)
              .map((task) => (
                <article key={task.id}>
                  <h3>{task.title}</h3>
                  {task.description !== null && <p>{task.description}</p>}
                </article>
              ))}
          </section>
        ))}
      </main>
      {creating && <CreateDialog onCreated={handleCreated} onClose={() => setCreating(false)} />}
    </>
  );
}
