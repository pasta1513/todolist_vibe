// 빈칸 글자만 있으면 빈 제목으로 본다 (SCREEN-SPEC 규칙 "빈칸 글자")
export function isBlank(text: string): boolean {
  return text.trim() === "";
}

// 접힌 카드에서 제목은 앞 12자, 설명은 앞 20자까지 보이고, 넘으면 "…" 하나로 줄인다 (SCREEN-SPEC 규칙 "긴 글", P-23)
// 띄어쓰기를 포함해 세고, 한글 한 글자나 그림 문자 하나를 한 글자로 센다. "…" 앞에 남는 빈칸은 지운다
const CARD_TITLE_MAX = 12;
const CARD_DESCRIPTION_MAX = 20;

function shorten(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join("").trimEnd() + "…" : text;
}

export function shortTitle(title: string): string {
  return shorten(title, CARD_TITLE_MAX);
}

// 설명의 줄바꿈은 띄어쓰기로 바꿔 한 글자로 센다
export function shortDescription(description: string): string {
  return shorten(description.replace(/\r?\n/g, " "), CARD_DESCRIPTION_MAX);
}
