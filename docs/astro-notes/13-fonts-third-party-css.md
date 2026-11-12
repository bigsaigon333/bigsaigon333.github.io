# 13. Fonts API 와 서드파티 CSS 자체 호스팅

## 한 줄 요약

Source Code Pro 는 Fonts API(`fonts` 설정 + `<Font>`)로, KaTeX 스타일시트는 `katex` npm 패키지의 CSS 를 import 해서 Vite 가 묶게 했다. 이제 페이지가 다른 출처로 보내는 요청은 GA, utterances, 본문 이미지(`user-images.githubusercontent.com`)뿐이고, 새 기능 검사 `external` 이 14개 라우트에서 그것을 단언한다(`external 14/14`, `visual 84/84`).

## 개념

- **Fonts API 는 설정과 컴포넌트 두 조각이다.** `astro.config.mjs` 의 `fonts` 배열(여기서는 `config/fonts.mjs`)에 `name`, `cssVariable`, `provider` 를 적고, `<head>` 안에서 `<Font cssVariable="--font-source-code-pro" />` 를 렌더한다. 컴포넌트는 `@font-face` 들과 `:root { --font-source-code-pro: … }` 를 담은 `<style>` 을 그 자리에 쓴다. CSS 는 `font-family: var(--font-source-code-pro)` 로 쓴다.
- **글꼴 이름에 해시가 붙는다.** 출력의 family 는 `"Source Code Pro-779bc24b705beff4"` 다. 변수 값은 그 이름 + `fallbacks` 목록이라 CSS 는 이름을 몰라도 된다.
- **공급자 고르기.** `fontProviders.google()` 은 빌드하는 날 Google 에서 최신 파일을 받는다. 배포본은 Next.js 가 박아 넣은 v22 woff 를 받고 있었으므로, 같은 바이트를 보장하려고 그 8개 파일을 `src/fonts/source-code-pro/` 에 두고 `fontProviders.local()` 의 `variants` 로 실었다. 변형마다 `src`, `weight`, `style`, `unicodeRange` 를 준다. `formats` 기본값이 `["woff2"]` 라서 `["woff"]` 로 바꿨다.
- **`optimizedFallbacks: false`.** 켜 두면 Astro 가 크기를 맞춘 대체 글꼴을 목록에 끼워 넣는다. 이 사이트는 대체 글꼴 목록(`Consolas, Menlo, Monaco, Courier New, monospace`)을 그대로 지키는 것이 목표라 껐다.
- **서드파티 CSS 는 그냥 import 한다.** `import "katex/dist/katex.min.css";` 를 컴포넌트 frontmatter 에 두면 Vite 가 CSS 를 레이아웃 묶음(`BaseLayout.*.css`)에 넣고, CSS 안의 `url(fonts/KaTeX_*.woff2)` 를 따라가 파일을 `_astro/` 로 복사하며 주소를 해시 이름으로 바꾼다. 마크업을 그리는 `rehype-katex` 와 같은 `katex` 패키지라 버전도 맞는다(CDN 은 0.16.0, 패키지는 0.16.47).

## Next.js 대응

| 예전                                                                                          | 지금                                                                     |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `_document.page.tsx` 의 `fonts.googleapis.com` link. Next 가 빌드 때 CSS 를 받아 HTML 에 박음 | `config/fonts.mjs` + `<Font>`. 파일까지 `dist/_astro/fonts/` 에 복사된다 |
| `cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css` link + integrity                       | `HeadAssets.astro` 의 `import "katex/dist/katex.min.css"`                |
| `fonts.gstatic.com` preconnect                                                                | 없음(다른 출처로 글꼴을 받지 않는다)                                     |

## 빌드 결과물에서 확인하기

