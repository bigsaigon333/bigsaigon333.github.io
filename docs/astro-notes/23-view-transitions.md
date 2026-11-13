# 23. View Transitions: `<ClientRouter />`, 생명주기 이벤트, prefetch

## 한 줄 요약

`BaseLayout`의 `<head>`에 `<ClientRouter />`를 넣어 같은 사이트 링크를 문서를 다시 읽지 않고 바꿔 넣는다. `astro.config.mjs`의 `prefetch`로 링크에 포인터를 올리면 미리 받는다. 창(window)이 이어지므로 "페이지 로드마다 한 번"이던 일(GA page_view, utterances, 테마, 토글)을 생명주기 이벤트로 옮겼고, 새 browser feature 검사 `navigation`이 홈 → 글 A → 글 B → 뒤로 → 뒤로 → 앞으로를 확인한다.

## 개념

- **바꿔 넣기(swap) 순서**: `astro:before-preparation` → `astro:after-preparation` → `astro:before-swap`(`event.newDocument`를 고칠 수 있는 마지막 때) → swap(`deselectScripts`, `swapRootAttributes`, `swapHeadElements`, `swapBodyElement`) → `astro:after-swap`(주소·`<title>`이 새 페이지) → 스크립트 실행 → `astro:page-load`(첫 로드에도 온다).
- **스크립트는 한 번**: 라우터는 이미 실행한 스크립트(외부는 `src`, 인라인은 본문 글자로 식별)를 다음 페이지에서 다시 실행하지 않는다. `<head>`의 GA·테마 인라인 스크립트, 번들 모듈은 첫 로드에 한 번만 돈다. `data-astro-rerun`이 붙은 것만 바꿔 넣을 때마다 다시 돈다.
- **테마**: `swapRootAttributes`가 `<html>`의 속성을 새 문서의 것으로 갈아 끼운다. 새 문서에는 `data-theme`이 없으니 `astro:before-swap`에서 `event.newDocument.documentElement.dataset.theme`과 새 문서의 utterances `theme` 속성을 미리 적는다. 화면에 들어가기 전이라 깜빡임이 없다.
- **GA**: 첫 페이지는 `gtag("config", id)`가 page_view를 보낸다(dataLayer는 예전과 같다). 그 뒤로는 `astro:after-swap`마다 `gtag("event", "page_view", { page_title, page_location, page_path })` 하나. after-swap은 첫 로드에는 없어 중복이 없다.
- **utterances**: `client.js`는 `src`가 같아 두 번째 글부터 실행되지 않는다 → `data-astro-rerun`. 다시 돌 때 `document.title`은 이미 새 글의 제목이라 `issue-term="title"`이 맞다. 글이 아닌 페이지로 가면 `<body>`가 통째로 바뀌어 iframe도 사라진다.
- **토글**: 헤더는 페이지마다 새 요소다. 버튼마다 리스너를 다는 대신 `document`에서 클릭을 받고(`closest(".theme-toggle")`), `aria-pressed`는 `astro:after-swap`에서 맞춘다. `<copy-code>`·`<toc-spy>`는 커스텀 엘리먼트라(22 노트) 고칠 것이 없었다.
- **prefetch**: `prefetch: { prefetchAll: true, defaultStrategy: "hover" }`. `<ClientRouter />`가 있으면 `prefetchAll` 기본값이 이미 true지만 드러내 적었다.
- **움직임 줄이기**: `transition:*` 지시어를 쓰지 않아 Astro의 `viewtransitions.css`(reduced-motion 규칙 포함)가 실리지 않는다. 브라우저 기본 교차 페이드를 `@media (prefers-reduced-motion: reduce)`에서 `::view-transition-*`의 `animation: none`으로 끈다.

## Next.js 대응

