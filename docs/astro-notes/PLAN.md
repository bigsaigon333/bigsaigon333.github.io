# Astro 블로그 개편 계획

## Context

`bigsaigon333.github.io`는 Next.js 13.4(pages router, `next export`) + styled-components로 만든 정적 블로그로, 2023-06 이후 멈춰 있다. 의존성이 낡아 현재 로컬 환경(Node 24)에서는 설치조차 되지 않는다(`engines: node ^18` + `engine-strict`). 콘텐츠 중심 정적 사이트에 맞는 Astro로 옮기면서, 그 과정을 Astro 학습 과정으로 삼는다.

합의된 결정:

| 항목           | 결정                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 범위           | 먼저 현재 사이트를 1:1로 재현(URL·메타·디자인 동일) → 그다음 개선(RSS, 다크 모드, 태그, View Transitions, 그 외 Astro 기능 전반) |
| 학습           | 단계 1개 = Astro 개념 1개 = 커밋 1개 = 학습 노트 1개. 체크포인트 6곳에서만 멈춤                                                  |
| 배포           | GitHub Actions로 전환 (운영 전환 직전에 확인)                                                                                    |
| Node 버전 관리 | nvm 대신 mise. `mise.toml`의 `[tools] node`가 유일한 출처이고 로컬·worktree·CI가 모두 이 파일을 읽는다                           |
| 서버 전용 기능 | 블로그에는 억지로 넣지 않고, 배포되지 않는 `labs/playground/`에서 실습                                                           |
| 실행 방식      | 메인 세션은 오케스트레이터 역할만 하고, 구현은 Workflow 도구로 웨이브 단위 병렬 서브에이전트에 맡긴다                            |
| 진행 상황 확인 | 로컬 실시간 대시보드 + 터미널 요약 + `/workflows` + Draft PR 체크리스트                                                          |

## 확인된 사실

직접 확인한 것:

- 글 12개(`posts/*.md`), 초안 21개(`posts/draft/draft:*.md`). 초안은 `lib/posts.ts`의 `readdirSync`가 하위 폴더를 읽지 않아 지금도 렌더링되지 않는다. 초안 1개는 frontmatter가 없다.
- frontmatter: `title`, `date`(문자열 `"2022-05-08"`), 선택 `description`, `keywords`(쉼표 구분 문자열), `summary`(미사용).
- 마크다운 파이프라인(`lib/posts.ts`): remark-parse → gfm → math → rehype(`allowDangerousHtml`) → katex → highlight → stringify.
- 글에서 실제 쓰는 기능: 인라인 수식(1개 글, KaTeX span 121개), 각주(2), 표(1), 체크박스·취소선(2), raw HTML(`<details>`, `<img width>`, `<br>`), 원격 이미지(`user-images.githubusercontent.com`), 코드 블록(언어 없음 72개, jsx/js/css/html/ts/tsx/json).
- 스타일: styled-components 5개 파일 약 370줄.
- 외부 연동: GA `G-Y270VJN1Y2`, `google-site-verification` 메타, utterances(`issue-term="title"`, `theme="boxy-light"`), Google Fonts(Source Code Pro), KaTeX 0.16.0 CSS(CDN).
- 현재 배포본 = `origin/gh-pages`(2023-06-25, main HEAD와 동기): `index.html`, `404.html`, `posts/<id>.html` 12개, 정적 자산, `sitemap.xml`(URL 13개, 끝 슬래시 없음), `robots.txt`, `_next/static` 425KB. Pages 설정은 `build_type: legacy`, 소스 `gh-pages` `/`.
- 로컬: Node 24.15.0, npm 11.12.1, `gh` CLI 인증됨(저장소 소유자), Playwright Chromium 캐시와 Chrome 설치됨.
- Node 버전 관리 도구: 이 머신에 nvm은 없고 mise 2026.10.17이 Node를 관리한다(전역 설정 `node = "24"` → 24.15.0). 저장소의 `.nvmrc`(18.12.1)는 어떤 도구도 읽지 않는다(mise의 `.nvmrc` 인식은 꺼져 있다). Node 24의 최신 패치는 24.22.3이다.
- mise 실험 결과: `[tools]`만 있는 `mise.toml`은 `mise trust` 없이 처음 보는 경로에서도 적용된다. 설치되지 않은 버전은 shim이 첫 호출 때 자동 설치한다(약 5초). `[env]`가 들어가면 신뢰하지 않은 경로에서 모든 shim 호출이 오류로 끝난다.
- `withastro/action` v6.1.4의 `action.yml`: Node 버전은 `node-version` 입력(기본 `"24"`)으로만 받고 버전 파일은 읽지 않는다. 내부 동작은 lockfile로 패키지 매니저 판별 → `actions/setup-node` → install → build → `actions/upload-pages-artifact`.
- `actions/setup-node` 문서: `node-version-file`은 `.nvmrc`, `.node-version`, `.tool-versions`, `mise.toml`, `package.json`을 읽는다. 게시 워크플로에서는 패키지 매니저 캐시를 끄라고 권고한다.
- npm 최신 `astro@7.4.11`: Node `>=22.23.4`, Vite 8, Zod 4, Shiki 4, `@astrojs/compiler-rs`, 기본 마크다운 엔진 `@astrojs/markdown-satteri`. 기존 unified 방식은 별도 패키지 `@astrojs/markdown-remark@7.3.8`.

공식 문서 요약으로 얻은 것(모델이 요약한 내용이라 해당 단계에서 재확인):

- 컬렉션 설정은 `src/content.config.ts`, `glob()`은 `astro/loaders`, `z`는 `astro/zod`, 렌더는 `render(entry)`.
- 마크다운 설정은 `markdown.processor: satteri({...}) | unified({...})`. 최상위 `markdown.remarkPlugins` 등은 deprecated.
- `build.format: 'file'`이 `dist/posts/foo.html`을 만든다. `<ClientRouter />`, Fonts API는 안정 기능.
- Astro 문서의 배포 워크플로는 `withastro/action@v6` + `actions/deploy-pages@v5`(이 계획은 `withastro/action`을 쓰지 않는다 → W1의 K1). `@astrojs/sitemap`은 `sitemap-index.xml`만 만든다.
- `docs.astro.build/llms.txt`는 404였다.

