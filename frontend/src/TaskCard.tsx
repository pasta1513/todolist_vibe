import { useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
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
        <div className="confirm">
          <p className="confirm-question">정말 삭제할까요?</p>
          <div className="button-row">
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deletePending}>
              삭제
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setConfirmingDelete(false)}
              disabled={deletePending}
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="card-row">
          <span className="status-buttons">
            {STATUS_BUTTONS.map((button) => (
              <button
                key={button.status}
                type="button"
                className="status-button"
                // 지금 상태 버튼과, 고치는 동안의 상태 버튼은 누를 수 없다 (D-018)
                disabled={editing || statusPending || button.status === task.status}
                onClick={() => handleStatus(button.status)}
              >
                {button.label}
              </button>
            ))}
          </span>
          <span className="card-actions">
            <button
              type="button"
              className="text-button"
              onClick={onStartEdit}
              disabled={editing || editLocked}
            >
              고치기
            </button>
            <button
              type="button"
              className="text-button text-button-danger"
              onClick={() => setConfirmingDelete(true)}
              disabled={editing}
            >
              지우기
            </button>
          </span>
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

  const titleId = useId();
  const descriptionId = useId();

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label className="field-label" htmlFor={titleId}>
          제목
        </label>
        {showTitleHint && (
          <span className="hint" role="alert">
            제목을 적어 주세요
          </span>
        )}
        <AutoTextarea
          id={titleId}
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
      </div>
      <div className="field">
        <label className="field-label" htmlFor={descriptionId}>
          설명
        </label>
        <AutoTextarea id={descriptionId} value={description} onChange={setDescription} />
      </div>
      <div className="button-row">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          저장
        </button>
        {/* 취소하면 서버에 요청하지 않고 원래 내용으로 돌아간다 (R-014, ARCHITECTURE A-3) */}
        <button type="button" className="btn" onClick={onClose} disabled={pending}>
          취소
        </button>
      </div>
    </form>
  );
}

type AutoTextareaProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  autoFocus?: boolean;
};

// 글 길이에 맞게 높이가 늘어나 전체가 보이는 입력칸 (SCREEN-SPEC 규칙 "고치기 입력칸", R-011)
function AutoTextarea({ id, value, onChange, onEnter, autoFocus }: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      // border-box라서 위아래 테두리 두께를 더해야 마지막 줄이 가려지지 않는다.
      // 화면 배율에 따라 테두리가 소수점 두께로 그려지므로 실제 두께를 읽고 올림한다
      const style = getComputedStyle(el);
      const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      el.style.height = "auto";
      el.style.height = `${Math.ceil(el.scrollHeight + borders)}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      id={id}
      className="input auto-textarea"
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
