// 글마다 다른 <head> 자원(PF2): 수식이 있는 글에만 KaTeX 스타일을 싣는다.
//
// 글 페이지(src/pages/posts/[id].astro)는 글 하나를 그리기 전에 그 글의 렌더된 HTML 을 보고 이 값을 정해
// Astro.locals.postAssets 에 둔다. 레이아웃이 <head> 에서 그리는 HeadAssets 가 그 값을 읽는다. 페이지의 frontmatter 가
// 레이아웃보다 먼저 돌기 때문에 읽는 때에는 이미 정해져 있다. 값이 없는 페이지(홈, 태그, 404)는 싣지 않는다.
//
// 렌더된 HTML 로 정하는 이유: KaTeX 마크업(class="katex")이 실제로 나온 것만 본다.
// 원문의 `$` 는 코드 안의 글자, 이스케이프한 기호와 구별하기 어렵다. 렌더된 HTML 이 없는
// 항목(다른 로더가 만든 항목 등)은 알 수 없으니 싣는다(빠진 스타일보다 남는 스타일이 낫다).

export interface PostAssets {
  /** KaTeX 수식이 있다: KaTeX 스타일시트와 본문 글꼴 preload. */
  math: boolean;
}

declare global {
  namespace App {
    interface Locals {
      /** 글 페이지만 정한다(src/lib/post-assets.ts). */
      postAssets?: PostAssets;
    }
  }
}

/** 렌더된 글 HTML → 필요한 자원. html 이 없으면 true. */
export function postAssets(html: string | undefined): PostAssets {
  if (html === undefined) return { math: true };
  return {
    math: /\bclass="katex"/.test(html),
  };
}
