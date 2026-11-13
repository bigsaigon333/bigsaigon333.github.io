# 검증 장치

새 빌드(`dist/`)를 두 가지로 검사한다. **parity** 검사는 직전 운영본의 빌드(기준선)를 정답지로 삼아 비교하고, **feature** 검사와 `links`는 기준선을 읽지 않고 새 빌드만 본다. 의도한 차이는 `accepted/`의 선언 파일로 허용한다(아래 "의도한 차이 허용하기").

```sh
npm run verify -- --feature               # 기준선 없이: astro check → astro build --force → 기준선을 읽지 않는 검사만
npm run verify:setup                      # node_modules, .verify/baseline(origin/main 의 빌드), .verify/cache 준비
npm run verify:setup -- --baseline-ref=<ref>   # 기준선을 다른 커밋의 빌드로
npm run verify                            # astro check → astro build --force → 모든 검사(기준선 필요)
npm run verify -- --only=head,content     # 검사 고르기
npm run verify -- --route=/posts/foo      # 라우트 고르기(쉼표로 여러 개)
npm run verify -- --static                # 브라우저가 필요 없는 검사만
npm run verify -- --no-build              # 이미 있는 dist/ 를 그대로 검사
npm run verify -- --no-check              # astro check 를 건너뛴다
npm run verify -- --no-cache              # 기준선 캡처 캐시를 읽지도 쓰지도 않는다(아래 "속도")
npm run verify -- --candidate=<dir>       # dist/ 대신 다른 디렉터리를 검사(빌드하지 않는다)
npm run verify -- --candidate-url=<url>   # 디렉터리 대신 서빙 중인 사이트를 검사(빌드하지 않는다)
npm run verify -- --write-accept=<이름> --reason="<사유>"   # 지금의 parity 실패를 accepted/<이름>.json 으로 허용
VERIFY_REPORTER=off npm run verify        # 실행 요약을 reporter 에 넘기지 않는다(아래 "실행 요약 넘기기")
npm run verify:selftest                   # 검사기가 차이를 실제로 잡는지 확인
npm run verify:selftest -- --only=cli     # 명령 수준 시험만(아래 "자기 검사")
npm run verify -- --only=visual --selector=header   # 전체 페이지 대신 요소 하나만 화면 비교
npm run verify:selftest -- --only=visual --calibrate # 화면 비교의 노이즈를 재서 visual.config.json 갱신
npm run verify:live -- --base-url=<url>   # 배포된 사이트를 기준선과 비교(상태 코드, head, content, sitemap)
npm run verify:live -- --serve=<dir>      # 위 검사를 로컬에서 예행연습(<dir>를 GitHub Pages 방식으로 서빙)
```

화면 비교가 실패하면 `.verify/report/visual/<라우트>-<너비>/`에 `baseline.png`, `candidate.png`, `diff.png`, 차이 영역만 자른 `crop.png`가 남는다.

출력은 검사당 한 줄이다. 상세는 `.verify/report/<검사>.json`에 있다.

## 기준선 (`verify:setup`)

기준선은 직전 운영본의 빌드다. `npm run verify:setup -- --baseline-ref=<ref>`가 만든다.

- `<ref>`의 기본값은 환경 변수 `VERIFY_BASELINE_REF`, 없으면 `origin/main`이다. 이 clone에 없으면 `origin`에서 가져온다.
- `<ref>`를 임시 worktree(detached)로 꺼내 `npm run build`를 돌리고, `dist/`를 `.verify/baseline/`에 복사한 뒤 worktree를 지운다.
- 의존성은 `package-lock.json`이 이 체크아웃과 같으면 이 체크아웃의 `node_modules`를 링크하고(`astro` 패키지만 복사한다. 링크하면 astro 가 싣는 `ClientRouter.astro`의 컴파일 메타데이터를 찾지 못한다), 다르면 거기서 `npm ci`를 한다.
- `.verify/baseline.json`에 `{ ref, sha, hash }`를 남긴다. `hash`는 기준선 파일들의 (경로, sha256) 목록을 정렬해 다시 sha256한 값이다. accept 파일이 이 값을 가리킨다.
- `<ref>`가 가리키는 커밋이 `baseline.json`의 `sha`와 같으면 다시 빌드하지 않는다.

CI는 기준선 커밋을 직접 넘긴다. PR은 base 커밋, 배포는 push 전의 main 커밋, 배포 뒤 `verify:live`는 방금 배포한 Pages 아티팩트(다시 빌드하지 않는다)다.

## 의도한 차이 허용하기 (`accepted/`)

PR이 사이트를 일부러 바꾸면 parity 검사가 실패한다. 그 차이는 `scripts/verify/accepted/<이름>.json`으로 선언한다.

```sh
npm run verify:setup -- --baseline-ref=origin/main
npm run verify -- --write-accept=<이름> --reason="<왜 바뀌었는지>"
```

- `--write-accept`는 이번 실행의 parity 실패로 파일을 쓴다. 실패한 검사마다 항목 하나, 실패한 라우트를 모두 싣는다. `--reason`이 없으면 빌드 전에 2로 거부한다. `check`나 `build`가 실패하면 쓰지 않는다.
- 파일은 PR에 함께 커밋한다. 쓴 뒤 항목을 손으로 좁혀도 된다(라우트, 사유, mask).
- **새 글을 쓰면** 홈(`/`), `sitemap.xml`, 라우트 목록이 바뀐다. 글쓴이가 그 PR에서 `--write-accept`를 돌린다.

```json
{
  "baseline": "<기준선 hash>",
  "reason": "새 글 foo",
  "entries": [
    {
      "check": "routes",
      "routes": ["/posts/foo", "/sitemap.xml"],
      "reason": "새 글"
    },
    {
      "check": "visual",
      "routes": ["/"],
      "reason": "홈 목록",
      "mask": ["main"]
    }
  ]
}
```

