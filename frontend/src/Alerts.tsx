import { ApiError, type ApiFailure } from "./api";

export type Alert = {
  id: number;
  message: string;
};

// 실패 종류별 문구 (SCREEN-SPEC "5. 실패 알림")
const MESSAGES: Record<ApiFailure, string> = {
  CONNECTION: "서버에 연결할 수 없어요.",
  INVALID_INPUT: "입력한 내용을 저장할 수 없어요.",
  NOT_FOUND: "이미 지워진 카드예요.",
  SAVE_FAILED: "저장하지 못했어요. 다시 해 주세요.",
  LOAD_FAILED: "카드를 불러오지 못했어요.",
};

// 목록 불러오기 실패는 원인과 상관없이 이 문구다 (SCREEN-SPEC 규칙 "목록 불러오기 실패 문구")
export const LOAD_FAILED_MESSAGE = MESSAGES.LOAD_FAILED;

export function failureMessage(err: unknown): string {
  // 실패 종류를 알 수 없으면 "연결 안 됨"으로 본다 (SCREEN-SPEC 규칙 "연결 안 됨")
  return err instanceof ApiError ? MESSAGES[err.kind] : MESSAGES.CONNECTION;
}

export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.kind === "NOT_FOUND";
}

// 화면 위쪽 알림. 만들기 창보다 위에 놓이고, 여러 개면 차례로 쌓인다 (SCREEN-SPEC 규칙 "알림 여러 개")
export default function Alerts({ alerts }: { alerts: Alert[] }) {
  return (
    <div className="alerts">
      {alerts.map((alert) => (
        <div key={alert.id} className="alert" role="alert">
          {alert.message}
        </div>
      ))}
    </div>
  );
}
