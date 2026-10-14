import { useState } from "react";
import { changeStatus, type Task, type TaskStatus } from "./api";

// 상태 버튼 세 개 (SCREEN-SPEC 대안과 결정 9)
const STATUS_BUTTONS: { status: TaskStatus; label: string }[] = [
  { status: "TODO", label: "할 일" },
  { status: "IN_PROGRESS", label: "진행 중" },
  { status: "DONE", label: "완료" },
];

type Props = {
  task: Task;
  onChanged: (task: Task) => void;
};

// 카드 한 장 (SCREEN-SPEC "3. 카드 한 장")
export default function TaskCard({ task, onChanged }: Props) {
  const [pending, setPending] = useState(false);

  async function handleStatus(status: TaskStatus) {
    // 응답을 받을 때까지 이 카드의 상태 버튼을 누를 수 없다 (SCREEN-SPEC 규칙 "상태 바꾸기 요청 중")
    setPending(true);
    try {
      onChanged(await changeStatus(task.id, status));
    } catch (err) {
      // 실패하면 카드는 그대로 둔다 (D-014). 실패 알림은 P-18에서 만든다
      console.error(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <article>
      <h3>{task.title}</h3>
      {task.description !== null && <p>{task.description}</p>}
      <div>
        {STATUS_BUTTONS.map((button) => (
          <button
            key={button.status}
            type="button"
            // 지금 상태 버튼은 누를 수 없다
            disabled={pending || button.status === task.status}
            onClick={() => handleStatus(button.status)}
          >
            {button.label}
          </button>
        ))}
      </div>
    </article>
  );
}
