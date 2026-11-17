import { withoutFencedCode } from "./reading-time";

/**
 * description 이 없는 글의 meta description(og·twitter·JSON-LD 도 같은 값). 빈 description 은 링크 미리보기에
 * 설명이 비고 검색 콘솔이 "설명 없음"으로 잡는다(W9). 그래서 본문 앞부분을 쓴다.
 *
 * 규칙
 * 1. 원문 Markdown 에서 펜스 코드 블록과 HTML 주석을 지운다(읽는 시간과 같은 규칙, lib/reading-time.ts).
 * 2. 빈 줄로 나눈 블록 중 제목(#), 구분선(---), 표(|), HTML 블록(<태그)은 뺀다.
 * 3. 남은 블록에서 인용·목록 기호, 이미지, 링크의 주소(`[글](주소)` → `글`), `<주소>`, 맨 URL, 태그, 강조·코드 기호
 *    (`*`, `` ` ``, `~~`)를 지우고 공백을 하나로 줄여 블록 사이를 공백 하나로 잇는다.
 * 4. EXCERPT_LENGTH(코드 포인트) 를 넘으면 그 안의 마지막 공백에서 자르고 "…" 를 붙인다.
 */
export const EXCERPT_LENGTH = 150;

const COMMENT = /<!--[\s\S]*?-->/g;
const SKIPPED_BLOCK = /^(#{1,6}\s|([-*_]\s*){3,}$|\||<[a-zA-Z])/;
const QUOTE_OR_LIST = /^\s*(>\s?)*\s*([-*+]|\d+[.)])?\s+/gm;
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const LINK = /\[([^\]]*)\]\([^)]*\)/g;
const AUTOLINK = /<https?:\/\/[^>]*>/g;
const URL = /https?:\/\/\S+/g;
const TAG = /<\/?[a-zA-Z][^>]*>/g;
const EMPHASIS = /\*+|`+|~~/g;

/** 본문의 읽는 글을 한 줄로. 규칙 1~3. */
export function plainText(markdown: string): string {
  return withoutFencedCode(markdown)
    .replace(COMMENT, "")
    .split(/\n[ \t]*\n/)
    .map((block) => block.trim())
    .filter((block) => block && !SKIPPED_BLOCK.test(block))
    .map((block) =>
      block
        .replace(QUOTE_OR_LIST, "")
        .replace(IMAGE, "")
        .replace(LINK, "$1")
        .replace(AUTOLINK, "")
        .replace(URL, "")
        .replace(TAG, "")
        .replace(EMPHASIS, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join(" ");
}

/** 본문 앞부분 EXCERPT_LENGTH 자. 읽을 글이 없으면 "". 규칙 4. */
export function excerpt(markdown: string, max = EXCERPT_LENGTH): string {
  const chars = [...plainText(markdown)];
  if (chars.length <= max) return chars.join("");
  const cut = chars.slice(0, max).join("");
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