- `baseline`이 지금 기준선의 `hash`와 같은 파일만 적용한다. 다른 파일은 `stale accept file ignored: …` 한 줄을 남기고 무시한다. 그래서 병합된 뒤에는 저절로 효력을 잃는다(다음 기준선은 그 변경을 담은 빌드다). 지워도 된다.
- 적용된 항목은 그 검사의 그 라우트 실패를 허용으로 바꾼다. 결과 줄은 `PASS`가 아니라 `ACCEPT  <검사>  … N accepted`다. 종료 코드는 0이다.
- `routes`에는 라우트나 glob을 쓴다. `*`는 `/`를 넘지 않고 `**`는 넘는다. 라우트가 없는 실패는 `-`다.
- `mask`(visual, hover만)는 허용하지 않고 가린다. 고른 요소의 상자를 기준선과 후보 모두 같은 불투명 색으로 칠한 뒤 비교한다(hover는 그 안의 링크를 빼고 비교한다). 나머지는 같아야 한다. 라우트 전체를 허용하기보다 mask를 먼저 쓴다.
- 어떤 실패에도 쓰이지 않은 항목(mask는 아무것도 가리지 않은 항목)은 `WARN  unused accept entry: …`로 알린다. 실패는 아니다.
- 자기 검사의 변이와 기준선 ↔ 기준선 실행은 accept 파일을 읽지 않는다.
- `allowlist.json`은 계속 둔다. 기준선이 바뀌어도 남는 **영구 예외**만 적는다. 지금은 비어 있다.

## 기준선 없이 (`--feature`)

기준선을 읽지 않는 검사만 돌린다. 기준선 없이 새 빌드만 볼 때 쓴다.

- `npm run check` → `astro build --force` → **기준선을 읽지 않는 검사만**: 범위가 `feature`인 `seo`, `drafts`, `listed`, `external`, `images`, `tags`, `series`, `toc`, `rss`, `theme`, `interactions`, `navigation`, `csp`와 `candidateOnly: true`를 적은 `links`. 아래 "검사 목록"의 "기준선" 열이 "안 읽음"인 것들이다.
- `.verify/baseline`이 필요 없다. 이 실행의 ctx에는 기준선이 없어서, 기준선을 읽는 검사는 통과하지 못하고 `check crashed: … this run has no baseline`으로 실패한다.
- 라우트는 **새 빌드의 것**이다(`ctx.routes`, `ctx.allRoutes`가 후보의 HTML 라우트). `--route`도 새 빌드의 라우트에서 고른다. 그래서 새 글의 라우트처럼 기준선에 없는 라우트도 고를 수 있다. 빌드하기 전에는 라우트가 라우트 모양인지만 보고(`posts/foo`, `/posts/foo.html`은 빌드 전에 2로 거부), 빌드한 뒤 새 빌드에 없는 라우트를 2로 거부한다. `--no-build`나 `--candidate`면 빌드가 없으니 처음에 바로 본다.
- 기준선과 비교하는 검사를 `--only`로 고르거나(`--only=content`, `--only=links,routes`) 기준선이 있어야 뜻이 있는 플래그(`--candidate-url`: 배포된 사이트는 목록을 낼 수 없어 라우트를 기준선에서 가져온다, `--selector`: `visual`의 비교 범위)를 함께 주면 **아무것도 빌드하기 전에** 2로 거부한다. `--no-build`, `--no-check`, `--candidate`, `--static`은 그대로 쓸 수 있다.

### 실패한 단계의 한 줄

`check`(astro check)나 `build` 단계가 실패하면 그 줄은 로그의 끝이 아니라 **첫 오류**를 보인다. 색 코드와 시각을 지우고, 세 가지를 저마다 한 항목으로 싣는다(결과 줄은 항목마다 110자에서 자르는데, Astro 내용 오류의 첫 줄만 90자쯤이다): "error"라고 말하는 첫 줄, 그 아래 들여 쓴 설명 줄(Astro 오류라면 `Hint:`·`Location:`·`Stack trace:` 앞까지), 전체 로그의 위치. 실패 수는 그대로 1이고 종료 코드도 같다.

```text
FAIL  build     0/1  -: [InvalidContentEntryDataError] posts → foo data does not match collection schema. | -: Unrecognized key: "desciption" | -: see .verify/report/build.log
```

예전에는 마지막 여섯 줄을 보였다. Astro 오류는 문서 URL(색 코드 포함)·위치·스택으로 끝나서, 문제를 말하는 줄은 `.verify/report/build.log`에만 있었다.

- Astro는 문제를 `**<키>**: <설명>`으로 쓰는데, 스키마가 모르는 키는 객체 자체의 문제라서 키 자리가 비어 `****: Unrecognized key: …`가 된다. 별표와 빈 키는 뗀다.
- 설명은 코드 프레임(vite의 `╭─[`), 스택 프레임, 빈 줄 뒤의 들여 쓰지 않은 줄(astro check가 소스 줄을 찍는 자리)에서도 끝난다. astro check 오류는 `src/x.astro:6:7 - error ts(6133): …` 한 줄이 된다.
- "error"라는 줄이 없는 로그(설정을 읽지 못한 경우 등)는 첫 스택 앞의 마지막 줄들을 보인다: `[astro] Unable to load your Astro config ⏎ Tsconfig not found …`.
- 단계 줄에는 검사 줄 끝의 `→ .verify/report/<검사>.json`이 붙지 않는다. 단계는 JSON 리포트가 없고 상세는 `.log`에 있다.

## 통과가 통과이려면

- **종료 코드**: 모두 통과 0, 검사 실패 1, 명령줄이 없는 것을 가리키면 2.
- **없는 것을 고르면 거부한다.** 모르는 플래그, `--only`의 없는 검사 이름, `--route`의 기준선에 없는 라우트(`posts/foo`처럼 앞 슬래시를 빠뜨린 것 포함), 값이 빠진 `--only=`, `--only`로 이름을 준 브라우저 검사가 `--static`에 걸러지는 경우, `--feature`와 함께 준 parity 검사·플래그. 무엇이 틀렸는지 말하고 **아무것도 빌드하기 전에** 2로 끝난다. 세 명령 모두 같다. 하나만 빌드 뒤에 본다: `--feature`의 `--route`가 새 빌드에 있는지(빌드하기 전에는 새 빌드의 라우트를 알 수 없다. 모양은 빌드 전에 본다).
- **0개를 본 검사는 실패다.** 통과한 항목이 하나도 없으면 `0/0 PASS`가 아니라 `nothing was examined` 로 실패한다. 고른 라우트가 그 검사에서 모두 허용 목록에 있을 때도 그렇다(예: `--route=/404 --only=visual`). `--route`를 넓히거나 `--only`로 그 검사를 빼면 된다.
- **빌드는 처음부터 렌더한다.** 게이트는 `astro build --force`로 빌드한다. 그냥 `astro build`는 원본이 그대로인 글의 HTML을 `node_modules/.astro/data-store.json`에서 꺼내 쓰는데, 이 저장소는 렌더하는 패키지가 바뀐 것을 알아채지 못한다. 배포 워크플로는 늘 빈 상태에서 렌더하므로, 게이트만 예전 HTML로 통과할 수 있었다.

