# 38. 성능 개선 PF1–PF4: GA 늦게 싣기, 글마다 다른 head 자원, woff2, 파비콘

## 한 줄 요약

`gtag.js`는 load 뒤 idle이나 첫 상호작용에 넣고 현장 Web Vitals를 GA로 보낸다. KaTeX CSS는 수식 글에만 인라인하고, 코드 글꼴은 코드가 있는 글에만 woff2로 실었다가(이후 시스템 고정폭 글꼴 스택으로 바꿔 웹 글꼴을 없앴다), 파비콘을 9.5KB에서 1.7KB로 줄였다. 일반 글의 전송량이 106.1KB에서 59.0KB로, 수식 글의 CLS가 0.018에서 0으로 줄었다. LCP는 그대로 약 900ms다.

## 개념

- **늦은 로더**: 인라인 스니펫(`dataLayer`, `gtag("js")`, `gtag("config")`)은 그대로 두고 `<script async src=gtag.js>`만 번들 모듈이 나중에 넣는다. 그 사이의 호출은 `dataLayer`에 쌓였다가 gtag.js가 처리하므로 page_view는 여전히 config 하나다. 측정 ID는 줄에 있는 config에서 읽는다.
- **web-vitals attribution**: gtag.js의 `load` 뒤에 동적 import 한다(차단기로 막힌 방문은 받지 않는다). 관찰자가 `buffered`라서 늦게 붙어도 LCP·FCP·CLS를 받는다. 이벤트 이름은 지표 이름, `value`는 delta(CLS는 ×1000), `debug_target`은 LCP 요소·가장 크게 밀린 요소·상호작용 대상의 선택자다.
- **페이지 → 레이아웃 head로 값 넘기기**: `[id].astro`가 렌더된 HTML(`post.rendered.html`)을 보고 `Astro.locals.postAssets = { math }`를 정한다. 페이지 frontmatter가 레이아웃보다 먼저 돌아서 `HeadAssets`가 읽을 수 있다. `BaseLayout`에 slot을 만들지 않아도 된다.
- **`?inline`과 CSP**: `katex.min.css?inline`은 Vite가 처리한(글꼴 `url()`을 바꾼) CSS 글자다. 이 `<style>`의 해시는 모든 페이지에서 `Astro.csp.insertStyleHash`로 넣는다. `<ClientRouter />`는 첫 페이지의 정책을 그대로 두므로 정책이 모든 페이지에서 같아야 한다.
- **unicode-range와 범위 없는 face**: 범위 없는 face는 어느 범위에도 없는 글자(코드 주석의 한글) 하나에 통째로 받힌다. 예전 `full`(56KB woff)이 그랬다. 이제 다른 7개 파일에 없는 497자만 남긴 `rest`(20KB woff2)다.

## Next.js 대응

| Next.js                                        | 이 저장소                                                      |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `<Script strategy="lazyOnload">`               | `Analytics.astro`의 번들 모듈(load → requestIdleCallback 3.5s) |
| `useReportWebVitals` / `reportWebVitals`       | `src/lib/web-vitals.ts`(attribution 빌드, GA 이벤트)           |
| 라우트별 CSS 분할(App Router)                  | `Astro.locals.postAssets` + `HeadAssets`의 조건부 인라인 CSS   |
| `next/font`(woff2, `unicode-range`, `preload`) | Fonts API `<Font>` + 직접 만든 woff2, KaTeX 글꼴 `preload`     |

## 빌드 결과물에서 확인하기

모바일 Lighthouse(simulated) 중앙값, GA·utterances 차단(게이트). 전송량 / JS / CSS, KB.