**내 Astro 지식은 v6까지다.** v7의 세부 사항은 기억이 아니라 현재 문서를 근거로 삼는다(아래 "문서 우선" 원칙).

## 전역 제약

- 기존 URL은 전부 같은 경로에서 리다이렉트 없이 200으로 응답한다: `/`, `/posts/<id>`, `/sitemap.xml`, `/robots.txt`, 정적 자산.
- 각 글의 `<title>`은 현재 배포본과 바이트 단위로 같아야 한다. utterances가 제목으로 댓글 이슈를 찾기 때문에, Part 2 이후에도 바꾸지 않는다.
- GA ID와 `google-site-verification` 메타를 유지한다.
- Part 1 동안 `posts/` 아래 파일은 한 글자도 바꾸지 않는다(내용 검사가 순수하게 파이프라인만 검증하도록).
- `origin/gh-pages` 브랜치는 수정·삭제하지 않는다(즉시 롤백 대상).
- 저장소 밖으로 나가는 동작(push, PR, Pages 설정, main 병합)은 오케스트레이터만 한다. 서브에이전트는 자기 worktree 안에서 커밋까지만 한다.
- **작업 도구는 main에 들어가지 않는다**(2026-11-13 사용자 지시). `docs/`, `scripts/`, 그것들만 쓰는 npm 스크립트와 devDependencies, 그 경로를 위한 ignore 항목은 작업 브랜치 `astro`에만 있다. `astro`는 main에 병합하지 않고 학습 기록으로 남긴다. main에는 `node scripts/release.mjs --branch=release/<이름>`이 만든 릴리스 브랜치만 PR로 들어간다. 릴리스 스크립트는 릴리스 트리에 작업 도구 파일과 언급이 없는지, 제품 명령(lint, typecheck, check, build, prettier)이 통과하는지, `dist/`가 `astro`의 빌드와 바이트 단위로 같은지를 확인한다. 릴리스가 병합되면 `origin/main`을 `astro`에 다시 병합한다. README와 CI·배포 워크플로는 작업 도구에 의존하지 않는 제품용이고 두 브랜치에서 같다.
- 운영에 영향을 주는 동작(Pages 소스 전환, main 병합)은 체크포인트에서 사용자가 "계속"이라고 한 뒤에만 한다. 체크포인트의 "계속"은 그 마일스톤의 main 병합·배포 승인을 뜻한다. 작업 브랜치 push와 Draft PR 생성은 이 계획의 승인으로 진행한다.
- 검사를 통과시키려고 검사를 약화하지 않는다. 허용할 차이는 `scripts/verify/allowlist.json`에 사유와 함께 기록하고 학습 노트에도 적는다.
- Node 버전은 mise로 관리한다(nvm과 `.nvmrc`는 쓰지 않는다). `mise.toml`의 `[tools] node = "24.22.3"`(정확한 버전)이 유일한 출처이고, 워크플로와 스크립트에는 Node 버전을 적지 않는다. `mise.toml`에는 `[tools]`만 둔다(`[env]`나 tasks를 넣으면 worktree마다 `mise trust`가 필요해진다). `package.json`의 `engines.node`는 `>=24` 하한만 둔다.
- 패키지 매니저는 npm, lockfile 커밋. 커밋 메시지는 기존 관례(`feat: …한다`)에 단계 번호를 붙인다: `feat(S1.3): …한다`.
- 빌드·CI에서 `ASTRO_TELEMETRY_DISABLED=1`.

## 작업 원칙

### 1. 닫힌 고리 (두 층)

**에이전트 층.** 각 서브에이전트는 자기 worktree에서 단계마다 같은 순서를 따른다.

1. **근거**: `docs/astro-notes/_refs/`의 해당 문서 요약을 읽는다.
2. **Red**: 게이트 검사가 예상한 이유로 실패하는지 본다.
3. **구현**.
4. **검증**: `npm run verify -- --only=… --route=…`로 자기 게이트를 돌린다.
5. **실패 시**: 리포트 파일에서 원인을 찾아 근본 원인을 고친다. 서로 다른 가설 3개가 실패하면 `blocked`로 증거와 함께 반환한다.
6. **통과 시**: 커밋하고 학습 노트를 쓴다.

**통합 층.** 웨이브가 끝나면 오케스트레이터가 브랜치를 병합하고 `npm run verify` 전체를 돌린다. 에이전트의 "통과" 보고는 믿지 않고 통합본에서 다시 확인한다. 실패하면 원인 단계의 에이전트를 재투입하거나 작은 것은 직접 고친다. `blocked`가 두 번 반복되면 사용자에게 보고한다.

정답지는 현재 배포본(`origin/gh-pages`)이다. 사람이 눈으로 확인하는 대신 스크립트가 배포본과 새 빌드를 비교한다.

### 2. 문서 우선

- 웨이브 시작 전에 문서 스카우트(`web-fetch` 에이전트)들이 그 웨이브 개념의 공식 문서를 병렬로 읽고 40줄 이내 요약을 반환한다. 오케스트레이터가 이를 `docs/astro-notes/_refs/<개념>.md`에 저장한다.
- 구현 에이전트는 `_refs/`만 읽는다. 같은 문서를 여러 에이전트가 반복해서 읽지 않는다.
- 문서와 기억이 다르면 문서를 따른다. 문서에 없으면 짧은 스파이크로 확인하고 결과를 노트에 적는다.

### 3. 토큰 효율

