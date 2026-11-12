# bigsaigon333.github.io

개인 블로그다. [Astro](https://astro.build)로 정적 사이트를 만들어 GitHub Pages(<https://bigsaigon333.github.io>)에 올린다.

## 준비

Node 버전은 [mise](https://mise.jdx.dev)가 `mise.toml`을 읽어 맞춘다.

```sh
mise install
npm ci
```

## 개발·빌드

```sh
npm run dev         # 개발 서버
npm run build       # dist/ 에 정적 사이트 생성
npm run preview     # 빌드 결과 미리 보기
npm run check       # .astro 까지 타입·템플릿 검사 (@astrojs/check + TypeScript 6)
npm run typecheck   # .ts 타입 검사 (tsc --noEmit, TypeScript 7)
npm run lint        # oxlint: 틀렸거나 쓸모없는 코드 찾기 (.mjs, .ts, .astro 의 스크립트)
npm run lint:fix    # 안전하게 고칠 수 있는 것은 고친다
```

루트의 `typescript`는 7(네이티브 컴파일러)이다. `.astro`를 검사하는 `@astrojs/check`는 TypeScript 6의 언어 서비스 API가 필요해서 `tools/astro-check/` 워크스페이스에 TypeScript 6과 함께 따로 설치된다(`npm ci` 한 번이면 둘 다 깔린다). `astro check` 명령은 루트의 TypeScript가 7이면 실행을 거부하므로 `npm run check`를 쓴다.

린트 규칙은 `.oxlintrc.json`에 있다. 코드 모양은 Prettier가 맡고 oxlint는 `correctness` 범주만 오류로 잡는다. 커밋할 때 스테이징한 파일에 oxlint와 Prettier가 돈다(`.lintstagedrc.json`).

## 글 쓰기

`posts/` 아래에 Markdown 파일을 만든다. 파일 이름이 글 주소(`/posts/<파일 이름>`)가 된다.

```md
---
title: 글 제목
date: "2024-01-31"
description: 한 줄 설명 (선택)
keywords: 키워드1, 키워드2 (선택, 쉼표로 구분)
---

본문
```

초안은 `posts/draft/`에 두거나, `posts/`에 둔 채 파일 이름을 `draft:`로 시작하게 하거나 frontmatter에 `draft: true`를 적는다. 초안은 빌드에 나가지 않는다(글 페이지, 홈 목록, sitemap 모두).

frontmatter에는 `title`, `date`, `description`, `keywords`, `summary`, `draft`만 쓸 수 있다. 그 밖의 키(오타 포함)가 있으면 빌드가 실패한다.

## 검증

현재 배포본(`origin/gh-pages`)을 기준선으로 삼아 새 빌드(`dist/`)와 비교한다.

```sh
npm run verify:setup      # node_modules 와 기준선(.verify/baseline) 준비
npm run verify            # npm run check → astro build --force → 기준선과 비교하는 검사와 새 빌드에만 거는 검사
npm run verify:selftest   # 기준선이나 빌드를 일부러 망가뜨려 검사기가 차이를 잡는지 확인
```

자세한 내용은 [scripts/verify/README.md](scripts/verify/README.md)에 있다.

## 진행 대시보드

```sh
npm run progress         # http://localhost:4400 에서 진행 상황 보기
npm run progress:watch   # 진행 기록을 터미널에서 따라 보기
```

## 배포

`main`에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가 빌드해서 GitHub Pages에 배포한다. Pull Request에서는 `.github/workflows/ci.yml`이 린트, 타입 검사, 검증, 포맷 검사를 돌린다.

## 학습 노트

Next.js에서 Astro로 옮기며 배운 것을 [docs/astro-notes/](docs/astro-notes/)에 적어 둔다.