## 속도

검사를 줄이지 않고 같은 일을 덜 하거나 겹쳐서 한다.

- **check 는 검사들과 함께 돈다.** `astro build --force`가 끝나면 `npm run check`를 띄우고 기다리지 않은 채 검사를 돌린다. 검사는 `dist/`와 `.verify/`만 읽고 astro check 는 소스와 `.astro/`만 읽어 서로 닿지 않는다. build 와 함께 돌리지 않는 이유: 둘 다 `astro sync`를 돌려 `.astro/`의 생성 타입과 `node_modules/.astro/`의 내용 저장소를 다시 쓰고, build 는 저장소를 비웠다가 채운다(함께 돌린 70번쯤 중 한 번 build 가 실패했고, 다시 일으키지 못했다). 결과 줄은 전처럼 `check`, `build` 순서의 두 줄이고 실패한 단계의 한 줄도 같다. `--write-accept`와 출력은 check 가 끝난 뒤다. build 가 실패해도 check 는 돈다.
- **브라우저 검사는 둘씩 함께 돈다**(`lib/runner.mjs`의 `BROWSER_LANES`). 지난번에 오래 걸린 검사부터 시작한다. 결과 줄의 순서는 그대로다. 정적 검사는 하나씩 돈다.
- **기준선 캡처 캐시.** 기준선은 그 hash 가 같으면 바뀌지 않으므로 `visual`의 기준선 스크린샷과 `a11y`·`embeds`·`hover`의 기준선 쪽 측정을 메인 체크아웃의 `.verify/capture-cache/<검사>/`에 두고 다음 실행(어느 worktree든)이 다시 쓴다. 후보 쪽은 언제나 새로 잰다.
  - 키: 기준선 hash, Playwright·Chromium 버전, `visual.config.json`, 찍는 코드의 sha(`lib/browser.mjs`, 그 검사 파일, `visual`은 `lib/accept.mjs`도), `a11y`는 axe-core 버전, 플랫폼(OS 릴리스 포함), `.verify/cache` 응답 기록본 전체의 sha, 항목마다 라우트·뷰포트·mask·selector. 하나라도 다르면 다른 항목이다.
  - 가드 a: 캐시한 기준선으로 비교가 실패하면 기준선을 새로 찍어 다시 본다(`visual`은 원래의 두 번째 시도가 양쪽을 새로 찍는다). 새로 찍은 것이 캐시와 바이트까지 같지 않으면 캐시가 틀린 것이다. 그래서 캐시가 실패를 만들 수 없다.
  - 가드 b: 실행마다 적중한 항목 중 1–2개를 무작위로 골라 새로 찍고 바이트까지 같아야 한다. 통과를 숨기는 틀린 항목은 이것으로 잡는다.
  - a나 b가 틀린 항목을 찾으면 캐시 디렉터리를 통째로 지우고 그 검사를 캐시를 읽지 않고 처음부터 다시 돌려 그 결과를 보고한다(리포트 `cache.droppedBy`).
  - 가드 c: `--no-cache`. 쓰기는 임시 파일을 만든 뒤 rename 하므로 다른 worktree 가 반쯤 쓴 항목을 읽지 않는다. 리포트 JSON 의 `cache`에 적중·누락·표본 재확인·저장 수가 남는다.
  - 자기 검사: 변이한 쪽은 캐시를 쓰지 않는다(후보는 원래 안 쓰고, `baseline(dir)`로 고친 기준선 사본은 캐시 대상이 아니다). 기준선 ↔ 기준선 실행은 적중과 표본 재확인이 실제로 일어나야 통과한다(캐시가 비어 있으면 한 번 더 돈다). 검사마다 따로 만든 캐시로 두 사례를 더 돈다: 항목끼리 내용을 바꿔 넣으면 표본 재확인 없이도 가드 a가, 같은 그림을 다르게 인코딩(JSON 은 끝에 공백)하면 모든 적중을 표본으로 삼아 가드 b가 찾아 캐시를 버리고, 검사는 통과해야 한다.

이 기기(10코어, 다른 에이전트와 함께 써서 부하 4–6)에서 브라우저 검사만 잰 값(3번의 중앙값): `visual` 48.6s → 40.0s(캐시, 84개 비교 중 72개가 의도한 차이라 두 번 찍는 상태), 브라우저 검사 넷 47.0s → 43.1s(둘씩).

## 검사 목록

`scripts/verify/checks/`의 파일 하나가 검사 하나다. 각 파일 머리의 주석이 정확한 정의다.

"범위"는 자기 검사가 그 검사를 어디에 시험하는지다: parity는 기준선 ↔ 기준선과 기준선 사본의 변이로, feature는 `dist/`와 `dist/` 사본의 변이로. "기준선"이 "안 읽음"인 검사만 `npm run verify -- --feature`에서 돈다. 이 검사들은 **후보의 라우트**(`lib/html.mjs`의 `candidateRoutes`)를 돌므로, 기준선에 없는 새 글의 페이지도 본다.