- 오케스트레이터의 컨텍스트에는 요약만 들어온다. 에이전트는 정해진 스키마(아래)로만 반환하고, 파일 내용이나 로그를 돌려보내지 않는다.
- 브리프는 내용을 붙여 넣지 않고 경로로 가리킨다: 계획 사본의 해당 절, `_refs/<개념>.md`, `git show main:<예전 파일>`.
- `npm run verify`는 검사당 한 줄만 출력하고 상세는 `.verify/report/`에 쓴다. 실패한 항목의 리포트만 `grep`으로 잘라 읽는다.
- 스크린샷은 통과한 것은 보지 않는다. 실패 시 차이 영역만 잘라낸 이미지를 본다.
- CSS는 값을 그대로 옮긴다(재설계 금지).
- 문서 스카우트와 기계적 이식 단계(CSS 이식, 도구 설정)는 낮은 effort로 돌리고, 나머지는 세션 설정을 상속한다. 모델은 바꾸지 않는다.
- 동시에 도는 구현 에이전트는 최대 5개. 빌드와 브라우저 검사가 CPU를 나눠 쓰면 시각 검사가 불안정해지기 때문이다.
- 진행 상태는 git 히스토리, `.progress/events.jsonl`, 노트에 둔다. 세션이 바뀌어도 이것들로 이어 간다.

### 4. 학습 산출물과 체크포인트

학습 노트는 그 단계를 구현한 에이전트가 `docs/astro-notes/NN-<slug>.md`(한국어, 60줄 안팎)에 다음 형식으로 쓴다.

1. 한 줄 요약
2. 개념: Astro가 여기서 하는 일
3. Next.js 대응: 이 저장소의 예전 코드 ↔ 새 코드(파일 경로)
4. 빌드 결과물에서 확인하기: `dist/`의 어느 파일, 어느 부분
5. 닫힌 고리가 잡아낸 것: 실패 → 원인 → 수정
6. 직접 해볼 실험 2~3개(예상 결과는 `<details>`로 접어 둠)
7. 문서 근거(URL)

형식은 `scripts/notes-lint.mjs`가 검사한다(7개 절 존재, 실험 2개 이상, 문서 URL 존재, 80줄 이하). 통합 게이트에 포함한다.

체크포인트에서는 한 일, 검증 요약, 읽을 노트 순서, 다음 웨이브에서 정할 것을 짧게 전달하고 멈춘다. 사용자가 개입하는 지점은 계획 승인, 체크포인트 6곳(CP3는 운영 전환 승인을 겸함), `blocked` 반복 시 보고뿐이다.

## 오케스트레이션

### 역할

| 역할                       | 하는 일                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| 오케스트레이터(메인 세션)  | 계약·브리프 작성, 웨이브 실행(Workflow), 병합, 통합 검증, 대시보드 이벤트, push·PR·배포, 체크포인트 보고 |
| 문서 스카우트(`web-fetch`) | 공식 문서를 읽고 요약 반환. 파일을 쓰지 않는다                                                           |
| 구현 에이전트              | 단계 구현 + 자기 게이트 통과 + 커밋 + 노트. `isolation: 'worktree'`                                      |
| 리뷰어                     | 읽기 전용 독립 리뷰. 운영 전환 직전과 종료 시                                                            |

### 병렬 실행 규칙

- **worktree 격리.** 병렬 구현 에이전트는 각자 git worktree에서 일한다. `dist/`, `.astro/`가 겹치지 않아 동시에 빌드할 수 있다. 웨이브를 띄우기 전에 통합 브랜치는 반드시 커밋된 상태여야 한다.
- **worktree 준비.** 에이전트의 첫 명령은 `npm run verify:setup`이다(`npm ci`, 기준선 추출, 응답 캐시 연결). Node는 따로 준비하지 않는다. worktree에 체크아웃된 `mise.toml`을 mise shim이 읽고, 설치본은 머신 전체가 공유한다.
- **파일 소유권.** 웨이브마다 에이전트별 소유 파일을 정한다. 소유 파일 밖은 수정하지 않고, 필요하면 반환값의 `needs`에 적는다. 소유권이 겹치는 단계는 한 에이전트에 묶거나 다음 웨이브로 미룬다.
- **이음매 커밋.** 웨이브 전에 오케스트레이터가 공유 파일을 쪼개 둔다. 예: `astro.config.mjs`는 `config/<관심사>.mjs`를 조합만 하고, 페이지는 스텁 컴포넌트를 미리 배치해 각 에이전트가 자기 컴포넌트 파일만 채우게 한다.
- **의존성.** 에이전트는 의존성을 바꾸지 않는다. 그 웨이브에 필요한 패키지는 이음매 커밋에서 미리 설치하고, 제거는 통합 때 한다.
- **포트.** 검증용 서버는 임시 포트(0)를 쓴다.
- **병합 순서.** 웨이브 표에 적힌 순서대로 병합하고, 병합마다 `astro check`와 빌드를 확인한 뒤 마지막에 전체 검증을 돌린다.

### 브리프와 반환값

브리프 구성: 단계와 개념 / 소유 파일 / 계약(다른 에이전트와 맞출 props·함수 시그니처) / 읽을 경로 / 게이트 명령과 통과 조건 / 절차(닫힌 고리 + 진행 이벤트 기록) / 금지 사항(의존성 변경, 검사 약화, `posts/` 수정, push) / 산출물.

반환 스키마:

```
{ stage, status: 'pass' | 'blocked', branch, commits: [sha],
  gate: { command, summary },            // 검사당 한 줄
  filesChanged: [path], allowlistAdded: [{ item, reason }],
  needs: [string],                       // 오케스트레이터가 해 줄 것
  surprises: [string],                   // 문서·예상과 달랐던 것, 3개 이내
  notePaths: [path] }
```

### 오케스트레이션 스파이크 (S0.3)

첫 웨이브 전에 에이전트 1개짜리 Workflow로 다음을 확인한다: worktree의 기준 커밋이 통합 브랜치 HEAD인지, 에이전트의 커밋을 메인 체크아웃에서 병합할 수 있는지, worktree에서 메인 체크아웃의 `.progress/`에 이벤트를 쓸 수 있는지, worktree에서 `node -v`가 `mise.toml`의 버전과 같은지, `verify:setup` 소요 시간. 하나라도 안 되면 그 웨이브는 같은 편성으로 순차 실행한다.