- `ls dist/_astro/fonts | wc -l` → 8. 바이트는 `src/fonts/source-code-pro/*.woff` 와 같다.
- `grep -o -- '--font-source-code-pro:[^;}]*' dist/index.html` → `"Source Code Pro-779bc24b705beff4",Consolas,Menlo,Monaco,"Courier New",monospace`.
- `ls dist/_astro | grep -c KaTeX` → 59(KaTeX 글꼴의 woff2·woff·ttf). `grep -c 'fonts.gstatic\|jsdelivr' dist/index.html` → 0.
- `node -e 'console.log(require("./.verify/report/external.json").extra.seen)'` → GA, utterances, `user-images.githubusercontent.com`.

## 닫힌 고리가 잡아낸 것

- **Red 를 먼저 봤다.** 검사만 쓰고 돌리면 `FAIL external 0/14`: `fonts.gstatic.com (<link rel=preconnect href>, <style>); cdn.jsdelivr.net (<link rel=stylesheet href>)`. 기대한 두 출처다.
- **검사기의 거짓 양성**: 같은 Red 실행에서 홈에 `https://schema.org`, `https://github.com` 도 나왔다. JSON-LD(`type="application/ld+json"`)의 문자열이다. 실행되지 않는 데이터 블록이므로 인라인 스크립트는 JavaScript 형식만 읽게 고쳤다.
- **변이 4개**(CDN link, 인라인 `@font-face` 의 원격 `url()`, 연결된 CSS 파일의 원격 `@import`, preconnect)가 모두 `external` 을 실패시킨다(`SELFTEST PASS 5/5`).
- **화면**: KaTeX CSS 가 0.16.0 → 0.16.47 로 바뀌고 head 안 위치도 바뀌었지만 `visual 84/84` 가 그대로 통과했다. 글꼴 파일이 같은 바이트라 accept 파일은 필요 없었다.

## 직접 해볼 실험

1. `config/fonts.mjs` 의 `optimizedFallbacks: false` 를 지우고 `npm run build`, 그리고 `grep -o -- '--font-source-code-pro:[^;}]*' dist/index.html`.
   <details><summary>예상 결과</summary>변수 값의 해시 이름 뒤에 크기를 맞춘 대체 글꼴 이름이 하나 더 끼고 `@font-face` 가 하나 늘어난다. 코드 블록 안 한글처럼 Source Code Pro 에 없는 글자가 다른 글꼴로 그려질 수 있어 `visual` 이 달라질 수 있다.</details>
2. `HeadAssets.astro` 에 `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css" />` 를 다시 넣고 `npm run -s verify -- --only=external --no-check`.
   <details><summary>예상 결과</summary>`FAIL external 0/14  /: requests an origin outside the allowlist: https://cdn.jsdelivr.net (<link rel=stylesheet href>) | …`.</details>
3. `config/fonts.mjs` 를 `provider: fontProviders.google()` 에 `weights: [400], styles: ["normal"]` 로 바꾸고(`options` 와 `formats` 삭제) `npm run -s verify -- --only=visual`.
   <details><summary>예상 결과</summary>빌드가 Google 에서 그날의 파일(woff2)을 받아 `_astro/fonts` 에 둔다. 파일 버전이 v22 와 다르면 코드 블록의 글자 모양이 바뀌어 `visual` 이 코드 블록이 있는 글에서 실패할 수 있다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/fonts/ (`fonts` 설정, `fontProviders.local()` 의 `variants`, `<Font>`, `_astro/fonts` 출력, 캐시 위치)
- https://docs.astro.build/en/reference/configuration-reference/ (`fallbacks`, `optimizedFallbacks`, `formats` 기본값 `["woff2"]`, `unicodeRange`)
- 정리본: `docs/astro-notes/_refs/fonts.md`. 문서에 없어 직접 확인한 것: KaTeX 같은 서드파티 CSS 의 `url()` 글꼴을 Vite 가 `_astro/` 로 복사하는 것(빌드 결과물로 확인), local 공급자의 family 이름에 해시가 붙는 것.
