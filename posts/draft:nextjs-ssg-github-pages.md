---
title: Next.js로 만든 정적 페이지를 github pages로 배포하기
date: "2022-03-10"
summary: Next.js로 만든 정적 페이지를 gh-pages 모듈으로 github pages에 배포하며 겪은 트러블슈팅 두가지
---

## 1. styled-components

styled-components가 html에 inject가 되지 않아 스타일링이 완전히 깨져서 나왔다.

https://styled-components.com/docs/advanced#nextjs 를 참고하여 pages/\_document.tsx를 추가하였더니

export된 HTML의 head 태그 내에 style 태그가 삽입되며 styled-components의 모든 스타일, 클래스 선택자들이 기재된다.

## 2. gh-pages

bigsaigon333.github.io 라는 github pages 로 정적 파일을 배포하는데,

이는 gh-pages 브랜치에 push 하면 자동으로 github actions가 동작하여 배포를 해준다.

중요한 건 github pages는 디폴트로 루비 기반의 jekyll이 자동으로 동작하여 README.md 를 읽어들여 페이지를 생성해준다는 점이다.

이러한 jekyll 배포를 우회하기 위해서는 .nojekyll 이라는 파일을 추가하면 된다.

따라서 `next build && next export` 후 `touch out/.nojekyll` 을 실행한 후 `gh-pages -d out` 하도록 설정하였으나,

도무지 레포지토리에 `.nojekyll`이 업로드되지 않는 것이다!

사실 이것이 문제인지 파악하기 위해서 많은 시행착오가 있었다.

처음에 맞닥뜨린 문제는, javascript 파일을 load 해오지 못하고 404 error가 뜨는 것이었다. 해쉬값이 잘못되었는지, 경로가 잘못 되었는지, 경로에 포함된 \_ 문자를 인코딩해줘야 하는 건지 등 많이 고민하였으나,
다른 github pages 를 크롬 데브툴스로 살펴본 결과, 경로에는 문제가 없는 걸 파악하였다.

그다음에는 github actions에서 어떤 job이 실행되는지 보니, jekyll 관련 작업이 돌아가는 걸 보고 jekyll 관련이라 추측하였다.

github repository 웹에서 .nojekyll 파일을 add to files 한 후 deploy된 결과를 보니 제대로 javascript를 로드하는 것을 확인하였다.

다음으로 gh-pages 모듈의 npm, github 의 설명을 읽어보았으나, 관련되는게 없어보였다.

구글링을 해서 발견!

.이 포함된 파일들(dotfiles)를 같이 업로드(배포)하기 위해서는 `-t` 라는 옵션을 줘야하는 것이었다.

https://github.com/tschaub/gh-pages/issues/315

배포 스크립트에 추가하여 해결!

최종적인 배포 스크립트

```json
  "scripts": {
    "build": "next build && next export",
    "deploy": "npm run build && touch out/.nojekyll && NODE_DEBUG=gh-pages gh-pages -d out -t",
  }
```
