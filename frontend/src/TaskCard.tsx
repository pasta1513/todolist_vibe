import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { isNotFound } from "./Alerts";
import { changeStatus, deleteTask, updateTask, type Task, type TaskStatus } from "./api";
import { isBlank } from "./text";

// 상태 버튼 세 개 (SCREEN-SPEC 대안과 결정 9)
const STATUS_BUTTONS: { status: TaskStatus; label: string }[] = [
  { status: "TODO", label: "할 일" },
  { status: "IN_PROGRESS", label: "진행 중" },
  { status: "DONE", label: "완료" },
];

type Props = {
  task: Task;
  editing: boolean;
  // 다른 카드를 고치는 중이면 이 카드의 고치기를 누를 수 없다 (D-018)
  editLocked: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onChanged: (task: Task) => void;
  onDeleted: (id: number) => void;
  onFailure: (err: unknown) => void;
};

// 카드 한 장 (SCREEN-SPEC "3. 카드 한 장", "4. 카드 고치기")
export default function TaskCard({
  task,
  editing,
  editLocked,
  onStartEdit,
  onEndEdit,
  onChanged,
  onDeleted,
  onFailure,
}: Props) {
  const [statusPending, setStatusPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  async function handleStatus(status: TaskStatus) {
    // 응답을 받을 때까지 이 카드의 상태 버튼을 누를 수 없다 (SCREEN-SPEC 규칙 "상태 바꾸기 요청 중")
    setStatusPending(true);
    try {
      onChanged(await changeStatus(task.id, status));
    } catch (err) {
      handleFailure(err);
    } finally {
      setStatusPending(false);
    }
  }

  async function handleDelete() {
    // 응답을 받을 때까지 "삭제"와 "취소"를 누를 수 없다 (SCREEN-SPEC 규칙 "지우기 요청 중")
    setDeletePending(true);
    try {
      await deleteTask(task.id);
      onDeleted(task.id);
    } catch (err) {
      setDeletePending(false);
      handleFailure(err);
    }
  }

  // 실패하면 위쪽에 알리고 카드는 그대로 둔다 (D-014).
  // 카드가 이미 없다는 실패만은 카드를 화면에서 치운다 (D-021)
  function handleFailure(err: unknown) {
    onFailure(err);
    if (isNotFound(err)) {
      onDeleted(task.id);
    }
  }

  return (
    <article className="card">
      {editing ? (
        <EditForm task={task} onSaved={onChanged} onClose={onEndEdit} onFailure={handleFailure} />
      ) : (
        <>
          <h3 className="card-title">{task.title}</h3>
          {task.description !== null && <p className="card-description">{task.description}</p>}
        </>
      )}
      {confirmingDelete ? (
        // 지우기 전에 그 카드 자리에서 한 번 묻는다 (D-004, SCREEN-SPEC 규칙 "지울 때 확인 위치")
        <div>
          정말 삭제할까요?{" "}
          <button type="button" onClick={handleDelete} disabled={deletePending}>
            삭제
          </button>{" "}
          <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deletePending}>
            취소
          </button>
        </div>
      ) : (
        <div>
          {STATUS_BUTTONS.map((button) => (
            <button
              key={button.status}
              type="button"
              // 지금 상태 버튼과, 고치는 동안의 상태 버튼은 누를 수 없다 (D-018)
              disabled={editing || statusPending || button.status === task.status}
              onClick={() => handleStatus(button.status)}
            >
              {button.label}
            </button>
          ))}{" "}
          <button type="button" onClick={onStartEdit} disabled={editing || editLocked}>
            고치기
          </button>{" "}
          <button type="button" onClick={() => setConfirmingDelete(true)} disabled={editing}>
            지우기
          </button>
        </div>
      )}
    </article>
  );
}

type EditFormProps = {
  task: Task;
  onSaved: (task: Task) => void;
  onClose: () => void;
  onFailure: (err: unknown) => void;
};

// 카드 자리에서 바로 고친다 (D-018). 원래 제목과 설명이 채워진 채로 시작한다 (R-004)
function EditForm({ task, onSaved, onClose, onFailure }: EditFormProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
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
    // 응답을 받을 때까지 저장·취소를 누를 수 없다 (SCREEN-SPEC 규칙 "저장 요청 중")
    setPending(true);
    try {
      const saved = await updateTask(task.id, title, description === "" ? null : description);
      onSaved(saved);
      // 저장에 성공하면 입력칸을 닫는다 (SCREEN-SPEC 규칙 "고치기 저장 성공")
      onClose();
    } catch (err) {
      // 실패하면 입력칸과 적은 내용을 그대로 둔다 (SCREEN-SPEC 규칙 "고치기 저장 실패")
      setPending(false);
      onFailure(err);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>
          제목
          <AutoTextarea
            value={title}
            onChange={handleTitleChange}
            // 제목에는 Enter로 줄바꿈을 넣지 않는다 (SCREEN-SPEC 규칙 "고치기 입력칸")
            // 한국어 입력 조합을 끝내는 Enter는 막지 않는다
            onEnter={(e) => {
              if (!e.nativeEvent.isComposing) {
                e.preventDefault();
              }
            }}
            autoFocus
          />
        </label>
        {showTitleHint && <span role="alert">제목을 적어 주세요</span>}
      </div>
      <div>
        <label>
          설명
          <AutoTextarea value={description} onChange={setDescription} />
        </label>
      </div>
      <div>
        <button type="submit" disabled={pending}>
          저장
        </button>{" "}
        {/* 취소하면 서버에 요청하지 않고 원래 내용으로 돌아간다 (R-014, ARCHITECTURE A-3) */}
        <button type="button" onClick={onClose} disabled={pending}>
          취소
        </button>
      </div>
    </form>
  );
}

type AutoTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  onEnter?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  autoFocus?: boolean;
};

// 글 길이에 맞게 높이가 늘어나 전체가 보이는 입력칸 (SCREEN-SPEC 규칙 "고치기 입력칸", R-011)
function AutoTextarea({ value, onChange, onEnter, autoFocus }: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      // border-box라서 위아래 테두리 두께(offsetHeight - clientHeight)를 더해야 마지막 줄이 가려지지 않는다
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="auto-textarea"
      rows={1}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          onEnter(e);
        }
      }}
    />
  );
}