## 실시간 진행 상황 확인

기록은 한 곳에 모은다: 메인 체크아웃의 `.progress/events.jsonl`(추가 전용, gitignore).

| 누가                     | 무엇을 기록                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 오케스트레이터           | 웨이브 시작·종료, 병합, 통합 게이트 결과, 체크포인트 대기, 배포 상태                                                      |
| 구현 에이전트            | 단계 시작, 닫힌 고리의 현재 위치(근거/Red/구현/검증), 시도 횟수, 완료 또는 `blocked` (`node scripts/progress/emit.mjs …`) |
| `scripts/verify/run.mjs` | 검증을 돌릴 때마다 검사별 결과를 자동 기록(에이전트가 잊어도 남는다)                                                      |

보는 방법:

| 방법                                         | 내용                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `http://localhost:4400` (`npm run progress`) | 의존성 없는 Node 서버 + HTML 한 장, SSE로 실시간 갱신. S0.0에서 백그라운드로 띄우고 주소를 알린다 |
| `npm run progress:watch`                     | 같은 내용을 터미널 한 화면으로 요약, 2초마다 갱신                                                 |
| `/workflows`                                 | 실행 중인 웨이브의 에이전트별 상태(Claude Code 내장)                                              |
| Draft PR                                     | 본문의 단계 체크리스트를 웨이브마다 갱신. CI 결과와 함께 원격·모바일에서 확인                     |

대시보드 화면 구성:

- **상단**: 현재 웨이브, 완료 단계 수 / 전체, 다음 체크포인트, 경과 시간, 에이전트가 보고한 토큰 사용량.
- **단계 보드**: 웨이브별 열. 단계마다 상태(대기, 근거, Red, 구현, 검증, 통과, 실패, 차단), 담당 에이전트, 시도 횟수, 커밋, 노트 링크.
- **검증 매트릭스**: 라우트 × 검사 격자(최근 통합 검증). 실패 칸을 누르면 리포트와 차이 이미지.
- **지금 볼 것**: 체크포인트 대기 여부와 읽을 노트 목록.
- **이벤트 로그**: 최근 50건.

## 검증 장치 설계 (`scripts/verify/`)

검사는 `checks/<이름>.mjs`가 `{ name, kind: 'static' | 'browser', run(ctx) }`를 export하는 모듈이고, `run.mjs`가 폴더를 훑어 자동으로 싣는다. 검사를 병렬로 만들어도 공유 파일을 건드리지 않는다.

