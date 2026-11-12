# 07. 스크립트: is:inline, define:vars, 외부 위젯

## 한 줄 요약

`next/script` 두 개와 `useEffect`로 끼워 넣던 utterances 스크립트가 `is:inline` `<script>` 세 개가 됐다. 셋 다 Astro가 번들하지 않고 쓴 자리에 쓴 대로 HTML에 싣고, GA 측정 ID는 `define:vars`로 빌드 때 박아 넣는다.

## 개념

- **`<script>`는 두 갈래다.** 속성이 없거나 `src`뿐이면 Astro가 **처리**한다: TypeScript로 검사하고, `import`를 번들하고, `type="module"`을 붙이고, 같은 컴포넌트를 여러 번 써도 한 번만 싣는다. `is:inline`을 붙이거나 `src` 말고 다른 속성이 하나라도 있으면 **그대로** 나간다.
- **이 단계의 셋은 모두 "그대로"여야 한다.**
  - GA 로더: 남의 서버에 있는 파일이고 `async`가 필요하다.
  - gtag 설정: 구글 스니펫은 클래식 스크립트다. 파싱 도중 바로 실행되고 `gtag`가 전역 함수로 남는다. 모듈이 되면 실행이 파싱 뒤로 밀리고 선언이 모듈 안에 갇힌다.
  - utterances: `client.js`가 `document.currentScript`에서 `repo`, `issue-term`, `theme`을 읽고 그 `<script>` 바로 뒤(`insertAdjacentHTML("afterend")`)에 iframe을 넣는다. 태그의 자리가 곧 위젯의 자리이고, 모듈에서는 `document.currentScript`가 `null`이다.
- **서버 값 → 인라인 스크립트**는 `define:vars={{ gaId }}`. 빌드 때 JSON으로 직렬화되어 `const gaId = "G-Y270VJN1Y2";`가 된다. 대신 본문 전체가 `(function(){ … })();`로 감싸인다. 그 안의 `function gtag(){}`는 전역이 아니므로 `window.gtag = function gtag(){…}`로 썼다.
- **속성**은 평범한 템플릿 표현식이다. 로더의 ``src={`…/gtag/js?id=${gaId}`}``도 같은 `SITE.gaId`에서 나온다. 예전에는 ID가 `_app`에 두 번 적혀 있었다.
- **속성 타입**: `<script>`의 속성은 `astroHTML.JSX.ScriptHTMLAttributes`로 검사된다. utterances의 `repo`, `theme`은 표준이 아니라서 `Comments.astro` 펜스에서 `declare global`로 보강했다. React에서 `JSX.IntrinsicElements`를 보강하는 것과 같은 일이다.

## Next.js 대응

