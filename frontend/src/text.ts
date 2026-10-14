// 빈칸 글자만 있으면 빈 제목으로 본다 (SCREEN-SPEC 규칙 "빈칸 글자")
export function isBlank(text: string): boolean {
  return text.trim() === "";
}
