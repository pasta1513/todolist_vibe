import { useState, type FormEvent } from "react";
import { createTask, type Task } from "./api";
import { isBlank } from "./text";

type Props = {
  onCreated: (task: Task) => void;
  onClose: () => void;
};

// 새 카드 만들기 창 (SCREEN-SPEC "2. 새 카드 만들기", D-017)
// 닫으면 이 창이 사라지면서 적던 내용도 함께 지워진다 (R-019)
export default function CreateDialog({ onCreated, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showTitleHint, setShowTitleHint] = useState(false);
  const [pending, setPending] = useState(false);

  function handleTitleChange(value: string) {
    setTitle(value);
    // 빈칸이 아닌 글자를 적으면 안내가 바로 사라진다. 다시 비워도 바로 나오지 않는다
    if (showTitleHint && !isBlank(value)) {
      setShowTitleHint(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isBlank(title)) {
      // 서버에는 보내지 않는다 (SCREEN-SPEC 규칙 "빈 제목 안내")
      setShowTitleHint(true);
      return;
    }
    // 응답을 받을 때까지 만들기·닫기를 누를 수 없다 (SCREEN-SPEC 규칙 "만들기 요청 중")
    setPending(true);
    try {
      const task = await createTask(title, description === "" ? null : description);
      onCreated(task);
    } catch (err) {
      // 실패하면 창과 적은 내용을 그대로 둔다 (D-017). 실패 알림은 P-18에서 만든다
      console.error(err);
      setPending(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="새 카드 만들기"
        onSubmit={handleSubmit}
        style={{ background: "white", padding: "16px", minWidth: "320px" }}
      >
        <div>
          <label>
            제목{" "}
            <input value={title} onChange={(e) => handleTitleChange(e.target.value)} autoFocus />
          </label>{" "}
          {showTitleHint && <span role="alert">제목을 적어 주세요</span>}
        </div>
        <div>
          <label>
            설명
            <br />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </label>
        </div>
        <div>
          <button type="submit" disabled={pending}>
            만들기
          </button>{" "}
          <button type="button" onClick={onClose} disabled={pending}>
            닫기
          </button>
        </div>
      </form>
    </div>
  );
}