| 예전                                                                                               | 지금                                                                                            |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pages/_app.page.tsx`의 `<Script async src="…/gtag/js?id=G-Y270VJN1Y2">`                           | `src/components/Analytics.astro`의 첫 `<script is:inline async src={…}>`                        |
| `<Script id="ga">` 안의 문자열 `gtag('config', 'G-Y270VJN1Y2')`                                    | 둘째 `<script is:inline define:vars={{ gaId }}>`, ID는 `src/lib/site.ts`의 `SITE.gaId` 한 곳    |
| `_app`이 모든 페이지를 감싼다                                                                      | `src/layouts/BaseLayout.astro`가 `<head>` 안에서 `<Analytics />`를 렌더한다                     |
| `pages/posts/[id].page.tsx`의 `createUtterancScript()` + `useEffect` + `ref.current.replaceWith()` | `src/components/Comments.astro`의 정적 태그. `src/pages/posts/[id].astro`가 `</main>` 뒤에 둔다 |
| `afterInteractive`: hydration이 끝난 뒤 JS가 `<body>` 끝에 태그를 만든다. 배포본 HTML에는 없다     | 태그가 처음부터 HTML에 있다. Astro가 만드는 클라이언트 JS 파일은 없다                           |

## 빌드 결과물에서 확인하기

- `dist/index.html`의 `<head>` 끝: `<script async src="https://www.googletagmanager.com/gtag/js?id=G-Y270VJN1Y2"></script><script>(function(){const gaId = "G-Y270VJN1Y2";` … `gtag("config", gaId);` `})();</script>`. `is:inline`, `define:vars`라는 속성은 사라졌고 `type="module"`이 없다. 본문의 들여쓰기와 빈 줄은 소스 그대로다(`compressHTML`은 스크립트 안을 건드리지 않는다).
- `grep -c googletagmanager dist/404.html dist/posts/*.html` → 파일마다 1.
- `dist/posts/<id>.html`: `</main><script src="https://utteranc.es/client.js" repo="bigsaigon333/bigsaigon333.github.io" issue-term="title" theme="boxy-light" crossorigin="anonymous" async></script><footer>`. `grep -c utteranc dist/index.html dist/404.html` → 0.
- 이 세 스크립트에서 나온 `dist/_astro/*.js`는 없다.
- 브라우저에서(외부 요청은 막고) 배포본과 나란히 읽은 값이 같다: `typeof gtag` = `"function"`, `dataLayer` = `[["js", Date], ["config", "G-Y270VJN1Y2"]]`, utterances 태그의 앞뒤 = `main` / `footer`.

## 닫힌 고리가 잡아낸 것

- **`astro check`가 `repo`를 막았다.** 증상: 게이트에서 build와 embeds 14/14는 PASS인데 check만 FAIL — `ts(2322) Property 'repo' does not exist on type 'ScriptHTMLAttributes & AstroScriptAttributes & AstroDefineVarsAttribute'`. 원인: `<script>` 속성도 JSX 타입으로 검사하고 `repo`, `theme`은 `node_modules/astro/astro-jsx.d.ts`의 목록에 없다(`issue-term`처럼 하이픈이 든 이름은 검사를 건너뛴다). 수정: `Comments.astro` 펜스의 `declare global { namespace astroHTML.JSX { interface ScriptHTMLAttributes { repo?: string; theme?: string } } }`. 속성을 객체에 담아 `{...attrs}`로 펼쳐도 통과하지만 검사를 피해 가는 길이라 고르지 않았다.
- **게이트가 못 보는 차이: 전역 `gtag`.** 증상: 구글 스니펫을 그대로 `define:vars` 스크립트에 넣고 빌드하니 `dist/index.html`에 `(function(){`이 보였다. 브라우저로 확인하면 `typeof gtag`가 `"undefined"`인데(배포본은 `"function"`) embeds는 14/14 PASS다. 원인: IIFE 래퍼. embeds 검사는 `dataLayer`만 읽는다. 수정: `window.gtag = …`.

## 직접 해볼 실험

1. `Analytics.astro`의 `window.gtag = function gtag() {…};`을 `function gtag() {…}`로 바꾸고 `npm run -s verify -- --only=embeds --no-check`. 이어서 `npm run preview`로 띄운 페이지의 콘솔에서 `typeof gtag`.
   <details><summary>예상 결과</summary>`PASS embeds 14/14` 그대로다. `dataLayer`에는 여전히 config가 들어가기 때문이다. 하지만 `typeof gtag`는 `"undefined"`다. `dist/index.html`을 보면 `function gtag`가 `(function(){ … })();` 안에 있다.</details>
2. `Analytics.astro`의 둘째 스크립트에서 `is:inline define:vars={{ gaId }}`를 지우고, 본문 첫 줄에 `import { SITE } from "../lib/site";`를 넣고, 마지막 줄을 `gtag("config", SITE.gaId);`로 바꾼다. `npm run build` 뒤 `grep -o '<script type="module">.*</script>' dist/index.html`, 그리고 `npm run check`.
   <details><summary>예상 결과</summary>압축된 `<script type="module">var e=…,t={url:e,title:…,keywords:[…],gaId:…,googleSiteVerification:…};window.dataLayer=…;</script>`가 쓴 자리(`<head>`)에 인라인된다. `SITE` 객체가 통째로 14개 페이지 모두에 실린다. embeds는 PASS지만 `npm run check`는 `Property 'dataLayer' does not exist on type 'Window & typeof globalThis'` 등 6 errors다. 처리되는 스크립트는 TypeScript로 검사되고 `is:inline`은 검사되지 않는다.</details>
3. `Comments.astro`의 태그를 `<script src="https://utteranc.es/client.js"></script>`만 남기고 `npm run -s verify -- --only=embeds --no-check --route=/posts/proxy-to-built-in-objects`, 이어서 `cat dist/_astro/*.js`.
   <details><summary>예상 결과</summary>`FAIL embeds 0/1`, 리포트에는 `utterances: baseline {"repo":…} ≠ candidate null`. HTML에는 `<script type="module" src="/_astro/Comments.astro_astro_type_script_index_0_lang.<해시>.js">`가 남고, 그 파일은 `import"https://utteranc.es/client.js";` 한 줄이다. 속성이 `src`뿐이라 Astro가 처리 대상으로 본 것이다. 모듈로 실행되면 `document.currentScript`가 `null`이라 위젯이 뜨지 않는다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/client-side-scripts/ (처리되는 스크립트와 `is:inline`, 외부 스크립트 싣기)
- https://docs.astro.build/en/reference/directives-reference/ (`is:inline`, `define:vars`)
- https://docs.astro.build/en/guides/typescript/ (`astroHTML.JSX` 보강. 요약본에는 없어 `node_modules/astro/astro-jsx.d.ts`로 확인했다)
- 문서에 없어 직접 확인한 것: `is:inline` 스크립트의 비표준 속성이 그대로 나온다, 처리된 스크립트는 쓴 자리에 인라인된다, `define:vars`의 IIFE 래퍼, `src`만 있는 원격 스크립트가 `import "…"` 모듈로 바뀐다.
