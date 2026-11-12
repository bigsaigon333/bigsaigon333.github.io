# bigsaigon333.github.io

개인 블로그다. [Astro](https://astro.build)로 정적 사이트를 만들어 GitHub Pages(<https://bigsaigon333.github.io>)에 올린다. 글은 `posts/`의 Markdown 파일이고, 빌드하면 `dist/`에 HTML이 나온다.

## 준비

Node 버전은 [mise](https://mise.jdx.dev)가 `mise.toml`을 읽어 맞춘다.

```sh
mise install
npm ci
```

## 명령

```sh
npm run dev         # 개발 서버
npm run build       # dist/ 에 정적 사이트 생성
npm run preview     # 빌드 결과 미리 보기
npm run check       # .astro 까지 타입·템플릿 검사 (@astrojs/check, TypeScript 6)
npm run typecheck   # .ts 타입 검사 (tsc --noEmit, TypeScript 7)
npm run lint        # oxlint 로 틀렸거나 쓸모없는 코드 찾기 (고칠 수 있는 것은 npm run lint:fix)
```

루트의 `typescript`는 7(네이티브 컴파일러)이고, `astro check`는 TypeScript가 7이면 실행을 거부한다. 그래서 `npm run check`는 `tools/astro-check/` 워크스페이스에 TypeScript 6과 함께 설치된 `@astrojs/check`를 돌린다(`npm ci` 한 번이면 둘 다 깔린다).

린트 규칙은 `.oxlintrc.json`에 있다. 코드 모양은 Prettier가 맡고 oxlint는 `correctness` 범주만 오류로 잡는다. 커밋할 때 스테이징한 파일에 oxlint와 Prettier가 돈다(`.lintstagedrc.json`).

## 글 쓰기

`posts/` 아래에 Markdown 파일을 만든다. 파일 이름이 글 주소(`/posts/<파일 이름>`)가 된다.

```md
---
title: 글 제목
date: "2024-01-31"
description: 한 줄 설명
keywords: 키워드1, 키워드2
---

본문
```

| 키            | 값                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------- |
| `title`       | 필수. 글 제목                                                                                 |
| `date`        | 필수. 따옴표로 감싼 `"YYYY-MM-DD"`. 따옴표가 없거나 없는 날짜(`"2022-02-30"`)면 빌드가 멈춘다 |
| `description` | 선택. 한 줄 설명. `<meta name="description">`과 링크 미리 보기에 쓰인다                       |
| `keywords`    | 선택. 쉼표로 구분한 키워드                                                                    |
| `summary`     | 선택. 예전 글에 남은 설명. `description`이 없을 때 대신 쓴다                                  |
| `draft`       | 선택. `true`면 초안                                                                           |

이 밖의 키(오타 포함)가 있으면 빌드가 실패한다.

초안을 만드는 방법은 셋이다. `posts/draft/`에 두거나, 파일 이름을 `draft:`로 시작하게 하거나, frontmatter에 `draft: true`를 적는다. 어느 쪽이든 발행되지 않는다(글 페이지, 홈 목록, sitemap 어디에도 없다).

## 배포

`main`에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가 `npm run check`와 `npm run build`를 돌리고 `dist/`를 GitHub Pages에 배포한다. Pull Request에서는 `.github/workflows/ci.yml`이 린트, 타입 검사(`typecheck`, `check`), 빌드, 포맷 검사(`prettier --check`)를 돌린다.
