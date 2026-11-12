# 14. astro:assets 로 이미지 최적화하기

## 한 줄 요약

프로필 사진을 `<Picture />`로 바꿔 빌드 때 webp·jpg를 너비 3개(192·384·535)로 만들고, 글 본문의 원격 PNG 11장을 `posts/images/`에 내려받아 `![]()`로 쓴 4장을 `/_astro/*.webp`로 바꿨다. 1280px 화면의 프로필은 108,518 B(`/profile.webp`) → 6,296 B, 본문 4장은 3,510,859 B → 261,682 B다. HTML `<img width>`로 쓴 7장은 설정 파일(`config/markdown.mjs`)에 remark 플러그인이 있어야 바뀐다(소유 밖이라 needs로 넘겼다).

## 개념

- **`src/` 안의 이미지를 import 하면 `ImageMetadata`(`src`, `width`, `height`, `format`)가 온다.** `<Picture src={profile} widths={[192, 384, profile.width]} sizes="…" formats={["webp"]} />`는 `<source type="image/webp" srcset="… 192w, … 384w, … 535w">`와 jpg `<img srcset=… width="535" height="713">`를 낸다. `fallbackFormat`의 기본값은 원본이 jpg면 jpg다.
- **`public/`의 이미지는 손대지 않는다.** 그래서 `public/profile.jpg`를 `src/assets/`로 복사해 import 했다. 예전 주소(`/profile.jpg`, `/profile.webp`)는 그대로 둔다(`routes` 검사가 기준선의 모든 자산이 남아 있는지 본다).
- **Markdown의 `![alt](./상대경로)`만 최적화된다.** `remark-collect-images`가 mdast의 `image` 노드에서 경로를 모으고, `rehype-images`가 그 `img`에 표시를 달아 둔다. 본문에 HTML로 쓴 `<img>`는 mdast에서 `html` 노드라 모이지 않고, `rehype-raw`가 맨 끝에 돌아서 그대로 나간다(`node_modules/@astrojs/markdown-remark/dist/index.js`).
- **컬렉션 밖(`posts/`)의 글도 상대경로가 통한다.** glob 로더의 `base: "./posts"`에 있는 글에서 `./images/x.png`가 `posts/images/x.png`로 풀린다. 문서에는 이 경우가 적혀 있지 않아 빌드로 확인했다.
- **크기**: Markdown 이미지에는 원본의 `width`/`height`가 붙는다. 전역 CSS의 `img { max-width: 100%; height: auto }` 덕에 좁은 화면에서도 비율대로 줄어 예전 상자와 같다.

## Next.js 대응

| 예전                                                                              | 지금                                                                    |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `<picture><source srcset="/profile.webp"><img src="/profile.jpg"></picture>` 손수 | `<Picture />`가 너비별 파일과 `srcset`·`sizes`를 만든다                 |
| 본문 이미지는 GitHub 이슈 첨부 주소(다른 출처)                                    | `posts/images/*.png` → 빌드 때 `/_astro/<이름>.<해시>.webp`             |
| `next/image`는 쓰지 않았다(정적 export)                                           | `astro:assets`는 빌드 때 sharp로 변환한다(`node_modules/.astro`에 캐시) |

## 빌드 결과물에서 확인하기

- `grep -o '<picture.*</picture>' dist/index.html` → webp `<source>` 하나와 jpg `<img>` 하나. `srcset`에 `192w, 384w, 535w`.
- `grep -o '<img[^>]*>' dist/posts/css-masters-2-week3.html | tail -1` → `width="2144" height="2334" src="/_astro/169675017-….webp"`. 원본 PNG 3,252,243 B가 205,808 B다.
- 모든 페이지의 `img`·`source` 주소 중 다른 출처: 기준선 11개 → 지금 7개(HTML `<img>`로 쓴 week1 1장, week2 6장).

## 닫힌 고리가 잡아낸 것

- **Red**: 바꾼 뒤 첫 `npm run verify`는 `content 0/14`(사이트 헤더 `srcset: /profile.webp` → `/_astro/…`, 본문 `images[0] src` 변화), `visual 0/84`(프로필이 다시 인코딩되어 픽셀이 다르다)였다. `scripts/verify/accepted/s4-3-assets.json`으로 content는 허용하고, visual은 라우트를 허용하지 않고 `mask: ["img"]`만 걸어 `visual 84/84`다. img 상자만 칠하므로 상자의 위치나 크기가 1px이라도 달랐다면 그 아래 내용이 밀려 실패했을 것이다. 이것이 "렌더 크기가 같다"의 근거다.
- **avif를 뺐다**: `formats={["avif", "webp"]}`로는 `hover 0/14`(`picture > source[2] element: missing → present`)였다. `picture`는 `display: contents`라 상자가 없어 mask로 가려지지 않는다. 192w에서 avif 3,623 B, webp 6,296 B로 차이가 작아 예전 마크업 모양(webp source + jpg img)을 지켰다.
- **HTML `<img>`**: `src`만 `./images/…`로 바꾸면 그대로 나가 `/posts/images/…`가 404다. mdast `html` 노드를 `image` 노드로 바꾸고 `width`와 `densities: [1, 2]`를 `hProperties`에 싣는 remark 플러그인을 임시로 붙이면 `<img width="335" height="128" srcset="… 1x, … 2x">`가 되고 게이트 전부가 통과했다(원본이 2배 해상도 캡처라 `densities`가 없으면 335px로 줄여 흐려진다). 플러그인 자리는 `config/`라 이 단계에서는 넣지 않았다.

## 직접 해볼 실험

1. `Header.astro`의 `formats`를 `["avif", "webp"]`로 바꾸고 `npm run -s verify -- --only=hover,visual`.
   <details><summary>예상 결과</summary>`FAIL hover 0/14  /: a[href="/"]#0 > div > picture > source[2] element: missing → present`. visual은 `mask: ["img"]` 덕에 통과한다. 늘어난 `<source>`는 상자가 없어 화면에는 보이지 않는다.</details>
2. `posts/css-masters-2-week2.md`의 `![image](./images/1696…)`를 `<img alt="image" src="./images/1696…">`로 바꾸고 빌드.
   <details><summary>예상 결과</summary>그 `img`는 `src="./images/…"` 그대로 나가고 `npm run verify -- --only=links`가 `/posts/images/…` 404로 실패한다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/images/ (`src/`와 `public/`의 차이, Markdown의 `![]()`만 최적화, `.md`에서는 `<Image />`를 쓸 수 없다)
- https://docs.astro.build/en/reference/modules/astro-assets/ (`<Picture />`의 `formats`·`fallbackFormat`, `widths`와 `sizes`, `densities`)
- `docs/astro-notes/_refs/assets.md` (스카우트 요약. 컬렉션 밖 글의 상대경로는 문서에 없어 빌드로 확인했다)
- 확인하지 못한 것: HTML `<img>`를 Markdown 파이프라인이 최적화하지 않는다는 것은 문서가 아니라 `@astrojs/markdown-remark` 7.4 소스에서 읽었다.