| Next.js                                        | Astro (S6.2)                                               |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `next/link`의 클라이언트 라우팅(기본)          | `<ClientRouter />`를 넣어야 켜진다(opt-in)                 |
| `<Link prefetch>`(뷰포트 진입 시)              | `prefetch.defaultStrategy` `hover`·`tap`·`viewport`·`load` |
| `router.events.on("routeChangeComplete")`로 GA | `astro:after-swap`에서 `gtag("event", "page_view")`        |
| `_app`이 유지되어 상태가 남는다                | `window`·`document`가 남고 `<body>`는 바뀐다               |
| `useEffect`가 페이지마다 다시 돈다             | 모듈은 한 번. 페이지마다 할 일은 `astro:page-load`         |

## 빌드 결과물에서 확인하기

- `dist/index.html`의 `<head>`: `<meta name="astro-view-transitions-enabled" content="true">`, `<meta name="astro-view-transitions-fallback" content="animate">`, `<script type="module" src="/_astro/ClientRouter.astro_astro_type_script_index_0_lang.*.js">`(14184바이트), `/_astro/page.*.js`(47바이트, prefetch 시작).
- 글 페이지: `<script src="https://utteranc.es/client.js" … async data-astro-rerun>`.
- `budget`: 모든 페이지 +14913바이트(`accepted/s6-2-vt.json`). 다른 parity 검사(`head`, `content`, `embeds`, `visual` …)는 새 차이가 없다.
- `npm run verify -- --no-check --only=navigation` → `PASS navigation 7/7`. 자기 검사 변이 3개(page_view 중복, utterances 재실행 없음, before-swap 리스너 없음)를 모두 잡는다.

## 닫힌 고리가 잡아낸 것

- 검사를 `<ClientRouter />`를 뺀 빌드(`astro build --outDir`)에 돌리면 `FAIL navigation 2/7 … the window marker is gone: the page was loaded as a new document`. 마커가 문서 재로드를 잡는다는 것을 먼저 확인했다.
- 검사 안에서 gtag.js와 utteranc.es는 막혀 있다(lib/browser.mjs). 그래서 dataLayer는 페이지가 넣은 것만 담고, `client.js`는 iframe을 넣고 실행 횟수·`document.title`·`theme`을 적는 대역으로 답한다. "다시 실행되었는가"는 실행 횟수로 본다.
- `budget`은 `s6-1-dark.json`의 라우트 전체 항목이 먼저 받아 증가가 숨는다. 바이트는 `.verify/report/budget.json`의 `extra.table`에서 읽어 사유에 적었다.
- GA4 속성의 향상된 측정 "브라우저 기록 이벤트 기반 페이지 변경"이 켜져 있으면 gtag.js가 `pushState`를 보고 page_view를 또 보낸다. 코드로는 끌 수 없어 GA 관리 화면에서 꺼야 한다.

## 직접 해볼 실험

끝나면 `git checkout src`로 되돌린다.

1. `Comments.astro`에서 `data-astro-rerun`을 지우고 `npm run build`, 이어서 `npm run -s verify -- --no-check --no-build --only=navigation`.
   <details><summary>예상 결과</summary>B 단계에서 `utterances client ran 0 times, expected 1; 0 utterances iframes`. A에서는 처음 보는 `src`라 실행되고, B부터는 같은 `src`라 라우터가 실행하지 않는다.</details>
2. `BaseLayout.astro`의 `"astro:before-swap"` 리스너를 `"astro:page-load"`로 바꾸고 같은 검사.
   <details><summary>예상 결과</summary>A부터 `data-theme (none) at astro:after-swap; data-theme (none) after settling; toggle aria-pressed [false]`. 새 문서의 `<html>`에 테마가 없는 채로 바꿔 넣어져 라이트가 된다. `page-load`는 너무 늦을 뿐 아니라 `event.newDocument`가 없어 리스너가 예외로 끝나, 테마가 끝내 돌아오지 않는다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/view-transitions/ (`<ClientRouter />`, `data-astro-rerun`, 생명주기 이벤트)
- https://docs.astro.build/en/reference/modules/astro-transitions/ (`swapFunctions`, `astro:after-swap`)
- https://docs.astro.build/en/guides/prefetch/ (`prefetchAll`, `defaultStrategy`)
- https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications (SPA의 page_view)
