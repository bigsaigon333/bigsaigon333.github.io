/**
 * 사이트 내 검색(/search)의 DOM 없는 조각. 검색 페이지의 스크립트(src/pages/search.astro)가 쓰고, 단위 시험이 본다.
 * Pagefind 를 부르는 일과 DOM 을 그리는 일은 그 스크립트에 있다.
 */

export const SEARCH_PATH = "/search";

/** 주소의 검색어 매개변수 이름(/search?q=…). 결과를 주소로 나눌 수 있다. */
export const QUERY_PARAM = "q";

/** Pagefind 가 색인과 런타임을 두는 곳(integrations/search-index.mjs 의 OUTPUT_DIR). */
export const PAGEFIND_URL = "/pagefind/pagefind.js";

/** 이 경로가 검색 페이지인가. build.format "file" 이라 dist 의 파일은 search.html 이고 둘 다 그 페이지로 풀린다. */
export const isSearchPath = (pathname: string): boolean =>
  pathname === SEARCH_PATH || pathname === `${SEARCH_PATH}.html`;

/** location.search → 검색어(앞뒤 공백을 뗀다). 없으면 "". */
export const readQuery = (search: string): string =>
  (new URLSearchParams(search).get(QUERY_PARAM) ?? "").trim();

/**
 * 지금 주소에 검색어를 담은 주소(경로·해시는 그대로). 빈 검색어는 매개변수째로 뺀다.
 * history.replaceState 에 넘긴다: 입력할 때마다 기록이 쌓이지 않고, 새로 고치거나 나눈 주소가 같은 결과를 연다.
 */
export function withQuery(href: string, query: string): string {
  const url = new URL(href);
  const trimmed = query.trim();
  if (trimmed) url.searchParams.set(QUERY_PARAM, trimmed);
  else url.searchParams.delete(QUERY_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

export interface ExcerptPart {
  text: string;
  /** 검색어에 맞은 부분(<mark>). */
  mark: boolean;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** HTML 문자 참조를 글자로. 모르는 이름은 그대로 둔다. */
export function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
    (whole, dec?: string, hex?: string, name?: string) => {
      if (dec || hex) {
        const code = Number.parseInt(dec ?? hex ?? "", dec ? 10 : 16);
        return code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : whole;
      }
      return ENTITIES[(name ?? "").toLowerCase()] ?? whole;
    },
  );
}

/**
 * Pagefind 의 excerpt(이스케이프된 글자 + 검색어에 맞은 곳의 <mark>…</mark>) → 조각들.
 * innerHTML 로 넣지 않고 글자 노드와 <mark> 로 그리기 위해서다: <mark> 말고 다른 태그 모양은 글자로 남는다.
 */
export function excerptParts(excerpt: string): ExcerptPart[] {
  const parts: ExcerptPart[] = [];
  const push = (raw: string, mark: boolean) => {
    const text = decodeEntities(raw);
    if (!text) return;
    const last = parts.at(-1);
    if (last && last.mark === mark) last.text += text;
    else parts.push({ text, mark });
  };
  const MARK = /<mark>([\s\S]*?)<\/mark>/g;
  let at = 0;
  for (const match of excerpt.matchAll(MARK)) {
    push(excerpt.slice(at, match.index), false);
    push(match[1] ?? "", true);
    at = match.index + match[0].length;
  }
  push(excerpt.slice(at), false);
  return parts;
}

/** article:published_time(ISO) → 목록과 같은 YYYY-MM-DD. 날짜 모양이 아니면 "". */
export const resultDate = (iso: string | undefined): string =>
  /^\d{4}-\d{2}-\d{2}/.test(iso ?? "") ? (iso ?? "").slice(0, 10) : "";

/** 결과 수를 알리는 한 줄(aria-live). */
export function statusText(query: string, count: number | null): string {
  if (!query) return "검색어를 입력하세요.";
  if (count === null) return "찾는 중…";
  if (count === 0) return `“${query}”에 맞는 글이 없습니다.`;
  return `“${query}”: 글 ${count}개`;
}
