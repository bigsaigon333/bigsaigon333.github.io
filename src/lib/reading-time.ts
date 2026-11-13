/**
 * 읽는 시간(분). 한국어 글이라 단어가 아니라 글자를 센다.
 *
 * 규칙
 * 1. 원문 Markdown(front matter 를 뗀 body)에서 읽지 않는 부분을 지운다.
 *    - 펜스 코드 블록(``` 또는 ~~~ 로 연 블록 전체). 코드는 훑어보지 문장처럼 읽지 않는다.
 *    - HTML 주석과 태그(태그 안의 글자는 남긴다).
 *    - 링크·이미지의 주소: `[글](주소)` → `글`, `![대체](주소)` → `대체`. 맨 URL(`https://…`)도 지운다.
 *    - Markdown 기호: `#`, `*`, `_`, `` ` ``, `>`, `|`, `-`, `~`, `[`, `]`.
 * 2. 남은 글자 중 공백이 아닌 것을 센다(코드 포인트 단위, 이모지 하나 = 1).
 * 3. 분 = round(글자 수 / 500), 최소 1분. 500자/분은 한국어 성인의 묵독 속도로 흔히 드는 값이다.
 *
 * 들여쓰기 코드 블록은 목록 안의 들여쓴 문단과 구별하기 어려워 세지 않고 남긴다(이 블로그의 글은 펜스만 쓴다).
 */
export const CHARS_PER_MINUTE = 500;

const OPEN_FENCE = /^ {0,3}(`{3,}|~{3,})/;
const COMMENT = /<!--[\s\S]*?-->/g;
const TAG = /<\/?[a-zA-Z][^>]*>/g;
const IMAGE_OR_LINK = /!?\[([^\]]*)\]\([^)]*\)/g;
const URL = /https?:\/\/\S+/g;
const SYNTAX = /[#*_`>|~[\]-]/g;

const closes = (fence: string, line: string): boolean => {
  const close = /^ {0,3}(`+|~+)[ \t]*$/.exec(line)?.[1];
  return (
    close !== undefined && close[0] === fence[0] && close.length >= fence.length
  );
};

/** 펜스 코드 블록을 뺀 줄들. 닫는 펜스는 여는 펜스와 같은 글자로 같은 길이 이상이다. 닫히지 않으면 끝까지 코드다. */
export function withoutFencedCode(markdown: string): string {
  const kept: string[] = [];
  let fence: string | null = null;

  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (fence === null) {
      const open = OPEN_FENCE.exec(line);
      if (open) fence = open[1] ?? null;
      else kept.push(line);
    } else if (closes(fence, line)) {
      fence = null;
    }
  }

  return kept.join("\n");
}

/** 읽을 글자 수: 규칙 1을 지운 뒤 공백이 아닌 코드 포인트의 수. */
export function readableCharacters(markdown: string): number {
  const text = withoutFencedCode(markdown)
    .replace(COMMENT, "")
    .replace(TAG, "")
    .replace(IMAGE_OR_LINK, "$1")
    .replace(URL, "")
    .replace(SYNTAX, "")
    .replace(/\s+/g, "");

  return [...text].length;
}

/** 읽는 시간(분). 1 이상. */
export function readingMinutes(markdown: string): number {
  return Math.max(
    1,
    Math.round(readableCharacters(markdown) / CHARS_PER_MINUTE),
  );
}
