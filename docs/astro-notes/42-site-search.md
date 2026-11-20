# 42. 사이트 내 검색: Pagefind 색인, `/search`, CSP 의 `'wasm-unsafe-eval'`

## 한 줄 요약

`astro:build:done`에서 Pagefind Node API 로 글 본문(`data-pagefind-body`)만 색인해 `dist/pagefind/`에 쓰고, `/search`는 기본 UI 없이 JS API 와 커스텀 엘리먼트 `<site-search>`로 그린다. Pagefind(JS 46KiB + wasm 54KiB)는 입력란에 포커스하거나 `?q=`가 있을 때만 받고, 다른 페이지는 헤더 링크 하나만 늘었다.

## 개념

- **색인 범위**: Pagefind 는 어떤 페이지에든 `data-pagefind-body`가 있으면 그 속성이 붙은 요소만 색인한다. 글의 `<main class="prose">`에만 붙여 목차·시리즈·뒤로 가기 링크·헤더가 빠진다. 복사 버튼은 브라우저가 만들어 빌드 HTML 에 없다. 결과에 보일 제목·날짜·카테고리(meta)와 카테고리·태그(filter)는 이미 있는 `og:title`, `article:*` `<meta>`에 `data-pagefind-meta="date[content]"`처럼 속성 값을 가리켜 붙인다(본문 밖이어도 읽는다).
- **통합 순서**: `astro:build:done`은 `integrations` 배열 순서대로 하나씩 돈다. `config/integrations.mjs`가 색인 → site-guard 순서로 두어 site-guard 가 색인 파일의 지연 예산을 잰다. CSP 통합은 맨 뒤라 색인은 meta 를 옮기기 전 HTML 을 읽는다(본문은 같다).
- **주소**: `build.format: "file"`이라 파일은 `posts/a.html`이지만 주소는 `/posts/a`다. `addHTMLFile({ url, content })`로 주소를 직접 넘긴다. 쓰는 파일은 `getFiles()`로 받아 JS API 가 읽는 것만 고른다(기본 UI·워커·강조 스크립트 약 460KB 를 버린다).
- **지연 로딩과 ClientRouter**: 페이지 스크립트는 `import(/* @vite-ignore */ "/pagefind/pagefind.js")`만 품는다. 모듈 프라미스를 창마다 하나 두어 `/search`에 몇 번 들어와도 Pagefind 는 한 번 초기화된다. 라우터는 새 문서를 바꿔 넣은 **뒤에** 주소를 바꾸므로(`moveToLocation`), `connectedCallback`에서는 주소가 아직 이전 페이지다. 그래서 `astro:page-load`에서 `?q=`를 다시 읽는다. 입력은 `history.replaceState(history.state, …)`로 라우터의 기록 상태를 지킨 채 주소만 바꾼다.
- **CSP**: `WebAssembly.instantiate`는 `script-src`에 `'wasm-unsafe-eval'`이 있어야 돈다(JS `eval`은 여전히 막힌다). 라우터가 첫 페이지의 정책을 그대로 두므로 `/search`에만 넣을 수 없어 모든 페이지에 같은 정책으로 싣는다. Pagefind 1.6 은 기본으로 워커에서 wasm 을 돌리는데, 워커의 정책은 워커 응답 헤더를 따르고 Pages 는 헤더가 없다. 브라우저마다 다르게 굴 수 있어 `noWorker`로 메인 스레드에서 돌리고 허용을 정책에 드러냈다.
- **검색 엔진**: 검색 결과 페이지는 얇은 내용이라 `noindex`이고 sitemap 에도 없다. `seo`(sitemap 에 없는 글 아닌 페이지는 noindex)와 `listed`(noindex 는 sitemap 에서 뺀다) 규칙과 그대로 맞는다.

## Next.js 대응

| Next.js                                       | 이 저장소                                                 |
| --------------------------------------------- | --------------------------------------------------------- |
| `postbuild` 스크립트로 `pagefind --site out`  | `astro:build:done` 통합(`integrations/search-index.mjs`)  |
| `next/dynamic` 또는 `import()`로 검색 UI 늦게 | `<site-search>` + 동적 `import()`, 포커스나 `?q=` 때 받기 |
| `useSearchParams` + `router.replace`          | `URLSearchParams` + `history.replaceState`                |
| `headers()`의 CSP 에 `'wasm-unsafe-eval'`     | `config/csp.mjs`의 `script-src`(meta, 모든 페이지 같음)   |

## 빌드 결과물에서 확인하기

- 빌드 로그: `[search-index] 글 12쪽을 색인했다: pagefind/ 파일 20개`, `[site-guard] … 검색 런타임 103063 ≤ 114688바이트`.
- `grep -o "script-src [^;]*" dist/index.html`에 `'wasm-unsafe-eval'`이 있고 모든 페이지에서 같다. `'unsafe-eval'`은 없다.
- `/search`에만 `search.astro_astro_type_script_…js`(3448바이트)가 더 실린다. 홈·글의 JS 바이트는 기준선과 같다(`budget`).
- `dist/pagefind/`: `pagefind.js` 47228, `wasm.unknown.pagefind` 55400(한국어는 형태소 분석기가 없어 `unknown`), 색인 조각 `index/` 두 개, 글마다 `fragment/` 하나.

## 닫힌 고리가 잡아낸 것

- 처음 생각한 "`/search`에만 허용"은 `config/csp.mjs`의 "페이지마다 같은 정책" 확인이 빌드를 멈춘다. 그 확인이 라우터로 들어간 `/search`에서 wasm 이 막히는 것을 미리 막는다.
- `search` 자기 검사: `'wasm-unsafe-eval'`을 지운 사본은 `CompileError: … violates the following Content Security policy directive`로 실패, 색인을 지운 사본도 실패한다.
- "프록시"로 시험하려 했으나 글에는 "Proxy"만 있었다. 시험 검색어는 본문에 실제로 있는 낱말(명제, 내장 객체, 서드 파티, 정규표현식)로 골랐다. 한국어는 띄어쓰기 단위라 "정규표현식"이 "정규표현식에"·"정규표현식의"와 앞부분 일치로 맞는다.

## 직접 해볼 실험

끝나면 바꾼 줄을 되돌린다.

1. `config/csp.mjs`의 `WASM`을 `scriptDirective.resources`에서 빼고 `npm run verify -- --feature --no-check --only=search`.
   <details><summary>예상 결과</summary>`deeplink`·`type`·`router` 항목이 실패한다. 상태 줄이 "검색을 불러오지 못했습니다"이고 콘솔에 CSP 를 어긴 `CompileError`가 남는다.</details>
2. `src/pages/posts/[id].astro`의 `<main>`에서 `data-pagefind-body`를 지우고 `npm run build`.
   <details><summary>예상 결과</summary>`search-index: data-pagefind-body 가 있는 페이지가 없다`로 빌드가 멈춘다. 속성을 `<body>`로 옮기면 빌드는 되지만 `search` 검사의 `page` 항목이 글마다 "the toc is inside the indexed body"로 실패한다.</details>

## 문서 근거

- https://pagefind.app/docs/node-api/
- https://pagefind.app/docs/indexing/
- https://pagefind.app/docs/api/
- https://docs.astro.build/en/reference/integrations-reference/#astrobuilddone
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src#unsafe_webassembly_execution
