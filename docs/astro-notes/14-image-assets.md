# 14. astro:assets 로 이미지 최적화하기

## 한 줄 요약

프로필 사진을 `<Picture />`로 바꿔 빌드 때 webp·jpg를 너비 3개(192·384·535)로 만들고, 글 본문의 원격 PNG 11장을 `src/assets/posts/`에 내려받아 모두 `/_astro/*.webp`로 바꿨다. `![]()` 4장은 Astro가 그대로 처리하고, HTML `<img width>`로 쓴 7장은 Sätteri mdast 플러그인(`config/html-images.mjs`)이 Markdown 이미지 노드로 바꿔 넘긴다. 본문 11장은 5,796,987 B → 343,340 B(1x, 2x 화면에서는 465,456 B), 1280px 화면의 프로필은 108,518 B → 6,296 B다.

## 개념

- **`src/` 안의 이미지를 import 하면 `ImageMetadata`가 온다.** `<Picture src={profile} widths={[192, 384, profile.width]} sizes="…" formats={["webp"]} />`는 webp `<source srcset="… 192w, … 384w, … 535w">`와 jpg `<img>`를 낸다. `public/`의 파일은 손대지 않으므로 `public/profile.jpg`를 `src/assets/`로 복사했다(예전 주소는 `routes` 검사 때문에 남긴다).
- **Markdown 이미지 노드만 최적화된다.** `@astrojs/markdown-satteri`는 사용자 mdast 플러그인 **뒤에** `collect-images`(mdast `image` 노드의 url 수집)를, hast 단계에서 `image-marker`(`<img>` 요소에 `__ASTRO_IMAGE_` 표시)를 돌린다(`node_modules/@astrojs/markdown-satteri/dist/satteri-processor.js`). HTML `<img>`는 mdast에서 `html` 노드, hast에서 raw 노드라 둘 다 지나친다.
- **그래서 mdast 단계에서 바꾼다.** `html(node, ctx)` 방문 함수가 `<img …>` 한 태그짜리 노드를 `ctx.replaceNode(node, { type: "image", url, alt, data: { hProperties } })`로 바꾼다. `image-marker`는 `src` 외의 속성을 모두 `getImage()` 인자로 넘기므로 `width`(숫자)와 `densities`가 그대로 간다. katex 플러그인과 같은 객체 모양이다.
- **블록 자리는 블록 자리로 남는다.** 빈 줄로 둘러싸인 `<img>`는 root의 자식인 `html` 노드인데, 같은 자리의 `image` 노드도 `<p>`로 감싸이지 않고 `<img>`로 나온다. 문단 안(`box-shadow: …⏎<img>`)은 문단 안에 남는다.
- **크기**: 원본에는 `width`만 있었다. Astro가 비율로 `height`를 채우고, 전역 CSS `img { max-width: 100%; height: auto }` 덕에 좁은 화면에서도 같은 상자다.

## Next.js 대응

| 예전                                                                              | 지금                                                                         |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `<picture><source srcset="/profile.webp"><img src="/profile.jpg"></picture>` 손수 | `<Picture />`가 너비별 파일과 `srcset`·`sizes`를 만든다                      |
| 본문 이미지는 GitHub 이슈 첨부 주소(다른 출처, 원본 PNG)                          | `src/assets/posts/*.png` → 빌드 때 `/_astro/<이름>.<해시>.webp`              |
| HTML `<img width="335" src="https://…">`는 손으로 쓴 그대로 나감                  | mdast 플러그인이 image 노드로 바꿔 `width`·`height`·`srcset 1x, 2x`가 붙는다 |
| `next/image`는 쓰지 않았다(정적 export)                                           | `astro:assets`는 빌드 때 sharp로 변환한다(`node_modules/.astro`에 캐시)      |

## 빌드 결과물에서 확인하기

- `grep -o '<img[^>]*>' dist/posts/css-masters-2-week2.html` → `alt="image" … width="335" height="128" src="/_astro/168477185-….webp" srcset="… 1x, … 2x"`. 원본 670×256 캡처라 2x 파일이 원본 해상도다.
- week1 `<img alt="전체 선택자" width="600" height="600">`은 `<p>` 없이 `<h2>` 다음 블록 자리에 있다(기준선과 같다).
- 모든 페이지의 `img`·`source` 주소 중 다른 출처: 기준선 11개 → 0개. 새 feature 검사 `images`가 이것을 단언한다(아래).
- 바이트(1x): week1 309,631 → 39,920, week2 8장 2,144,482 → 64,494, week3 3,252,243 → 205,808, react-scripts 90,631 → 33,118.

