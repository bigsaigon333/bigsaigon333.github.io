# 33. 성능 측정: Lighthouse(simulated) 예산과 perf:live

## 한 줄 요약

`perf` 검사가 네 페이지(`/`, 일반 글, 수식 글, 이미지 글)를 Lighthouse 모바일 설정으로 3번씩 재고 중앙값을 `scripts/verify/perf-budget.json`과 비교한다. 서드파티를 막은 측정만 게이트다. `npm run perf:live`는 실제 주소의 TTFB를 처음 요청과 바로 다시 요청으로 나눠 잰다. 실험실 숫자는 모든 페이지가 점수 100, FCP=LCP 약 900ms다. 체감이 느린 이유는 실험실 밖, CDN이 놓친 요청(250–300ms)과 GA(168KB)에 있다.

## 개념

- **simulated throttling(Lantern)**: 페이지는 제한 없이 로드하고, 관찰한 요청 그래프와 메인 스레드 작업으로 150ms RTT·1.6Mbps·CPU 4배 환경의 지표를 계산한다. devtools throttling처럼 실제로 늦추지 않아서 기기 부하에 덜 흔들린다. CPU 배수를 16으로 올려도 수식 글의 FCP는 903ms에서 1003ms로만 늘었다.
- **중앙값**: 지표마다 따로 3회의 중앙값을 쓴다. 의견(opportunity)은 LCP가 가운데인 실행의 것을 보고서에 남긴다.
- **GitHub Pages처럼 서빙**: `lib/resolve.mjs`의 경로 해석에 gzip과 `max-age=600`을 더한 서버를 검사 안에 둔다. gzip이 없으면 바이트와 다운로드 시간이 몇 배로 부푼다.
- **두 갈래 측정**: 게이트는 GA·utterances를 막는다(이 저장소만의 숫자). `VERIFY_PERF_THIRD_PARTY=1`이면 GA 로더와 utterances를 허용하고(GA collect는 막아 방문으로 세지 않는다) 보고만 한다.
- **예산과 여유**: 시간 지표는 측정값 +10%(50ms 단위 올림), TBT는 +100ms, CLS는 +0.02, 바이트는 +5%(512B 단위), 점수는 −5, 렌더링 차단 수는 그대로다. `VERIFY_PERF_WRITE_BUDGET=1`은 예산을 **조이기만** 한다.
- **lane 둘**: Lighthouse는 전역 performance mark를 써서 한 스레드에서 둘을 동시에 돌리면 깨진다. worker thread마다 Chromium 하나를 두어 12회를 약 25초에 끝낸다.

## Next.js 대응

| Next.js                                     | 이 저장소                                             |
| ------------------------------------------- | ----------------------------------------------------- |
| `@next/bundle-analyzer`, 빌드 출력의 크기표 | `perf` 보고서의 `byType`, `budget` 검사(JS 바이트)    |
| Vercel Speed Insights(현장 Web Vitals)      | 아직 없음. 웨이브 B에서 GA로 보낸다                   |
| Lighthouse CI(`lhci autorun`, assertions)   | `scripts/verify/checks/perf.mjs` + `perf-budget.json` |
| `reportWebVitals`                           | (웨이브 B) `web-vitals` → GA 이벤트                   |

## 빌드 결과물에서 확인하기

- `.verify/report/perf.json`의 `extra.pages[<route>]`: `median`, `runs`, `byType`, `unusedCss`, `blockingUrls`, `opportunities`.
- `.verify/report/perf/blocked/<page>.json`은 Lighthouse 보고서 전체다. 뷰어에 끌어다 놓으면 그대로 보인다.
- `node scripts/verify/checks/perf.mjs --summary`가 마크다운 표를 찍는다. CI는 이것을 job 요약에 붙이고 보고서를 `perf-report` 아티팩트로 올린다.
- 렌더링 차단 CSS 3개(`BaseLayout` 29KB 중 약 26KB가 쓰이지 않는다), 코드 글꼴 woff 56KB(unicode-range 없음)가 글마다 실린다.

## 닫힌 고리가 잡아낸 것

- 처음 두 lane을 한 프로세스에서 돌리자 `The "start lh:runner:gather" performance mark has not been set`로 깨졌다. worker thread로 옮겼다.
- `unused-css-rules` 감사는 10KiB(전송 기준) 넘게 버리는 시트만 싣는다. 이 사이트는 0으로 나왔다. 그래서 수집된 `CSSUsage`로 직접 계산한다.
- `perf:live`에서 `?x=<random>`으로 캐시를 깨려 했지만 Fastly는 HIT로 답했다. 쿼리는 캐시 키를 바꾸지 않는다. 그래서 "처음 요청"과 "바로 다시"로 나눴다.
- 자기 검사 변이 셋이 모두 잡힌다. head의 큰 동기 스크립트는 LCP·FCP·SI 1652ms, JS 125.8KB, 차단 4개로 실패한다. 새 글의 같은 변이는 가장 느슨한 예산으로 실패한다. 400ms 작업은 TBT 1551ms, 점수 74로 실패한다.

## 직접 해볼 실험

끝나면 바꾼 줄을 되돌린다.

1. `perf-budget.json`에서 `/`의 `blocking`을 2로 줄이고 `npm run verify -- --no-build --no-check --only=perf --route=/`.
   <details><summary>예상 결과</summary>`FAIL perf 0/1 /: blocking 3 > 2`. 렌더링 차단 CSS 셋(`BaseLayout`, `PostHeader`, `index`)을 하나로 합치거나 인라인하면 통과한다.</details>
2. 같은 명령을 `VERIFY_PERF_THIRD_PARTY=1`과 함께 돌리고 `extra.thirdParty["/"]`를 본다.
   <details><summary>예상 결과</summary>JS가 약 7KB에서 175KB로 늘고(gtag.js) TBT가 10ms 안팎 생긴다. LCP는 그대로 약 900ms다. gtag.js가 async라서 첫 화면을 막지 않기 때문이다. 게이트는 이 숫자를 보지 않는다.</details>

## 문서 근거

- https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md
- https://github.com/GoogleChrome/lighthouse/blob/main/docs/readme.md#using-programmatically
- https://web.dev/articles/lcp
- https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#usage-limits
