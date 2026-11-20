// 이 저장소의 로컬 통합(integration). astro.config.mjs 가 integrations 배열 뒤에 펼쳐 넣는다.
// astro:build:done 은 이 순서대로 하나씩 돈다: 검색 색인을 먼저 써야 site-guard 가 그 파일의 지연 예산을 잰다.
//
// site-guard 의 jsBudget: 지금 가장 무거운 페이지는 글 페이지 21005바이트(ClientRouter·page·prefetch 모듈 3개 +
// 인라인 스크립트), 나머지는 19714바이트다. 여유를 둔 32KiB. 예산을 넘는 변경은 이 값을 올리는 커밋으로 드러난다.
// /search 는 자기 스크립트(입력·결과 그리기)가 더해져도 이 예산 안에 든다. Pagefind 는 그 스크립트가 동적 import 로
// 받으므로 페이지의 JS 로 세지 않고, 아래 지연 예산이 따로 잰다.
//
// 지연 예산 "검색 런타임": 첫 검색에서 검색어와 상관없이 받는 Pagefind 파일(pagefind.js, 진입 JSON, wasm, 메타).
// 2026-11 Pagefind 1.6.0 에서 약 101KiB(JS 46KiB + wasm 54KiB). 여유를 둔 112KiB. 검색어마다 받는 색인 조각
// (index/, fragment/)은 글이 늘면 함께 늘므로 여기서 세지 않는다.
import searchIndex from "../integrations/search-index.mjs";
import siteGuard from "../integrations/site-guard.mjs";

export default [
  searchIndex(),
  siteGuard({
    jsBudget: 32 * 1024,
    lazyBudgets: [
      {
        name: "검색 런타임",
        include:
          /^pagefind\/(pagefind\.js|pagefind-entry\.json|wasm\.[\w-]+\.pagefind|pagefind\.[\w-]+\.pf_meta)$/,
        bytes: 112 * 1024,
      },
    ],
  }),
];