## 닫힌 고리가 잡아낸 것

- **Red(첫 시도)**: `![]()` 4장만 바뀌고 HTML `<img>` 7장은 원격 주소 그대로였다. `src`만 상대경로로 바꾸면 그대로 나가 `links`가 404로 실패한다.
- **가설 1(채택)**: mdast `html` → `image`. 실험 스크립트로 `createSatteriMarkdownProcessor({ mdastPlugins: [plugin] })`를 돌려 `localImagePaths`에 경로가 모이고 `__ASTRO_IMAGE_`에 `width`가 실리는 것을 먼저 확인했다.
- **`densities: [1, 2]`가 사라졌다**: 빌드 결과에 `srcset`이 없었다. `__ASTRO_IMAGE_`를 찍어 보니 `"densities":[]`. hast 속성 배열은 문자열만 남는다. `["1x", "2x"]`로 쓰자 `srcset="… 1x, … 2x"`가 나왔다.
- **캐시**: 플러그인을 고친 뒤 그냥 `npm run build`는 예전 HTML을 냈다(`data-store.json`). `--force`로 확인해야 한다(게이트는 이미 `--force`).
- **visual**: `scripts/verify/accepted/s4-3-assets.json`의 `mask: ["img"]`만으로 84/84. img 상자만 칠하므로 상자 위치·크기가 1px이라도 달랐다면 실패했을 것이다.
- **`posts/images/`에서 옮겼다**: 처음엔 글 옆 `posts/images/`에 두었는데 `verify:selftest`의 프로젝트 사본 사례 3개가 `Build failed`였다. 사본(`scripts/verify/lib/cli-cases.mjs`)은 `posts/`의 최상위 `.md`만 복사하기 때문이다. 사본이 늘 가져가는 `src/` 아래로 옮기고 글에서는 `../src/assets/posts/…`로 가리킨다.
- **새 검사 `images`**: 기준선(`--candidate=.verify/baseline`)은 0/14로 실패(`/profile.webp`, width 없는 img), 새 빌드는 14/14. 자기 검사 변이 7개(원격 주소, 처리 안 된 `./images/x.png`, `public/` 원본, 없는 2x 파일, alt·width 삭제, 이미지 0개)가 모두 실패한다.

## 직접 해볼 실험

끝나면 `git checkout config/markdown.mjs`로 되돌린다.

1. `config/markdown.mjs`의 `mdastPlugins`에서 `htmlImagesPlugin`을 빼고 `npm run -s verify -- --no-check --only=images,links`.
   <details><summary>예상 결과</summary>`FAIL images`: week1·week2에 `img[…] src ../src/assets/posts/… is not an astro:assets output`, `width`는 있지만 `height=(none)`. `links`도 `/src/assets/posts/…` 404로 실패한다.</details>
2. `config/html-images.mjs`의 `densities: ["1x", "2x"]`를 `[1, 2]`로 바꾸고 `npm run build -- --force` 후 `grep -o ' 2x"' dist/posts/css-masters-2-week2.html | wc -l`.
   <details><summary>예상 결과</summary>`0`. 숫자 배열이 hast 속성에서 빠져 `srcset`이 없다. 문자열로 되돌리면 6이다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/images/ (`src/`와 `public/`의 차이, Markdown의 `![]()`만 최적화, `.md`에서는 `<Image />`를 쓸 수 없다)
- https://docs.astro.build/en/guides/markdown-content/ (Sätteri 기본 엔진, `mdastPlugins`)
- https://docs.astro.build/en/reference/modules/astro-assets/ (`<Picture />`의 `formats`, `widths`와 `sizes`, `densities`)
- `docs/astro-notes/_refs/assets.md` (스카우트 요약)
- 문서에 없어 직접 확인한 것: HTML `<img>`가 최적화되지 않는 이유와 플러그인 순서(`satteri-processor.js` 소스), mdast 방문 함수·`replaceNode`(`satteri` 타입 선언 `dist/mdast/mdast-visitor.d.ts`), 숫자 배열이 사라지는 것(빌드 결과물).
