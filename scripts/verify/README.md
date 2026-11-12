# 검증 장치

현재 배포본(`origin/gh-pages`)을 정답지로 삼아 새 빌드(`dist/`)를 비교한다.

```sh
npm run verify:setup                      # node_modules, .verify/baseline, .verify/cache 준비
npm run verify                            # astro check → astro build → 모든 검사
npm run verify -- --only=head,content     # 검사 고르기
npm run verify -- --route=/posts/foo      # 라우트 고르기(쉼표로 여러 개)
npm run verify -- --static                # 브라우저가 필요 없는 검사만
npm run verify -- --no-build              # 이미 있는 dist/ 를 그대로 검사
npm run verify -- --candidate=<dir>       # dist/ 대신 다른 디렉터리를 검사
npm run verify:selftest                   # 검사기가 차이를 실제로 잡는지 확인
npm run verify -- --only=visual --selector=header   # 전체 페이지 대신 요소 하나만 화면 비교
npm run verify:selftest -- --only=visual --calibrate # 화면 비교의 노이즈를 재서 visual.config.json 갱신
npm run verify:live -- --base-url=<url>   # 배포된 사이트를 검사(상태 코드, 리다이렉트, head, content, sitemap)
npm run verify:live -- --serve=<dir>      # 위 검사를 로컬에서 예행연습(<dir>를 GitHub Pages 방식으로 서빙)
```

화면 비교가 실패하면 `.verify/report/visual/<라우트>-<너비>/`에 `baseline.png`, `candidate.png`, `diff.png`, 차이 영역만 자른 `crop.png`가 남는다.

출력은 검사당 한 줄이다. 상세는 `.verify/report/<검사>.json`에 있다.

## 검사 모듈 계약

`scripts/verify/checks/<이름>.mjs`를 만들면 `run.mjs`가 자동으로 싣는다. 다른 파일을 고칠 필요가 없다.

```js
export default {
  name: "head", // --only 에 쓰는 이름, 리포트 파일 이름
  kind: "static", // "static" | "browser" (--static 은 static 만 돌린다)

  async run(ctx) {
    return {
      ok: true, // 통과 여부
      pass: 14, // 통과한 항목 수
      fail: 0, // 실패한 항목 수
      failed: [], // [{ route, detail }]  detail 은 한 줄로 읽히는 설명
      cells: undefined, // 선택: { "<route>": "pass" | "fail" | "skip" } (대시보드 격자)
      extra: undefined, // 선택: 리포트 JSON에만 남길 부가 정보
    };
  },

  selftest: {
    // 기준선 사본에 가하는 변이. 변이본을 검사했을 때 이 검사가 FAIL 이어야 한다.
    mutations: [
      {
        name: "제목 변경",
        apply(dir) {
          /* dir 안의 파일을 고친다 */
        },
      },
    ],
    // 선택: 기준선 ↔ 기준선 실행 직후에 불린다(노이즈 측정 등).
    async afterIdentical(ctx, result) {},
  },
};
```

## ctx

| 멤버                                  | 설명                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `ctx.routes`                          | 검사할 라우트. `--route`로 좁혀진다. 예: `/`, `/404`, `/posts/<id>`                  |
| `ctx.allRoutes`                       | 기준선의 전체 HTML 라우트                                                            |
| `ctx.baselineDir`, `ctx.candidateDir` | 두 사이트의 디렉터리                                                                 |
| `ctx.candidateUrl`                    | 배포된 사이트를 검사할 때의 기준 URL(없으면 `null`)                                  |
| `await ctx.html(side, route)`         | HTML 문자열. 그쪽에 라우트가 없으면 `null`. `side`는 `"baseline"` 또는 `"candidate"` |
| `await ctx.dom(side, route)`          | cheerio 문서. 없으면 `null`                                                          |
| `ctx.fileFor(side, route)`            | 라우트가 가리키는 파일의 절대 경로 또는 `null`                                       |
| `await ctx.serve(side)`               | 그쪽을 서빙하는 서버의 기준 URL(임시 포트, 처음 부를 때 기동)                        |
| `ctx.allowed(check, item)`            | `allowlist.json`에 있으면 사유 문자열, 없으면 `null`                                 |
| `ctx.report(name, data)`              | `.verify/report/<name>.json`에 기록                                                  |
| `ctx.reportDir`, `ctx.cacheDir`       | 리포트·응답 캐시 디렉터리                                                            |
| `ctx.args`                            | CLI 인자(`only`, `route`, `selector` 등)                                             |

경로 해석은 `lib/resolve.mjs`가 GitHub Pages와 같게 한다: `/p` → `p` → `p.html` → `p/index.html` → `404.html`.

## 허용한 차이

검사를 약하게 만들지 않는다. 받아들이는 차이는 `allowlist.json`에 `{ check, item, reason }`으로 적고 `ctx.allowed()`로 확인한다. `item`이 `**`로 끝나면 접두사 일치다. 허용한 항목은 실패로 세지 않되 리포트의 `extra.allowed`에 남긴다.

| 검사                                            | `item` 형식                           |
| ----------------------------------------------- | ------------------------------------- |
| `routes`                                        | `route:<라우트>`, `asset:<상대 경로>` |
| `head`, `content`, `budget`, `visual`, `embeds` | `route:<라우트>`                      |
| `links`                                         | `ref:<경로>`                          |
| `sitemap`                                       | `loc:<URL>`, `file:/robots.txt`       |
