# 40. 성능 개선 PF5: CSS 를 인라인하고 CSP 해시를 모든 페이지에 합치기

## 한 줄 요약

`build.inlineStylesheets: "always"`로 페이지의 CSS 를 모두 `<style>`로 넣어 렌더를 막는 요청을 쪽마다 2개에서 0개로 없앴다. Lighthouse 모바일 FCP·LCP 가 약 902ms 에서 640ms(수식 글 835ms)로 줄었다. 페이지마다 달라진 `<style>` 해시는 `config/csp.mjs`가 빌드 뒤 모든 페이지의 정책에 합쳐 싣는다.

## 개념

- **`build.inlineStylesheets`**: `"auto"`(기본, `vite.build.assetsInlineLimit` 보다 작은 것만), `"always"`, `"never"`. 이 저장소는 CSP 때문에 `assetsInlineLimit = 0`이라 `"auto"`는 사실상 `"never"`였다. `"always"`는 그 페이지가 쓰는 CSS 조각만 넣으므로 안 쓰는 규칙이 늘지 않는다.
- **렌더 차단**: `<link rel=stylesheet>`는 받기 전까지 첫 그림을 막는다. 모바일 RTT 150ms 에서 요청 하나가 FCP 를 거의 그만큼 늦춘다. 인라인 CSS 는 HTML 과 함께 오지만 쪽마다 다시 받는다(gzip 으로 2–3KB). CDN 이 놓칠 수 있는 첫 화면 요청도 줄어든다.
- **CSP 와 인라인 `<style>`**: Astro 의 `security.csp`는 그 페이지의 `<style>` 해시만 정책에 넣는다. `<ClientRouter />`는 첫 페이지의 정책을 그대로 두므로(meta 정책은 지울 수 없다) 다른 페이지의 `<style>`이 막힌다. 그래서 `astro:build:done`에서 style-src 해시의 합집합을 모든 페이지에 싣는다. 해시는 그 글자만 허용하므로 넓어지는 것은 이 사이트의 스타일뿐이다.
- **하나로 합치기(`vite.build.cssCodeSplit: false`)**: 외부 파일 하나(14KB)로 차단 1개가 되지만 홈도 글의 규칙까지 받는다.

## Next.js 대응

| Next.js                                      | 이 저장소                                            |
| -------------------------------------------- | ---------------------------------------------------- |
| `experimental.inlineCss`                     | `build.inlineStylesheets: "always"`                  |
| `experimental.sri` / nonce 기반 CSP 미들웨어 | `security.csp` 해시 + `config/csp.mjs`의 해시 합치기 |

## 빌드 결과물에서 확인하기

모바일 Lighthouse(simulated) 3번의 중앙값, GA·utterances 차단(게이트). FCP(=LCP) ms / 전송량 KB / 외부 CSS KB / 렌더 차단.

| 안                   | 홈                   | 일반 글              | 수식 글               | 이미지 글            |
| -------------------- | -------------------- | -------------------- | --------------------- | -------------------- |
| 전(PF4)              | 902 / 25.9 / 2.8 / 2 | 902 / 59.1 / 3.8 / 2 | 902 / 108.0 / 3.8 / 2 | 902 / 92.7 / 3.8 / 2 |
| B: 하나로 합치기     | – / – / 3.4 / 1      | 752 / 58.7 / 3.4 / 1 | 752 / 107.5 / 3.4 / 1 | – / – / 3.4 / 1      |
| A: 모두 인라인(채택) | 638 / 25.5 / 0 / 0   | 648 / 58.5 / 0 / 0   | 840 / 107.3 / 0 / 0   | 661 / 92.0 / 0 / 0   |

- B 는 홈의 CSS 가 2.8→3.4KB 로 예산을 넘었다. A 는 전송량도 조금 줄었다(요청 머리가 없어진 만큼).
- 수식 글은 KaTeX 인라인 CSS(24KB)가 HTML 을 키워 다른 글보다 늦다. 그래도 902→840ms.
- `dist/_astro/`에 `.css`가 하나도 없다. `grep -o "style-src [^;]*" dist/index.html`은 모든 페이지에서 같다.

## 닫힌 고리가 잡아낸 것

- `inlineStylesheets: "always"`만 켜자 빌드가 `페이지마다 CSP 가 다르다(5가지)`로 멈췄다(`config/csp.mjs`의 같은 정책 확인). 해시 합치기를 넣은 뒤 `csp` 검사의 클라이언트 라우팅(홈 → 글 A → 글 B)에서 위반 0.
- `perf-budget.json`은 `VERIFY_PERF_WRITE_BUDGET=1`로 조였다: 렌더 차단 0, 외부 CSS 0, FCP·LCP·SI 750ms(수식 글 950ms).

## 직접 해볼 실험

끝나면 바꾼 줄을 되돌린다.

1. `config/csp.mjs`의 `withStyleHashes(original, hashes)`를 `original`로 바꾸고 `npm run verify -- --no-check --only=csp --route=/`.
   <details><summary>예상 결과</summary>빌드가 `astro:build:done`에서 "페이지마다 CSP 가 다르다"로 멈춘다. 이 확인이 없었다면 라우터로 옮겨 간 글의 스타일이 막혔을 것이다.</details>
2. `astro.config.mjs`의 `inlineStylesheets`를 `"never"`로 바꾸고 `npm run verify -- --no-check --only=perf`.
   <details><summary>예상 결과</summary>쪽마다 렌더 차단 2개, 외부 CSS 2.8–3.8KB 로 예산(0)을 넘어 실패하고 FCP 가 약 900ms 로 돌아온다.</details>

## 문서 근거

- https://docs.astro.build/en/reference/configuration-reference/#buildinlinestylesheets
- https://docs.astro.build/en/reference/configuration-reference/#securitycsp
- https://developer.chrome.com/docs/lighthouse/performance/render-blocking-resources
