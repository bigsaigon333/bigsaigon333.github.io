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

## 검증

`scripts/verify/`는 빌드 결과(`dist/`)를 직전 운영본의 빌드(기준선)와 비교하고, 기준선과 상관없는 요건(SEO 메타 태그, 초안 유출 없음 등)을 확인한다. 자세한 것은 `scripts/verify/README.md`에 있다.

```sh
npx playwright install chromium   # 처음 한 번
npm run verify:setup              # 기준선(origin/main 의 빌드)과 응답 캐시 준비
npm run verify                    # check → build → 비교·기능·시각 검사
npm run verify:selftest           # 검사기가 차이를 실제로 잡는지 확인
npm run verify:live -- --base-url=https://bigsaigon333.github.io   # 배포 뒤 실제 주소 확인
```

사이트를 일부러 바꾸면 기준선과 달라져 검사가 실패한다. 그 차이를 선언해 허용한다.

```sh
npm run verify -- --write-accept=<이름> --reason="<왜 바뀌었는지>"
```

- `scripts/verify/accepted/<이름>.json`이 생긴다. PR에 함께 커밋한다.
- 새 글을 쓰면 홈, `sitemap.xml`, 라우트 목록이 바뀐다. 그 PR에서 이 명령을 돌린다.
- 파일은 그 기준선에만 적용된다. 병합 뒤 기준선이 바뀌면 저절로 무시된다.
- 화면 비교는 `mask`로 바뀐 요소만 가리는 편이 낫다.

## 배포

배포 전 검사는 모두 GitHub Actions에서 돈다. 검사 목록은 `.github/workflows/checks.yml` 한 곳에 있고, Pull Request(`ci.yml`)와 배포(`deploy.yml`)가 이 파일을 함께 부른다.

| 작업                      | 하는 일                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `lint, typecheck, format` | `npm run lint`, `npm run typecheck`, `prettier --check`    |
| `verify`                  | `npm run verify` (`check`, 빌드, 비교·기능·시각 검사 전부) |
| `verify selftest`         | `npm run verify:selftest`                                  |

기준선은 직전 운영본이다. PR은 base 커밋의 빌드, 배포는 push 전 main 커밋의 빌드와 비교한다(수동 실행은 지금 커밋).

`main`에 push하면 `deploy.yml`이 같은 검사를 다시 돌리고, `verify`가 검사한 `dist/`를 GitHub Pages에 배포한 뒤, 실제 주소에 `verify:live`를 돌린다. 이때 기준선은 방금 배포한 커밋이다. 검사가 하나라도 실패하면 배포하지 않는다.