| 파일        | 역할                                                                                                                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serve.mjs` | GitHub Pages의 경로 해석을 흉내 내는 의존성 없는 정적 서버: `/p` → `p` → `p.html` → `p/index.html` → `404.html`(404). 기준선과 `dist/` 양쪽에 같은 서버를 쓴다                                                                           |
| `routes`    | HTML 라우트 집합 일치(`/`, `/posts/<id>` 12개, `/404`). `public` 자산은 sha256 일치                                                                                                                                                      |
| `head`      | 라우트별 `html[lang]`, `<title>`(바이트 일치), description/author/keywords(목록 정규화)/viewport/site-verification, canonical, `og:*`, `twitter:*`, icon                                                                                 |
| `content`   | 본문 루트(`main`)의 정규화 텍스트 완전 일치 + 구조 일치: 제목(레벨+텍스트), `pre` 텍스트, 링크 `href`, 이미지 `src/alt/width`, 표 셀, `details`, 체크박스, 취소선, 각주, 수식의 TeX 원문. 홈은 (href, 제목, `datetime`, 날짜) 순서 목록  |
| `links`     | `dist`의 모든 내부 `href/src`가 실제 파일로 해석됨. `/_next/` 참조 0건                                                                                                                                                                   |
| `embeds`    | GA ID가 모든 페이지에 있음. 글 페이지에만 utterances 스크립트가 올바른 속성으로 삽입됨(Playwright, 네트워크 차단)                                                                                                                        |
| `sitemap`   | `/sitemap.xml`의 `<loc>` 집합이 기준선과 일치, `robots.txt` 동일                                                                                                                                                                         |
| `budget`    | 페이지별 JS·CSS 개수와 바이트를 기준선과 나란히 출력. 1차 JS 예산 초과 시 FAIL                                                                                                                                                           |
| `visual`    | Playwright로 13개 라우트 × 6개 뷰포트(375, 414, 600, 700, 768, 1280) 전체 페이지 스크린샷 비교. 페이지 높이 일치 + 색 허용 오차 0, 다른 픽셀 0개. `--selector=`로 요소 단위 비교도 지원. 실패 시 차이 이미지와 영역 좌표를 리포트에 저장 |
| `run.mjs`   | `npm run check` → `astro build --force` → 정적 검사 → 시각 검사. `--only=`, `--route=`, `--static` 지원. 결과를 `.progress/`에 자동 기록                                                                                                 |
| `live.mjs`  | 배포 후 실제 URL 대상: 200, 리다이렉트 없음, `<title>` 일치, `head`·`content` 검사 재사용                                                                                                                                                |

시각 검사의 결정성:

- GA, utterances 요청은 차단한다.
- 그 외 외부 응답(폰트, KaTeX CSS, 원격 이미지)은 첫 실행 때 `.verify/cache/`에 저장하고 이후 재생한다.
- `document.fonts.ready`와 네트워크 유휴를 기다리고 애니메이션을 끈다. 불안정하면 한 번 재시도한다.

검증 장치 자체의 검증(`npm run verify:selftest`):

- 기준선 ↔ 기준선은 전부 PASS여야 한다. 이때 시각 노이즈 바닥을 재서 임계값을 정한다.
- 기준선 ↔ 변이본(제목 변경, 문단 삭제, CSS 값 변경, 링크 깨기)은 각각 해당 검사가 FAIL이어야 한다.

npm 스크립트: `verify`, `verify:setup`, `verify:selftest`, `verify:live`, `progress`, `progress:watch`. 도구 의존성: `playwright`, `pixelmatch`, `pngjs`, `cheerio`.

## 목표 파일 구조 (Part 1 종료 시점)

```
astro.config.mjs            site, build.format: 'file', config/*.mjs 조합
config/markdown.mjs         markdown.processor 설정
src/content.config.ts       posts 컬렉션(glob 로더, Zod 스키마)
src/lib/site.ts             SITE 상수(url, title, author, description, keywords, gaId)
src/lib/posts.ts            getPublishedPosts(): 날짜 내림차순
src/layouts/BaseLayout.astro    Seo + HeadAssets + Analytics + slot 조합
src/components/             Seo, HeadAssets, Header, Footer, PostHeader, Analytics, Comments
src/pages/index.astro
src/pages/posts/[id].astro
src/pages/404.astro
src/pages/sitemap.xml.ts
src/styles/global.css       css-remedy + 전역 스타일
src/styles/prose.css        글 본문 스타일
posts/                      그대로(로더의 base로 지정)
public/                     그대로(vercel.svg, 커밋돼 있던 sitemap.xml 제거)
scripts/verify/             검증 장치
scripts/progress/           emit.mjs, server.mjs, index.html, watch.mjs
docs/astro-notes/           학습 노트, _refs/(문서 요약), PLAN.md(이 계획 사본)
.github/workflows/          ci.yml, deploy.yml
mise.toml                   Node 버전 고정([tools]만)
```

삭제 대상: `pages/`, `components/`, `lib/`, `constant/`, `styles/`, `next*.js`, `next-env.d.ts`, `.eslintrc.json`, `.eslintignore`, `.stylelintrc.json`, `.nvmrc`, Next 관련 의존성 전부. 예전 코드는 `git show main:<path>`로 참조한다.

## 단계 계획

### Part 1 — 1:1 이전 (작업 브랜치 `astro`, main에는 릴리스 브랜치로)

**W0 준비** — 오케스트레이터가 직접 하고, 문서 스카우트 6개가 동시에 돈다.

| 단계        | 내용                                                                                                                                                                                                                  | 게이트                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| S0.0        | 진행 대시보드(`scripts/progress/`) 작성, 서버 기동                                                                                                                                                                    | 시험 이벤트가 `localhost:4400`에 표시됨                   |
| S0.1        | 브랜치 생성, Next 소스·설정과 `.nvmrc` 삭제, `mise.toml` 작성 후 `mise install`, `package.json` 재작성(Part 1 의존성 전부, `engines.node` `>=24`), `.gitignore`에 `dist/ .astro/ .verify/ .progress/`, 계획 사본 커밋 | `node -v`가 `mise.toml`의 버전과 같음, `npm install` 성공 |
| S0.2        | 기준선 추출(`verify:setup`), `serve.mjs`, `run.mjs`와 검사 모듈 인터페이스                                                                                                                                            | 기준선의 `/posts/<id>`가 200                              |
| S0.3        | 오케스트레이션 스파이크                                                                                                                                                                                               | 위 5개 항목 확인                                          |
| 스카우트 ×6 | 구조·설정·`build.format` / 컴포넌트·레이아웃·스타일 / 콘텐츠 컬렉션 / 라우팅·엔드포인트·404 / 마크다운 processor·구문 강조 / 스크립트·GitHub Pages 배포(`actions/setup-node`의 `node-version-file` 포함)              | `_refs/` 6개 저장                                         |

**W1 검증 장치 + 워킹 스켈레톤** — 병렬 4

| 에이전트 | 단계(Astro 개념)                                                                                                                 | 소유 파일                                                                                                                                                                                                       | 게이트                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1       | 정적 검사기                                                                                                                      | `checks/{routes,head,content,links,sitemap,budget}.mjs`, 정적 selftest                                                                                                                                          | 동일본 PASS, 변이본 FAIL                                                                                                                                                |
| V2       | 브라우저 검사기                                                                                                                  | `checks/{visual,embeds}.mjs`, `lib/browser.mjs`, 응답 캐시, 노이즈 측정                                                                                                                                         | 동일본 PASS, CSS 변이본 FAIL, 임계값 확정                                                                                                                               |
| SK       | S1.1 프로젝트 구조·CLI·설정 / S1.3 콘텐츠 컬렉션(로더, 스키마, `getCollection`) / S2.1 동적 라우트(`getStaticPaths`, `render()`) | `astro.config.mjs`, `config/markdown.mjs`(기본값), `tsconfig.json`, `src/content.config.ts`, `src/lib/posts.ts`, `src/pages/**`, `PostHeader`, 스텁(`BaseLayout`, `Seo`, `HeadAssets`, `Analytics`, `Comments`) | `astro check` 오류 0, `dist`에 14개 라우트. 잘못된 frontmatter 픽스처로 빌드가 파일명을 짚으며 실패. `TZ=Asia/Seoul`과 `TZ=America/Los_Angeles` 빌드의 날짜 문자열 동일 |
| K1       | 도구·CI                                                                                                                          | prettier 설정, husky 9 + lint-staged, `ci.yml`, `deploy.yml`, README                                                                                                                                            | `prettier --check`(설정 파일), 워크플로 YAML 문법 검사, 워크플로에 Node 버전 리터럴 0건                                                                                 |

K1의 두 워크플로는 Node를 `actions/setup-node`의 `node-version-file: mise.toml`로 설정한다. `deploy.yml`은 `withastro/action`을 쓰지 않고 같은 일을 직접 적는다: checkout → setup-node → `npm ci` → `npm run build` → `actions/upload-pages-artifact`(`dist`) → `actions/deploy-pages`. `withastro/action`은 버전 파일을 읽지 못해 Node 버전을 워크플로에 한 번 더 적어야 하기 때문이다. `deploy.yml`에서는 npm 캐시를 끈다(게시 워크플로에 대한 setup-node 문서의 권고). README의 준비 절차는 `mise install` → `npm ci`다. Draft PR의 첫 CI 실행에서 오케스트레이터가 로그의 Node 버전이 `mise.toml`과 같은지 확인한다.

SK는 스타일 없는 시맨틱 마크업으로 14개 라우트를 끝까지 연결한다. 이후 웨이브의 에이전트가 실제 페이지를 대상으로 자기 게이트를 돌릴 수 있게 하기 위해서다.

스키마(S1.3): `title: string`, `date: 문자열 → Date`, `description: 기본값 ""`, `keywords: "a, b" → string[]`(없으면 `[]`), `summary: 선택`. 로더 패턴은 `*.md`(하위 폴더 제외)라서 초안은 지금처럼 빠진다. 날짜 표시는 `toISOString().slice(0, 10)`. canonical은 예전 코드처럼 `id`로 직접 조립한다.

통합 게이트: `verify:selftest` 통과, `routes` 14/14, `content`에서 `/` 통과. 통합 후 브랜치를 push하고 Draft PR을 연다.

→ **CP1** (검증 장치, 프로젝트 구조, 콘텐츠 컬렉션, 라우팅)

**W2 페이지 완성** — 병렬 3 (+ 다음 웨이브용 스카우트)

| 에이전트 | 단계(Astro 개념)                                                                    | 소유 파일                                                                                 | 게이트                                                  |
| -------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| T1       | S2.2 마크다운 파이프라인                                                            | `config/markdown.mjs`                                                                     | `content`에서 글 12개 통과                              |
| T2       | S1.2 컴포넌트·props·레이아웃·`<slot />` / S1.4 scoped 스타일·`is:global`·CSS 번들링 | `BaseLayout`, `Seo`, `Header`, `Footer`, `site.ts`, `global.css`, `src/pages/**`의 마크업 | `head` 전 라우트 통과, `visual`에서 `/` 3개 뷰포트 통과 |
| T4       | S2.4 `<script>` 처리와 `is:inline` / S2.5 정적 엔드포인트·404                       | `Analytics`, `Comments`, `sitemap.xml.ts`, `404.astro`                                    | `embeds`, `sitemap`, `links` 통과                       |

S2.2는 기존과 같은 unified 계열(`@astrojs/markdown-remark` + remark-math, rehype-katex, rehype-highlight)로 먼저 재현한다. 같은 HTML 구조와 같은 CSS여야 코드 블록까지 픽셀 비교가 가능하고, Astro의 마크다운 파이프라인이 이미 아는 unified라는 점도 확인할 수 있다. Astro 기본 엔진(Sätteri + Shiki)으로의 전환은 S4.1에서 의도한 개선으로 따로 한다.

404 페이지는 Next 기본 화면을 재현하지 않고 사이트 레이아웃을 쓴다(allowlist에 기록).

**W3 시각 일치 수렴** — 구현 1 + 리뷰 1 병렬

| 에이전트 | 단계                                 | 소유 파일                                                                                               | 게이트                                                   |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| T3       | S2.3 전역 CSS 가져오기, 서드파티 CSS | `prose.css`, `HeadAssets`(폰트·KaTeX 링크, highlight.js monokai), 시각 차이 수정에 필요한 스타일·마크업 | `visual` 전 라우트 통과 → **`npm run verify` 전체 PASS** |
| R1       | 독립 리뷰(읽기 전용)                 | —                                                                                                       | 지적 사항 목록                                           |

시각 일치는 내용과 스타일이 합쳐져야 판정할 수 있어서 병렬로 나누지 않는다. 통합 뒤 오케스트레이터가 prettier를 한 번 적용하고 리뷰 지적을 반영한다.

→ **CP2** (마크다운, 컴포넌트·레이아웃, 스타일, 스크립트, 엔드포인트)

**W4 운영 전환** — 오케스트레이터

| 단계 | 내용                                | 게이트                                                  |
| ---- | ----------------------------------- | ------------------------------------------------------- |
| S3.1 | PR을 리뷰 가능 상태로 전환, CI 확인 | `gh pr checks --watch` 통과, `npm run verify` 전체 PASS |

→ **CP3 (운영 전환 승인)**

| 단계 | 내용                                                                                                                                                             | 게이트                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| S3.2 | ① `gh api -X PUT repos/bigsaigon333/bigsaigon333.github.io/pages -f build_type=workflow` ② 릴리스 PR 병합 ③ `gh run watch --exit-status` ④ `npm run verify:live` | 실제 URL 13개 + 자산 + sitemap이 200, 리다이렉트 없음, `<title>` 일치 |

롤백: `gh api -X PUT …/pages -f build_type=legacy -f 'source[branch]=gh-pages' -f 'source[path]=/'` 후 기준선 복귀 확인: `npm run verify:live -- --base-url=<url> --only=status,head,content,sitemap`은 통과하고 `--only=migrated`는 실패해야 한다(예전 배포본은 `migrated` 검사를 통과할 수 없다). `github-pages` 환경의 배포 브랜치 제한으로 deploy가 막히면 환경 정책에 `main`을 추가한다.

전환이 성공하면 결과만 짧게 알리고 Part 2로 이어 간다.

### Part 2 — 개선 (마일스톤마다 `astro`에서 통합 → 릴리스 브랜치 + PR, 체크포인트에서 병합)

**S4.0 기준선 교체** (오케스트레이터)

- `.verify/baseline/`을 전환 커밋의 `dist/`로 바꾼다. 이후 원칙은 "의도한 차이만 허용"이다. 각 단계가 바뀌어도 되는 영역을 선언하고, 나머지는 기준선과 같아야 한다.
- Lighthouse 4개 점수와 axe 위반 수를 측정해 "회귀 금지" 기준으로 고정한다.
- 스카우트가 공식 문서 사이드바의 기능 목록을 가져오면 아래 표와 대조해 빠진 기능을 W5~W9에 추가한다.

아래 편성은 1차 안이다. 각 웨이브 직전에 이음매 커밋을 만들면서 소유 파일을 확정하고 대시보드에 올린다.

**W5 Astro 네이티브 파이프라인** — 병렬 4

| 단계 | Astro 개념                                       | 내용                                                            | 소유 파일                                             | 게이트                                                                |
| ---- | ------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| S4.1 | Sätteri, Shiki, `<Code />`                       | 엔진을 기본값으로 전환, 라이트·다크 듀얼 테마                   | `config/markdown.mjs`, `src/styles/code.css`          | 본문 텍스트 일치 유지, `pre`를 가리면 시각 동일                       |
| S4.2 | Fonts API, CSS import                            | Source Code Pro와 KaTeX CSS 자체 호스팅                         | `config/fonts.mjs`, `HeadAssets`                      | 외부 요청이 GA·utterances·본문 원격 이미지뿐, 시각 동일               |
| S4.3 | `astro:assets`(`Image`, `Picture`), SVG 컴포넌트 | 프로필 이미지 최적화, 아이콘 PNG → SVG, 본문 원격 이미지 로컬화 | `Header`, `src/assets/**`, `posts/*.md`의 이미지 경로 | 이미지 요청 전부 same-origin, 렌더 크기 동일, 이미지 바이트 감소 수치 |
| S4.4 | `import.meta.env`, 컬렉션 필터                   | 초안 파일명 정리(`draft:` 제거), dev에서만 노출                 | `content.config.ts`, `posts.ts`, `posts/draft/**`     | 운영 `dist`·sitemap에 초안 0건, dev에서는 보임                        |

**W6 콘텐츠 모델 확장** — 병렬 5

| 단계 | Astro 개념                   | 내용                                                         | 게이트                                                                  |
| ---- | ---------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| S5.1 | 컬렉션에서 동적 라우트 파생  | `/tags`, `/tags/[tag]`(keywords 활용, 한글·공백 슬러그 규칙) | 태그별 글 집합이 frontmatter 계산값과 일치, 인코딩된 URL이 `links` 통과 |
| S5.2 | `file()` 로더, `reference()` | `series` 컬렉션, css-masters-2 1~4주차 이전/다음             | 4개 글의 prev/next 순서 정확                                            |
| S5.3 | `render()`의 `headings`      | 목차, 읽는 시간                                              | 목차 항목 = 본문 h2/h3, 앵커 대상 존재                                  |
| S5.4 | 엔드포인트 + `@astrojs/rss`  | `/rss.xml`, `<link rel="alternate">`                         | XML 유효, 항목 12개, link = canonical                                   |
| S5.5 | MDX, 통합(`astro add`)       | `@astrojs/mdx`, 커스텀 컴포넌트를 초안 1개로 시연            | 기존 md 결과 불변, `astro check` 통과                                   |

이음매 커밋: `[id].astro`에 스텁 `PostTags`, `SeriesNav`, `Toc` 배치, 컬렉션 정의를 파일별로 분리, `@astrojs/rss`·`@astrojs/mdx` 설치.

→ **CP4**

**W7 인터랙션** — 병렬 2, 이어서 단독 1

| 단계        | Astro 개념                                                 | 내용                                                | 게이트                                                                                       |
| ----------- | ---------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| S6.1        | CSS 변수, `is:inline`, `define:vars`                       | 다크 모드(시스템 연동 + 토글, utterances 테마 연동) | 라이트 스크린샷은 기준선과 동일, 다크에서 axe 대비 위반 0, 첫 페인트 전 테마 적용, 선택 유지 |
| S6.3        | 번들되는 `<script>`, 커스텀 엘리먼트                       | 코드 복사 버튼, 목차 스크롤 스파이                  | Playwright 동작 검증, JS 예산 이내                                                           |
| S6.2 (단독) | `<ClientRouter />`, `transition:*`, 라이프사이클, prefetch | 페이지 전환                                         | 이동 시 문서 리로드 없음, 이동마다 utterances 로드와 GA page_view 1회, 다크 모드 유지        |

S6.2는 모든 스크립트의 수명주기를 바꾸므로 앞의 둘이 통합된 뒤 혼자 돈다.

**W8 플랫폼** — 병렬 3, 이어서 단독 1

| 단계        | Astro 개념                    | 내용                                        | 게이트                                   |
| ----------- | ----------------------------- | ------------------------------------------- | ---------------------------------------- |
| S7.1        | `astro:env`                   | GA ID 등 타입 안전 환경 변수                | `astro check` 통과, 값 누락 시 빌드 실패 |
| S7.3        | Integration API               | `astro:build:done` 훅에서 링크·JS 예산 검사 | 일부러 깨뜨린 링크로 빌드 실패           |
| S7.4        | Vitest, Container API(실험적) | `Seo.astro` 단위 테스트                     | `npm test` 통과, CI 연결                 |
| S7.2 (단독) | CSP                           | GA·utterances 허용 목록                     | 콘솔 CSP 위반 0, 임베드 정상             |

S7.2는 사이트의 모든 인라인 스크립트를 알아야 하므로 마지막에 혼자 돈다.

→ **CP5**

### Part 3 — 서버 기능 실습과 마무리

**lab 레인** (`labs/playground/`, 별도 `package.json`, 배포 대상 아님) — W7~W8과 동시에 진행. 블로그 코드와 파일이 겹치지 않는다. 스캐폴드 1개가 어댑터와 공유 설정을 잡은 뒤 데모 5개가 병렬로 돈다.

| 단계 | 다루는 기능                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------- |
| S8.1 | Node 어댑터, on-demand 렌더링과 `prerender`, API 엔드포인트(GET/POST), 쿠키                             |
| S8.2 | Actions, 세션                                                                                           |
| S8.3 | 서버 아일랜드와 클라이언트 아일랜드(UI 프레임워크 + `client:*`) 비교                                    |
| S8.4 | 요청 시점 미들웨어, redirects/rewrites, i18n 라우팅, `paginate()`                                       |
| S8.5 | v7 신규(`cache`/`routeRules`, advanced routing과 `src/fetch.ts`, `logger`), live 컬렉션, dev toolbar 앱 |

공통 게이트: `labs/playground/verify.mjs`가 서버를 띄우고 HTTP·Playwright 단언을 통과. 단계마다 노트 1개.

**W9 마무리** — 병렬 2

| 단계 | 내용                                                                                                                                                           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S9.1 | 작업 도구는 처음부터 main에 없으므로 제거할 것은 없다. 제품에 오래 남길 검사가 있는지(예: 링크, 접근성) 정하고, 남긴다면 작업 도구와 무관한 제품 코드로 옮긴다 |
| S9.2 | 최종 독립 리뷰, 기능 커버리지 표 확정, 노트 인덱스 정리                                                                                                        |

→ **CP6**

블로그에 넣지 않는 것(요청하면 추가): OG 이미지 자동 생성, Pagefind 검색, Tailwind. `@astrojs/sitemap`은 `/sitemap.xml` URL을 유지할 수 없어 커스텀 엔드포인트를 쓰고 노트에서 비교만 한다. Astro DB는 v7에서 제거됐다.

## 위험과 결정 규칙

| 위험                                                                  | 결정 규칙                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unified 계열로 기준선 HTML을 재현하지 못함(플러그인 메이저 버전 차이) | 텍스트·구조·픽셀이 같으면 마크업 차이는 허용. highlight.js 토큰 차이는 `overrides`로 11.5.1 고정을 먼저 시도. 그래도 안 되면 Sätteri + Shiki로 직행하고 `pre`를 가린 시각 비교로 대체(allowlist 기록) |
| `posts/`를 `src/` 밖에 두면 로더가 못 읽음                            | SK가 스파이크. 안 되면 `git mv posts src/content/posts`                                                                                                                                               |
| smartypants 기본값이 따옴표·대시를 바꿈                               | 끈다(`content` 검사가 잡는다)                                                                                                                                                                         |
| 제목에 자동으로 붙는 `id`                                             | 추가만 되는 변화라 허용                                                                                                                                                                               |
| 외부 리소스(폰트, 이미지) 때문에 스크린샷이 흔들림                    | 응답 캐시 재생으로 고정                                                                                                                                                                               |
| Rust 컴파일러가 닫히지 않은 태그·잘못된 중첩을 오류로 처리            | 유효한 HTML로 작성, `astro check`를 게이트에 포함                                                                                                                                                     |
| 한글·공백이 든 태그의 URL                                             | S5.1에서 슬러그 규칙을 정하고 `links`와 `verify:live`로 확인                                                                                                                                          |
| 병렬 에이전트의 병합 충돌                                             | 파일 소유권 + 이음매 커밋으로 예방. 그래도 충돌하면 오케스트레이터가 해소하고, 같은 파일에서 두 번 나면 그 단계들을 다음부터 순차로 돌린다                                                            |
| worktree 격리가 기대대로 동작하지 않음                                | S0.3 스파이크로 먼저 확인. 안 되면 같은 편성으로 순차 실행                                                                                                                                            |
| 동시 빌드·브라우저 검사로 시각 검사가 불안정                          | 동시 구현 에이전트 5개 이하, 시각 검사 1회 재시도, 통합 검증은 다른 에이전트가 돌지 않을 때 실행                                                                                                      |
| `actions/setup-node`가 `mise.toml`의 Node 버전을 읽지 못함            | `jdx/mise-action@v5`로 바꾼다(CI에 mise를 설치해 같은 파일을 읽는다). 워크플로에 버전을 직접 적지는 않는다                                                                                            |
| 에이전트가 진행 이벤트를 기록하지 않음                                | `run.mjs`의 자동 기록과 오케스트레이터의 웨이브 이벤트로 최소한의 가시성 보장                                                                                                                         |

## Review Focus

단계 게이트만으로는 드러나지 않을 수 있어 테스트를 명시적으로 붙이는 항목:

1. 새 글의 frontmatter 오류(날짜 오타, 필드 누락)가 조용히 넘어가지 않고 파일명을 짚는 빌드 오류가 되는가 → SK(S1.3) 픽스처 테스트.
2. 빌드 환경의 시간대(로컬 KST, CI UTC)에 따라 날짜가 달라지지 않는가 → SK(S1.3) 두 시간대 빌드 비교.
3. 초안이 운영 빌드, sitemap, RSS, 태그 페이지에 새지 않는가 → S4.4, S5.1, S5.4 게이트에 각각 포함.
4. 클라이언트 라우팅 이후 utterances와 GA가 계속 동작하는가 → S6.2 Playwright 시나리오(홈 → 글 → 다른 글 → 뒤로).
5. 다크 모드에서 첫 페인트 깜빡임이 없는가, 저장된 선택과 시스템 설정이 충돌할 때 저장된 선택이 이기는가 → S6.1 Playwright 시나리오.

## 검증 (끝에서 끝까지)

- `npm run verify:selftest`: 검증 장치가 차이를 실제로 잡아내는지 확인.
- `npm run verify`: `npm run check` → `astro build --force` → 정적 검사 → 시각 검사. Part 1 완료 기준은 통합 브랜치에서 전체 PASS와 사유가 적힌 allowlist뿐이다.
- 웨이브마다: 에이전트 반환값의 게이트 요약을 통합 검증 결과와 대조한다. 어긋나면 통합 검증을 따른다.
- PR의 CI: `astro check`, build, `verify --static`.
- `npm run verify:live`: 배포 후 실제 URL에서 상태 코드, 리다이렉트, `<title>`, 메타, 본문 확인.
- Part 2: 단계별 수용 검사 + "의도한 차이만 허용" 회귀 검사 + Lighthouse·axe 회귀 금지.
- lab: `labs/playground/verify.mjs`.
- 진행 확인: `localhost:4400`의 단계 보드와 검증 매트릭스가 `.progress/events.jsonl`과 일치하는지 S0.0에서 시험 이벤트로 확인.
- 각 체크포인트에서 `npm run verify` 요약 출력을 그대로 첨부한다.
