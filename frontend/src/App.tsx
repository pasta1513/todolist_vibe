// 세 칸 보드 (SCREEN-SPEC "1. 세 칸 보드", R-007)
const COLUMNS = ["할 일", "진행 중", "완료"] as const;

export default function App() {
  return (
    <main style={{ display: "flex", gap: "16px" }}>
      {COLUMNS.map((title) => (
        <section key={title} style={{ flex: 1 }}>
          <h2>{title}</h2>
        </section>
      ))}
    </main>
  );
}