| 단계                                    | 홈               | 일반 글            | 수식 글(CLS)               | 이미지 글          |
| --------------------------------------- | ---------------- | ------------------ | -------------------------- | ------------------ |
| 전(PF0)                                 | 51.0 / 7.1 / 6.5 | 106.1 / 8.4 / 7.6  | 150.7 / 8.4 / 7.6 (0.018)  | 139.6 / 8.4 / 7.6  |
| PF1 GA 늦게 + web-vitals                | 52.8 / 8.8 / 6.5 | 107.8 / 10.1 / 7.6 | 152.5 / 10.1 / 7.6 (0.018) | 141.4 / 10.1 / 7.6 |
| PF2 KaTeX CSS 수식 글에만 + preload     | 49.1 / 8.8 / 2.7 | 104.1 / 10.1 / 3.8 | 152.8 / 10.1 / 3.8 (0)     | 137.7 / 10.1 / 3.8 |
| PF3 woff2, `rest`, 코드 글에만(+파비콘) | 41.0 / 8.8 / 2.7 | 58.9 / 10.1 / 3.8  | 107.6 / 10.1 / 3.8 (0)     | 92.5 / 10.1 / 3.8  |
| PF4 sizes(최종)                         | 41.1 / 8.8 / 2.7 | 59.0 / 10.1 / 3.8  | 107.8 / 10.1 / 3.8 (0)     | 92.5 / 10.1 / 3.8  |

- LCP·FCP·SI는 모든 단계에서 901–906ms, TBT 0, 렌더 차단 3개 그대로다. 파비콘만 따로 바꿔 재면 페이지마다 −7.5KB다.
- GA 허용(`VERIFY_PERF_THIRD_PARTY=1`): 전송량 218.9→214.5(홈), 296.0→254.4(일반 글)KB. LCP는 그대로이고 TBT는 3–66ms로 흔들린다. Lantern은 async 스크립트를 FCP·LCP 경로에 넣지 않는다. 바뀐 것은 시점이다: gtag.js 요청이 CSS와 함께(6ms)에서 load 뒤(32ms)로 옮겨 갔다.
- JS +1.7KB는 로더 모듈(Vite의 동적 import 도우미 포함)이다. web-vitals(5.5KB)는 gtag.js가 실린 뒤에만 받는다. 예산의 `js`는 손으로 올렸다(`ratchet`은 조이기만 한다).

## 닫힌 고리가 잡아낸 것

- 처음에는 web-vitals를 gtag.js와 함께 불렀다. `embeds` 검사(gtag.js를 막는다)의 `ga.calls`에 FCP·TTFB 이벤트가 붙어 31쪽이 모두 기준선과 달랐고, 게이트의 JS도 +7KB였다. 로더의 `load` 뒤로 옮겨 차단된 방문에서는 받지 않게 했다.
- `rest`에 정확한 497자 범위를 주면 일반 글이 39.6KB까지 줄지만 수식 글의 LCP·FCP가 903→1054ms가 됐다(세 번 모두, 다섯 빌드에서 재현). 관찰된 FCP도 77→114ms로 늦었다. latin preload, 대체 글꼴에 한글 글꼴 더하기, latin을 범위 없는 face로 두기, KaTeX preload 빼기 모두 그대로였다. 범위 없는 `rest`로 되돌렸다.
- `fetchpriority="high"`는 그대로였다(LCP 요소가 사진이 아니라 제목 글자다). 넣지 않았다.
- KaTeX preload를 빼면 CLS 0.018이 돌아온다. 인라인 CSS만으로는 고쳐지지 않는다.

## 직접 해볼 실험

끝나면 바꾼 줄을 되돌린다.

1. `HeadAssets.astro`에서 KaTeX `preload` 두 줄을 지우고 같은 명령을 돌린다.
   <details><summary>예상 결과</summary>CLS가 0.018로 돌아와 예산(0.02) 안에서 통과하지만 보고서 `layout-shifts`에 `main.prose > p > strong`이 "Web font loaded"로 다시 나온다.</details>
2. `src/lib/post-assets.ts`의 `postAssets()`가 늘 `{ math: true }`를 돌려주게 바꾸고 `npm run verify -- --no-check --only=perf`.
   <details><summary>예상 결과</summary>수식이 없는 글에도 KaTeX CSS(약 24KB)가 인라인되어 일반 글과 이미지 글의 전송량·CSS 가 예산을 넘어 실패한다. PF2 전으로 돌아가는 셈이다.</details>

## 문서 근거

- https://developers.google.com/tag-platform/gtagjs/install
- https://github.com/GoogleChrome/web-vitals#send-attribution-data
- https://docs.astro.build/en/reference/api-reference/#locals
- https://docs.astro.build/en/reference/configuration-reference/#securitycsp
- https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/unicode-range
