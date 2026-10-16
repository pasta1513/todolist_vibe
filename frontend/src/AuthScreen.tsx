import { useState, type FormEvent } from "react";
import { isFailure } from "./Alerts";
import { login, signup, type Account } from "./api";

type Props = {
  onLoggedIn: (account: Account) => void;
  // 저장 실패, 서버 입력 오류, 연결 안 됨은 위쪽 알림으로 보인다 (SCREEN-SPEC 규칙 "로그인·가입의 다른 실패")
  onFailure: (err: unknown) => void;
};

// 로그인하지 않았으면 보드 대신 이 화면만 보인다 (R-024)
// 로그인 화면이 기본이고, "계정 만들기"로 가입 화면에 간다 (SCREEN-SPEC 대안과 결정 11)
// 화면을 바꾸면 그 화면이 사라지면서 적던 내용도 함께 지워진다
export default function AuthScreen({ onLoggedIn, onFailure }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  return (
    <div className="auth-screen">
      {mode === "login" ? (
        <LoginForm onLoggedIn={onLoggedIn} onFailure={onFailure} onSignup={() => setMode("signup")} />
      ) : (
        <SignupForm onLoggedIn={onLoggedIn} onFailure={onFailure} onBack={() => setMode("login")} />
      )}
    </div>
  );
}

// 아이디는 영문 소문자와 숫자만, 4~20자 (R-031)
const USERNAME_PATTERN = /^[a-z0-9]{4,20}$/;
// 비밀번호는 8자 이상. 그림 문자 하나도 한 글자로 센다 (R-032)
const PASSWORD_MIN = 8;

// 로그인 화면 (SCREEN-SPEC "6. 로그인 화면")
function LoginForm({ onLoggedIn, onFailure, onSignup }: Props & { onSignup: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // 다시 "로그인"을 누를 때까지 남는다 (SCREEN-SPEC 규칙 "로그인 실패 안내")
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (username === "" || password === "") {
      // 서버에는 보내지 않는다 (SCREEN-SPEC 규칙 "로그인 빈 칸")
      setMessage("아이디와 비밀번호를 적어 주세요.");
      return;
    }
    setMessage(null);
    // 응답을 받을 때까지 이 화면의 버튼을 누를 수 없다 (SCREEN-SPEC 규칙 "로그인·가입 요청 중")
    setPending(true);
    try {
      onLoggedIn(await login(username, password));
    } catch (err) {
      setPending(false);
      if (isFailure(err, "LOGIN_FAILED")) {
        // 아이디는 남기고 비밀번호 칸은 비운다 (SCREEN-SPEC "6. 로그인 화면")
        setMessage("아이디 또는 비밀번호가 맞지 않아요.");
        setPassword("");
      } else {
        onFailure(err);
      }
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} aria-label="로그인">
      <h1 className="auth-title">로그인</h1>
      <div className="field">
        <label className="field-label" htmlFor="login-username">
          아이디
        </label>
        <input
          id="login-username"
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="login-password">
          비밀번호
        </label>
        <input
          id="login-password"
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      {message && (
        <p className="auth-message" role="alert">
          {message}
        </p>
      )}
      <div className="auth-buttons">
        <button type="submit" className="btn btn-large btn-primary" disabled={pending}>
          로그인
        </button>
        <button type="button" className="btn btn-large" onClick={onSignup} disabled={pending}>
          계정 만들기
        </button>
      </div>
    </form>
  );
}

type Hints = {
  username?: string;
  password?: string;
  confirm?: string;
};

// 회원가입 화면 (SCREEN-SPEC "7. 회원가입 화면")
function SignupForm({ onLoggedIn, onFailure, onBack }: Props & { onBack: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [hints, setHints] = useState<Hints>({});
  const [pending, setPending] = useState(false);

  // 안내는 그 칸을 고치면 사라진다 (SCREEN-SPEC 규칙 "가입 입력 안내")
  function change(field: keyof Hints, value: string, set: (value: string) => void) {
    set(value);
    if (hints[field]) {
      setHints((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // 화면이 먼저 검사해, 맞지 않으면 서버에 보내지 않는다 (SCREEN-SPEC 규칙 "가입 입력 안내")
    const next: Hints = {};
    if (!USERNAME_PATTERN.test(username)) {
      next.username = "아이디는 영문 소문자와 숫자로 4~20자 적어 주세요";
    }
    if (Array.from(password).length < PASSWORD_MIN) {
      next.password = "비밀번호는 8자 이상 적어 주세요";
    }
    // 비밀번호 찾기가 없어서 두 번 적어 확인한다 (SCREEN-SPEC 대안과 결정 14)
    if (confirm !== password) {
      next.confirm = "비밀번호가 서로 달라요";
    }
    setHints(next);
    if (next.username || next.password || next.confirm) {
      return;
    }
    setPending(true);
    try {
      onLoggedIn(await signup(username, password));
    } catch (err) {
      // 적은 내용은 남는다 (SCREEN-SPEC "7. 회원가입 화면")
      setPending(false);
      if (isFailure(err, "USERNAME_TAKEN")) {
        setHints({ username: "이미 쓰는 아이디예요" });
      } else {
        onFailure(err);
      }
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} aria-label="회원가입">
      <h1 className="auth-title">회원가입</h1>
      <div className="field">
        <label className="field-label" htmlFor="signup-username">
          아이디
        </label>
        {hints.username && (
          <span className="hint" role="alert">
            {hints.username}
          </span>
        )}
        <input
          id="signup-username"
          className="input"
          value={username}
          onChange={(e) => change("username", e.target.value, setUsername)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
        />
        <p className="field-help">영문 소문자와 숫자 4~20자</p>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="signup-password">
          비밀번호
        </label>
        {hints.password && (
          <span className="hint" role="alert">
            {hints.password}
          </span>
        )}
        <input
          id="signup-password"
          className="input"
          type="password"
          value={password}
          onChange={(e) => change("password", e.target.value, setPassword)}
          autoComplete="new-password"
        />
        <p className="field-help">8자 이상</p>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="signup-confirm">
          비밀번호 확인
        </label>
        {hints.confirm && (
          <span className="hint" role="alert">
            {hints.confirm}
          </span>
        )}
        <input
          id="signup-confirm"
          className="input"
          type="password"
          value={confirm}
          onChange={(e) => change("confirm", e.target.value, setConfirm)}
          autoComplete="new-password"
        />
      </div>
      <div className="auth-buttons">
        <button type="submit" className="btn btn-large btn-primary" disabled={pending}>
          가입하기
        </button>
        <button type="button" className="btn btn-large" onClick={onBack} disabled={pending}>
          로그인으로 돌아가기
        </button>
      </div>
    </form>
  );
}