| 검사           | 종류    | 범위    | 기준선  | 보는 것                                                                                                                                                                                                                                                                                                                          |
| -------------- | ------- | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes`       | static  | parity  | 비교    | HTML 라우트 집합, 기준선의 모든 자산(sha256)                                                                                                                                                                                                                                                                                     |
| `head`         | static  | parity  | 비교    | `<head>`의 제목·메타·canonical·og·twitter·파비콘. **후보에만 있는 태그**도 본다: robots 계열 메타의 `noindex`/`nofollow`/`none`, `<meta http-equiv="refresh">`, `<base>`(문서 어디에 있든)                                                                                                                                       |
| `content`      | static  | parity  | 비교    | 본문 텍스트와 구조, 글 머리, 푸터. **모든 라우트의 사이트 헤더**: 링크마다 href·aria-label·target·rel·referrerpolicy·텍스트, img·source 마다 src·srcset·alt·type, 헤더 텍스트                                                                                                                                                    |
| `links`        | static  | parity  | 안 읽음 | 후보의 모든 페이지에서 내부 참조가 모두 200. 기준선을 읽지 않아 `candidateOnly: true`를 적었다                                                                                                                                                                                                                                   |
| `sitemap`      | static  | parity  | 비교    | `sitemap.xml`이 **well-formed XML**(선언, 짝 맞는 요소, 맨 `&` 없음)이고 루트 요소·네임스페이스가 같으며 `<loc>` 집합이 같다. `robots.txt`는 바이트 동일                                                                                                                                                                         |
| `budget`       | static  | parity  | 비교    | 라우트별 JS 바이트가 기준선을 넘지 않는다                                                                                                                                                                                                                                                                                        |
| `drafts`       | static  | feature | 안 읽음 | 초안(`posts/draft/`, `draft:` 이름, `draft: true`)이 페이지·홈 목록(링크와 제목)·sitemap 어디에도 없다. 무엇이 초안인지는 이 체크아웃의 `posts/`가 정한다                                                                                                                                                                        |
| `listed`       | static  | feature | 안 읽음 | 후보의 `sitemap.xml`이 후보의 모든 페이지를 한 번씩 싣고(404 제외), 실린 URL이 모두 200이다                                                                                                                                                                                                                                      |
| `external`     | static  | feature | 안 읽음 | 페이지가 요청·참조하는 외부 출처가 허용 목록(GA, utterances)에 있다                                                                                                                                                                                                                                                              |
| `seo`          | static  | feature | 안 읽음 | 후보의 모든 페이지에서 검색 엔진·링크 미리보기가 읽는 태그: canonical·description·robots, og·twitter 가 제목·설명·canonical 과 같은지, og:image 크기, sitemap 링크, JSON-LD                                                                                                                                                      |
| `images`       | static  | feature | 안 읽음 | 모든 `<img>`와 `<picture>`의 `<source>`가 이 사이트의 `/_astro/`(astro:assets가 만든 파일)를 가리키고 200이며, `<img>`마다 `alt`가 있고 `width`·`height`가 양의 정수다. 이미지가 하나도 없으면 실패                                                                                                                              |
| `tags`         | static  | feature | 안 읽음 | 이 체크아웃의 `posts/` front matter `keywords`가 정한 태그대로 `/tags/<slug>` 페이지가 하나씩 있고 글 집합이 같으며, `/tags`의 개수와 글마다의 태그 링크가 맞고 200이다                                                                                                                                                          |
| `series`       | static  | feature | 안 읽음 | 시리즈에 든 글은 `<nav aria-label="시리즈">`에 "시리즈: <이름> (n/N)"과 정확한 이전/다음 링크(`rel=prev`·`next`)가 있고, 시리즈 밖의 글에는 없다. 기대 순서는 검사 파일에 적어 둔다                                                                                                                                              |
| `toc`          | static  | feature | 안 읽음 | 글마다 목차(`<nav aria-label="목차">`)의 링크가 본문 h2·h3와 순서·id·텍스트까지 같고(제목이 둘 이상일 때만 있다), 대상이 하나씩 있으며, "읽는 시간 약 N분"이 한 번 있다                                                                                                                                                          |
| `rss`          | static  | feature | 안 읽음 | `/rss.xml`이 well-formed RSS 2.0이고 발행된 글을 최신순으로 빠짐없이 싣고(제목·링크·설명·날짜가 페이지와 같다) 초안을 싣지 않으며, 모든 페이지의 `<head>`에 피드 autodiscovery 링크가 하나 있다                                                                                                                                  |
| `embeds`       | browser | parity  | 비교    | GA 로더·측정 ID와 **`dataLayer` 항목 전체**(순서, 인자, `Date`는 `<Date>`로), utterances 스크립트의 속성과 **자리**(부모·앞·뒤 요소의 태그 이름)                                                                                                                                                                                 |
| `hover`        | browser | parity  | 비교    | 링크와 `<summary>`에 포인터를 올렸을 때의 계산된 스타일                                                                                                                                                                                                                                                                          |
| `visual`       | browser | parity  | 비교    | 전체 페이지 스크린샷, 라우트 × 뷰포트                                                                                                                                                                                                                                                                                            |
| `a11y`         | browser | parity  | 비교    | axe-core(WCAG 2.1 A·AA)로 1280 뷰포트에서 라우트마다 위반(규칙 id + 대상 선택자)을 모아, 기준선에 없는 위반이 후보에 있으면 실패                                                                                                                                                                                                 |
| `theme`        | browser | feature | 안 읽음 | 다크 모드: 첫 화면 전에 `data-theme`이 붙고(지연 스크립트 없이) 저장한 선택이 시스템 설정보다 이기며, 다크에서 `color-contrast` 위반이 0이고, 토글이 키보드로 바뀌고 저장되며 utterances 테마를 따라 바꾼다                                                                                                                      |
| `interactions` | browser | feature | 안 읽음 | 글마다 코드 블록의 "복사" 버튼이 하나씩 있고 클릭·Enter로 블록 글자 그대로를 클립보드에 넣으며, 목차 스크롤 스파이가 화면 위의 제목 링크에만 `aria-current="true"`를 단다                                                                                                                                                        |
| `navigation`   | browser | feature | 안 읽음 | 클라이언트 라우팅(`<ClientRouter />`): 홈 → 글 A(포인터를 올리면 미리 받기) → 글 B → 뒤로 → 뒤로 → 앞으로에서 문서를 다시 읽지 않고, 단계마다 주소·제목, GA page_view 하나, 바꿔 넣기 전의 다크 테마, utterances 한 번이 맞으며, 바뀐 뒤에도 복사 버튼·목차·토글이 동작한다                                                      |
| `csp`          | browser | feature | 안 읽음 | 모든 페이지에 CSP `<meta>`가 하나, `<head>`의 모든 `<script>`·`<style>`·`<link>` 앞에 같은 정책으로 있고(`script-src`에 `'unsafe-inline'` 등 없음, 외부 출처는 GA·utterances만), 전체 로드와 클라이언트 라우팅(홈 → 글 A → 글 B)에서 `securitypolicyviolation`이 0이며 다크 테마 스크립트·GA·utterances가 정책 아래에서 동작한다 |

`a11y`가 있는 이유: 접근성은 "회귀 금지"다. 기준선에 이미 있는 위반은 출발점으로 두고, 새로 생긴 위반만 실패로 친다. `.verify/report/a11y.json`의 `extra.baselineRules`에 기준선의 규칙별 위반 수(절대값)를, `extra.routes`에 라우트별 양쪽 위반 목록과 새 위반을 남긴다. 외부 요청은 `visual`과 같이 막거나 기록본으로 답한다. Lighthouse는 쓰지 않는다: 점수가 실행마다 흔들려 기준선과의 결정적 비교가 안 되고, 접근성 항목은 같은 axe-core 규칙의 부분집합이다.

`listed`가 있는 이유: `sitemap`은 기준선과 비교할 뿐이라, 기준선의 sitemap이 글 하나를 빠뜨렸다면 후보도 빠뜨려야 통과한다. 새 sitemap이 모든 글을 싣는다는 것은 후보만 보고 따로 단언한다.

### 화면 비교 설정 (`visual.config.json`)

| 값               | 뜻                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `colorThreshold` | 두 픽셀의 색이 얼마나 달라도 같은 픽셀로 칠지(pixelmatch의 `threshold`, 0–1). **0 = 한 채널이라도 다르면 다른 픽셀.** 안티에일리어싱된 픽셀도 똑같이 센다                                                          |
| `maxDiffRatio`   | 다른 픽셀이 전체에서 차지해도 되는 비율. 0 = 하나도 안 된다                                                                                                                                                        |
| `measuredNoise`  | `--calibrate`가 잰, 기준선↔기준선의 다른 픽셀 비율                                                                                                                                                                 |
| `viewports`      | 찍는 화면 크기. 사이트의 미디어 규칙(375·600·767px)이 나누는 구간마다 하나, 600px 경계에 하나: 375, 414(376–600 구간, 대부분의 휴대폰), 600(`max-width: 600px`가 걸리는 마지막 너비), 700(601–767 구간), 768, 1280 |

`colorThreshold`가 0인 근거: 이 기기에서 기준선↔기준선 스크린샷은 세 번 연속 바이트까지 같다(다른 픽셀 0개). 라이브러리 기본값 0.1에서는 회색 22–28단계 차이가 "같은 색"이어서, 문장 안 코드의 옅은 배경(0.055에서야 잡힘)과 표의 줄무늬(0.025)를 꺼도 통과했다. 렌더링 노이즈가 실제로 측정될 때만 올린다. `--calibrate`는 `colorThreshold`를 건드리지 않고 그 값에서 노이즈를 잰다.

600 뷰포트가 따로 있는 이유: `max-width:600px` 규칙을 `420px`로 좁힌 변화는 421–600px에서만 보인다. 414에서는 두 쪽 모두 규칙이 걸려 같다.

실패 한 줄에는 비율과 함께 픽셀 수와 채널 최대 차이가 나온다: `diff 0.03% (506 px, max channel Δ31)`.

## 검사 모듈 계약

`scripts/verify/checks/<이름>.mjs`를 만들면 `run.mjs`가 자동으로 싣는다. 다른 파일을 고칠 필요가 없다.

```js
export default {
  name: "head", // --only 에 쓰는 이름, 리포트 파일 이름
  kind: "static", // "static" | "browser" (--static 은 static 만 돌린다)
  scope: "parity", // 선택. "parity"(기본): 기준선과 비교 | "feature": 예전 사이트에 없던 것을 새 빌드에서 단언
  candidateOnly: false, // 선택. parity 검사가 기준선을 읽지 않으면 true(links). feature 검사와 함께 --feature 에서 돈다

  async run(ctx) {
    return {
      ok: true, // 통과 여부
      pass: 14, // 통과한 항목 수. 0 이면 ok 여도 실패로 센다
      fail: 0, // 실패한 항목 수
      failed: [], // [{ route, detail }]  detail 은 한 줄로 읽히는 설명
      cells: undefined, // 선택: { "<route>": "pass" | "fail" | "skip" } (실행 요약의 라우트 × 검사 격자)
      extra: undefined, // 선택: 리포트 JSON에만 남길 부가 정보. extra.allowed 는 허용 목록으로 넘긴 항목
    };
  },

  selftest: {
    // 기준선 사본에 가하는 변이. 변이본을 검사했을 때 이 검사가 FAIL 이어야 한다.
    // scope 가 "feature" 인 검사는 기준선 대신 dist/ 사본에 변이를 가하고, 변이 전 dist/ 는 PASS 여야 한다.
    // 기준선을 읽지 않는 검사는 lib/html.mjs 의 addPage 로 기준선에 없는 새 페이지(NEW_PAGE)를 더하는 변이를 하나 둔다.
    // 기준선의 라우트를 도는 검사는 그 페이지를 보지 못해 변이를 놓친다.
    mutations: [
      {
        name: "제목 변경",
        apply(dir) {
          /* dir 안의 파일을 고친다 */
        },
        // 선택: 변이가 드러나는 라우트. 배열이거나 (dir) => 배열. 주면 그 라우트만 검사해 시간을 줄인다.
        // 명령줄의 --route 가 있으면 그쪽이 우선이다.
        routes: ["/"],
        // 선택: 비교 대상(기준선)의 사본도 고친다. 실제 기준선으로는 만들 수 없는 방향의 차이를 시험할 때 쓴다.
        baseline(dir) {},
      },
    ],
    // 선택: 차이가 아닌 변화. 변이본을 검사했을 때 이 검사가 PASS 여야 한다(지나치게 잡지 않는지).
    accepted: [{ name: "색인을 허용하는 robots meta", apply(dir) {} }],
    // 선택: 기준선 ↔ 기준선 실행 직후에 불린다(노이즈 측정 등).
    async afterIdentical(ctx, result) {},
  },
};
```

## 자기 검사 (`verify:selftest`)

1. 기준선 ↔ 기준선: 모든 parity 검사가 PASS. `dist/` 그대로: 모든 feature 검사가 PASS.
2. 변이본: 변이를 선언한 검사가 FAIL(`mutation: …`), 차이가 아닌 변화에는 PASS(`accepted: …`). 아무것도 보지 않아서 난 실패는 변이를 잡은 것으로 치지 않는다. `seo`, `links`, `listed`에는 기준선에 없는 새 글 페이지를 더해 거기에만 문제를 두는 변이가 있다(`기준선에 없는 새 …`). 기준선의 라우트를 돌면 놓친다.
3. 명령 수준 시험(`cli`, `lib/cli-cases.mjs`): 명령을 실제로 돌려 본다. 지금 빌드가 기준선과 같은지는 묻지 않는다. 그것은 parity 실행이 답하고, CI는 기준선과 다른 것이 정상인 PR(새 글)에서 이 시험을 돌린다.
   - 없는 라우트·검사 이름·플래그는 빌드 전에 2로 거부된다(세 명령 모두). 예전에 있던 `scope`·`stage`·`agent` 플래그도 모르는 플래그다.
   - **reporter**(아래 "실행 요약 넘기기"). 임시 디렉터리에 모듈을 써서 `VERIFY_REPORTER`로 준다. 이 시험이 아닌 명령은 모두 `VERIFY_REPORTER=off`로 돈다.
     - `--feature --no-build --no-check --only=listed`(통과)와 사이트가 없는 디렉터리에 `verify:live --serve=<dir> --only=status`(실패)에서 모듈이 요약을 꼭 한 번 받는다. 요약의 키, `command`, `ok`, 검사 이름, `--feature`의 `feature: true`가 맞아야 한다. 뒤의 것은 모듈을 메인 체크아웃에서 본 상대 경로로 준다.
     - 예외를 던지는 모듈과 없는 모듈: 통과하는 실행의 종료 코드는 0 그대로이고, stderr에 `verify: reporter <경로> failed: …` 한 줄이 남는다.
   - `--feature`에 parity 검사(`--only=content`, `--only=links,routes`), `--selector`, `--candidate-url`, 라우트 모양이 아닌 `--route`를 주면 2로 거부되고, `npm run check`도 빌드도 돌지 않았다(`.verify/report/check.log`·`build.log`가 그대로다. 단계 줄은 끝에 찍히므로 결과 줄이 없다는 것만으로는 모른다).
   - **기준선 없는 사본에서 `--feature`**: 프로젝트 사본(아래 `build:` 사례와 같은 방식, 초안과 `tools/`도 넣는다)에 기준선에 없는 올바른 글 하나를 더하고, `.verify/baseline` 없이 git 작업 트리로 만들어 `node scripts/verify/run.mjs --feature`를 그대로 돌린다. 종료 코드 0, 결과 줄은 `check`, `build`와 기준선을 읽지 않는 검사뿐, 라우트별로 보고하는 검사(`links`, `listed`, `seo`)는 모두 새 글의 라우트를 `pass`로 보고해야 한다. 이어서 `--route=<새 글>`로 좁히면 그 검사들이 그 라우트 하나만 보고, 새 빌드에 없는 라우트는 2로 거부된다.
   - 내용 저장소(`data-store.json`)의 렌더 결과 하나를 고쳐 놓고 게이트(`--feature --only=listed`, 빌드만 보는 검사라 종료 코드가 빌드의 성패를 말한다)를 돌려도 고친 내용이 `dist/`에 나오지 않는다. 먼저 그냥 `astro build`로는 나온다는 것을 확인하므로, 저장소 재사용이 사라지면 이 시험이 알려 준다. 끝나면 저장소와 `dist/`를 되돌린다. 두 모드는 같은 빌드 단계를 쓴다.
   - `verify:live --serve=.verify/baseline`은 모든 검사를 통과하고, 홈의 `<title>`을 바꾼 사본은 `head`로 실패한다.
   - **accept 파일**. 사례마다 임시 디렉터리를 `VERIFY_ACCEPTED_DIR`로 주고, 기준선 사본을 고쳐 `--candidate`로 검사한다(빌드하지 않는다). `scripts/verify/accepted/`에는 쓰지 않는다.
     - `--write-accept`는 `--reason`이 없거나 비었거나 `--feature`와 함께면 빌드 전에 2로 거부하고 아무 파일도 쓰지 않는다. `--write-accept` 없는 `--reason`도 거부한다.
     - 글 문단 하나를 지운 사본: accept 파일 없이 `content`가 FAIL. `--write-accept`가 지금 기준선 hash와 그 라우트 하나로 파일을 쓰고, 다시 돌리면 `ACCEPT  content … 1 accepted`, 종료 코드 0. 홈까지 바꾸면 다시 실패한다.
     - 기준선 hash가 다른 파일은 적용되지 않고(종료 코드 1) `stale accept file ignored: <파일>` 한 줄이 남는다.
     - 차이가 없는 라우트를 허용하는 항목: 통과(`PASS`), `WARN  unused accept entry: …`.
     - `visual`의 mask(`header`): 헤더 안 글자색을 바꾼 사본은 mask 없이 실패하고 mask와 함께 통과한다. 헤더 밖(홈 목록 제목)을 바꾼 사본은 mask가 있어도 실패한다.
   - **front matter 스키마**(`build:` 사례). `src/content.config.ts`는 아는 키와 따옴표로 감싼 날짜만 받는다. 이것을 시험하려면 스키마가 거절할 글이 있어야 하는데, `posts/`에 둔 그런 글은 모든 빌드를 멈춘다. 그래서 저장소 밖 임시 디렉터리(`verify-frontmatter-*`)에 프로젝트 사본을 만들어 글을 더하고 `astro build --force`로 빌드한다. 저장소의 `posts/`에는 아무것도 쓰지 않는다.
     - 사본에는 빌드가 읽는 것만 넣는다: `astro.config.mjs`, `config/`, `src/`, `posts/`의 최상위 `*.md`, `public/`, `tsconfig.json`, `package.json`. `node_modules`는 디렉터리 하나를 링크하지 않고 저장소의 패키지마다 링크를 건다. 그래야 Astro가 쓰는 `node_modules/.astro`(내용 저장소)가 저장소가 아니라 사본에 남는다.
     - 사본은 사례마다 새로 만들고, 사례가 실패하거나 예외로 끝나도 지운다.
     - 대조군: 올바른 글 하나를 더한 사본이 빌드되고, 그 글이 `dist/posts/<id>.html`·홈 목록·`sitemap.xml`에 나온다.
     - `desciption` 키가 있는 글은 빌드를 멈추고, 출력이 `Unrecognized key: "desciption"`과 파일(`posts/<파일>.md`)을 말한다.
     - 따옴표 없는 `date`는 빌드를 멈추고, 출력이 `date` 키와 파일을 말한다.
     - 최상위의 `draft:<이름>.md`와 `draft: true`인 글은 빌드되지만, `dist/`의 어느 파일 이름에도 내용에도 없다. 로더가 둘을 읽었다는 것(사본의 내용 저장소에 있다)과 함께 더한 올바른 글은 실린다는 것을 먼저 확인한다.
     - 거절을 종료 코드만으로 판정하지 않는다. 사본을 만들지 못하거나 `node_modules` 링크가 빠지면 대조군은 "빌드되지 않았다"로, 거절 사례는 "스키마가 아닌 이유로 실패했다"로 실패한다. 스키마를 `z.object`(모르는 키를 버린다)로 느슨하게 하면 `desciption` 사례가 실패한다.
   - **실패한 빌드의 결과 줄**(위 "실패한 단계의 한 줄"). `run.mjs`는 작업 디렉터리의 프로젝트를 검사한다(`lib/paths.mjs`가 git에 최상위를 묻는다). 그래서 `desciption` 글을 더한 사본을 git 작업 트리로 만들고 `scripts/verify`와 기준선을 링크한 뒤, 그 안에서 `node scripts/verify/run.mjs --no-check --only=routes`를 그대로 돌린다. 사본의 `build.log`가 그 글을 말하고(사본을 빌드했다), 종료 코드가 1이고, 검사는 돌지 않았고, `FAIL  build` 줄에 색 코드 없이 `posts → <id>`와 `Unrecognized key: "desciption"`이 있어야 한다.
   - 이 다섯 사례는 사본을 만들고 빌드하는 데 저마다 1초 안팎이 든다. 기준선 없는 `--feature` 사례는 `npm run check`까지 돌아 몇 초가 든다.

`--only=cli`로 3만, `--only=<검사>`로 그 검사의 1·2만 돌린다. `--static`은 브라우저 검사의 1·2를 빼고, 3은 모두 돌린다. 3에서 브라우저를 띄우는 것은 mask 사례(`visual`)뿐이다.

### 나눠 돌리기 (`--shard`, `--list`)

```sh
npm run verify:selftest -- --list               # 돌릴 사례의 id(`<검사>/<사례 이름>`)를 한 줄씩 찍고 아무것도 돌리지 않는다
npm run verify:selftest -- --shard=2/3          # 사례를 셋으로 나눈 것 중 두 번째만 돌린다
```

- 고른 사례(`--only`, `--static`을 적용한 뒤) 전부를 id 순서(코드 단위 비교)로 늘어놓고, k번째(0부터) 사례를 `(k mod n) + 1`번째 조각에 둔다. 모든 사례가 정확히 한 조각에 들고, 새 사례도 저절로 들어간다. id가 겹치면 2로 끝난다.
- `--shard`는 `<i>/<n>`(1 ≤ i ≤ n)만 받는다. 나머지는 2로 거부한다.
- 명령 사례 `verify:selftest: --shard 의 조각들을 합치면 …`가 `--list`로 n = 1, 3, 5의 조각을 모아 나누지 않은 목록과 같고 겹치지 않음을 확인한다.
- CI(`checks.yml`)는 자기 검사를 세 조각의 matrix(`verify selftest (1/3)` …)로 돌리고, 조각이 모두 성공해야 통과하는 job `verify selftest`가 필수 상태 검사 이름을 잇는다. 배포는 push된 커밋으로 merge된 PR의 head가 같은 트리이고 거기서 `verify selftest`가 성공했으면 자기 검사를 건너뛴다(`deploy.yml`의 `selftest-plan`이 이유를 로그에 남긴다).

## ctx

| 멤버                                  | 설명                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `ctx.routes`                          | 검사할 라우트. `--route`로 좁혀진다. 예: `/`, `/404`, `/posts/<id>`                  |
| `ctx.allRoutes`                       | 기준선의 전체 HTML 라우트. `--feature`에서는 후보의 것                               |
| `candidateRoutes(ctx)`                | 후보의 HTML 라우트(`--route`로 좁혀진다). 기준선을 읽지 않는 검사는 이것을 돈다      |
| `ctx.baselineDir`, `ctx.candidateDir` | 두 사이트의 디렉터리. `--feature`에서 `ctx.baselineDir`은 `null`이고 읽으면 예외다   |
| `ctx.candidateUrl`                    | 배포된 사이트를 검사할 때의 기준 URL(없으면 `null`)                                  |
| `await ctx.html(side, route)`         | HTML 문자열. 그쪽에 라우트가 없으면 `null`. `side`는 `"baseline"` 또는 `"candidate"` |
| `await ctx.dom(side, route)`          | cheerio 문서. 없으면 `null`                                                          |
| `ctx.fileFor(side, route)`            | 라우트가 가리키는 파일의 절대 경로 또는 `null`                                       |
| `await ctx.serve(side)`               | 그쪽을 서빙하는 서버의 기준 URL(임시 포트, 처음 부를 때 기동)                        |
| `ctx.allowed(check, item)`            | `allowlist.json`에 있으면 사유 문자열, 없으면 `null`                                 |
| `ctx.masks(check, route)`             | accept 항목이 그 라우트에서 가리라는 CSS 선택자 목록(visual, hover)                  |
| `ctx.masked(check, route)`            | mask가 무언가를 가렸다고 알린다(그 항목은 unused가 아니다)                           |
| `ctx.report(name, data)`              | `.verify/report/<name>.json`에 기록                                                  |
| `ctx.reportDir`, `ctx.cacheDir`       | 리포트·응답 캐시 디렉터리                                                            |
| `ctx.args`                            | CLI 인자(`only`, `route`, `selector` 등)                                             |

경로 해석은 `lib/resolve.mjs`가 GitHub Pages와 같게 한다: `/p` → `p` → `p.html` → `p/index.html` → `404.html`.

## 허용한 차이

검사를 약하게 만들지 않는다. 한 번의 변경이 만든 차이는 위 `accepted/`로 허용한다. 기준선이 바뀌어도 남는 영구 예외만 `allowlist.json`에 `{ check, item, reason }`으로 적고 `ctx.allowed()`로 확인한다. `item`이 `**`로 끝나면 접두사 일치다. 허용한 항목은 실패로 세지 않되 리포트의 `extra.allowed`에 남긴다.

| 검사                                                     | `item` 형식                           |
| -------------------------------------------------------- | ------------------------------------- |
| `routes`                                                 | `route:<라우트>`, `asset:<상대 경로>` |
| `head`, `content`, `budget`, `visual`, `embeds`, `hover` | `route:<라우트>`                      |
| `links`                                                  | `ref:<경로>`                          |
| `sitemap`                                                | `loc:<URL>`, `file:/robots.txt`       |
| `seo`                                                    | `route:<라우트>`                      |
| `drafts`, `listed`, `images`, `tags`, `series`, `rss`    | 허용 목록 없음                        |
| `toc`                                                    | `route:<라우트>`                      |
| `theme`                                                  | 허용 목록 없음                        |
| `interactions`                                           | `route:<라우트>`                      |
| `navigation`                                             | 허용 목록 없음                        |
| `csp`                                                    | 허용 목록 없음                        |

항목은 사유가 말하는 만큼만 받아들인다.

- `sitemap`의 `loc:<URL>`은 **후보에만 있는** URL을 받아들인다. 기준선에 있던 URL이 후보에서 빠진 것은 같은 항목이 있어도 실패다.
- 자기 검사의 변이는 자기만의 허용 항목을 `allowlist`로 더할 수 있다(`head`의 `/404` 변이).
- `head`의 `route:<라우트>`는 그 라우트를 기준선의 같은 페이지와 비교하지 않을 뿐, head 가 없어도 된다는 뜻이 아니다. `<title>`이 비어 있지 않아야 하고, `html lang`·charset·viewport·파비콘·google-site-verification 이 기준선 **홈**의 값과 같아야 하며, `<meta http-equiv="refresh">`와 `<base>`가 없어야 한다. 후보에 라우트가 아예 없는 것은 허용되지 않는다. robots 의 `noindex`는 이 예외에 들어간다(404 페이지는 색인하지 않는다).
- 라우트를 통째로 건너뛰는 검사(`content`, `hover`, `visual`)에서 고른 라우트가 모두 허용 목록에 있으면 그 실행은 실패다(위 "0개를 본 검사").

## 배포 후 검사 (`verify:live`)

`status`(기준선의 모든 라우트·자산·`sitemap.xml`·`robots.txt`가 리다이렉트 없이 200), `head`, `content`, `sitemap`을 HTTP로 읽어 돌린다. `--only`로 고를 수 있다.

배포 워크플로는 방금 배포한 Pages 아티팩트(`github-pages`의 `artifact.tar`, 검사를 통과한 그 `dist/`)를 `.verify/baseline`에 풀어 기준선으로 쓴다. `verify:live`는 `.verify/baseline`만 읽으므로 다시 빌드할 필요가 없다. 그래서 실제 사이트가 배포한 것과 다르면 실패한다. 롤백을 확인할 때는 되돌린 커밋을 기준선으로 준다.

```sh
npm run verify:setup -- --baseline-ref=origin/main
npm run verify:live -- --base-url=https://bigsaigon333.github.io
```

## 실행 요약 넘기기 (reporter)

세 명령(`verify`, `verify:selftest`, `verify:live`)은 끝날 때 실행 요약을 reporter 모듈 하나에 넘긴다. 어느 모듈인지는 환경 변수 `VERIFY_REPORTER`가 정한다.

| `VERIFY_REPORTER` | reporter                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| `off`             | 없다                                                                     |
| 그 밖의 값        | 그 경로의 모듈. 절대 경로이거나 메인 체크아웃의 루트에서 본 상대 경로    |
| 없거나 빈 값      | 메인 체크아웃의 `.verify/reporter.mjs`. 그 파일이 없으면 reporter도 없다 |

메인 체크아웃은 worktree가 아닌 원래 체크아웃이다(`lib/paths.mjs`의 `mainRoot`). 어느 worktree에서 돌려도 같은 모듈을 찾는다. `.verify/`는 git이 무시하는 로컬 상태이고, 검증 장치는 `reporter.mjs`를 만들지 않는다.

모듈의 default export를 요약 하나로 부르고 끝날 때까지 기다린다.

```js
{
  command: "verify", // "verify" | "selftest" | "live"
  ok: false, // 검사가 하나 이상이고 모두 통과했는지. 0개는 통과가 아니다
  durationMs: 42100,
  // 검사마다 하나. 자기 검사는 사례마다 하나이고 check 는 "<검사>/<사례 이름>"이다.
  // failed 는 20개까지, detail 은 200자까지 자른다.
  results: [{ check: "head", ok: false, pass: 13, fail: 1, failed: [{ route: "/404", detail: "…" }] }],
  // 고른 라우트 × 검사 격자. cells 의 키는 "<route>|<check>", 값은 "pass" | "fail" | "skip".
  // verify 는 단계(check, build)를 뺀다. selftest 는 undefined.
  matrix: { routes: ["/404"], checks: ["head"], cells: { "/404|head": "fail" } },
  feature: true, // --feature 로 돌린 verify 에만 있다
}
```

reporter는 종료 코드를 바꾸지 못한다. 불러오지 못하거나 예외를 던지면 stderr에 `verify: reporter <경로> failed: <메시지>` 한 줄을 남기고 그대로 끝난다.
