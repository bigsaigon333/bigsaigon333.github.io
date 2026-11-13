# 26. 단위 시험: Vitest + `getViteConfig` + Container API

## 한 줄 요약

`vitest.config.ts`에서 `getViteConfig()`로 Astro의 Vite 설정(.astro 컴파일러, `astro:*` 가상 모듈)을 Vitest에 붙이고, `experimental_AstroContainer`로 `Seo.astro`를 문자열로 렌더링해 결과 HTML을 cheerio로 읽는다. `src/lib`의 순수 함수(태그 슬러그, 읽는 시간, 시리즈 순서)도 함께 시험한다. `npm test`는 1초 안팎이고 CI의 static job에서 돈다.

## 개념

- **`getViteConfig(viteConfig, astroOverrides?)`**: `astro/config`에서 가져온다. 프로젝트의 `astro.config.mjs`를 읽어 Vite 설정으로 바꾼 뒤 `test` 옵션을 합친다. 두 번째 인자(4.8부터)로 시험에서만 `site` 같은 Astro 설정을 덮을 수 있다. 이 저장소는 덮지 않는다.
- **Container API**: `await AstroContainer.create()` → `container.renderToString(Component, { props, slots, request, params, locals, partial })`. 기본이 `partial: true`라 `<!DOCTYPE>`·`<html>` 없이 컴포넌트가 낸 조각만 나온다. `Seo`처럼 `<head>` 안에 들어갈 조각을 시험하기 좋다. 이름이 `experimental_`이라 패치 릴리스에서도 바뀔 수 있다.
- **결과만 본다**: 시험은 `og:type`, `canonical`, `article:*`, JSON-LD(`JSON.parse`한 객체), `keywords`, RSS `alternate` 링크처럼 렌더링된 HTML만 확인한다. 값을 어디서 읽는지(예: 사이트 인증 토큰)는 보지 않아, 컴포넌트 속을 바꿔도 시험을 고칠 일이 적다.
- **가상 모듈 바꾸기**: `series.ts`는 `astro:content`를 읽는다. `vi.mock("astro:content", …)`로 `getCollection`·`getEntries`를 가짜로 바꾸고, `vi.stubEnv("DEV", false)`로 운영 빌드 가지를 탄다. 모듈 안 캐시 때문에 시험마다 `vi.resetModules()` 후 다시 import한다.
- **타입**: `tsc`는 `.astro`를 모른다(astro 7의 `astro/client`에도 `*.astro` 선언이 없다). `test/astro.d.ts`에 `declare module "*.astro"`를 두어 `npm run typecheck`가 시험 파일을 통과시킨다. Container의 `props`는 `Record<string, unknown>`이라 `interface`가 아니라 `type`으로 적어야 들어간다(인덱스 시그니처).

## Next.js 대응

| Next.js                                            | Astro (S7.4)                                      |
| -------------------------------------------------- | ------------------------------------------------- |
| `next/jest`의 `nextJest({ dir })`가 설정을 읽는다  | `getViteConfig()`가 `astro.config.mjs`를 읽는다   |
| React Testing Library `render(<Head …/>)`          | `container.renderToString(Seo, { props })`        |
| `jest.mock("next/router")`                         | `vi.mock("astro:content")`(가상 모듈도 같은 방식) |
| 메타데이터 API(`generateMetadata`)는 반환값을 시험 | `.astro`는 함수가 아니라 렌더링 결과 HTML을 시험  |

## 빌드 결과물에서 확인하기

- 시험은 `dist/`를 바꾸지 않는다. `vitest`는 devDependency이고 `test/`·`vitest.config.ts`는 빌드에 들어가지 않는다. 전체 `npm run verify`가 새 차이 없이 통과한다.
- `npm test` → `Test Files 4 passed`, `Tests 37 passed`, 약 0.3~0.5초(tags 12, reading-time 8, series 6, Seo 11).
- CI: `.github/workflows/checks.yml`의 static job에 `npm run typecheck` 다음 `npm test`. `actionlint`(shellcheck 포함) 통과.

## 닫힌 고리가 잡아낸 것

- 시험이 처음부터 초록이라, 소스를 일부러 망가뜨려 빨강을 먼저 확인했다. `tagSlug`에서 `.normalize("NFKC")`를 빼면 `"ＣＳＳ３" → "css3"`(받은 값 `ｃｓｓ３`)와 NFD/NFC 한글 시험이 깨진다. JSON-LD 홈 판별을 `url.startsWith(SITE.url)`로 넓히면 404 시험이 `expected [ { …(7) } ] to deeply equal []`로 깨진다.
- JSON-LD의 `"<"` 이스케이프를 지우면 제목에 `</script>`가 든 글 시험 둘이 깨진다(스크립트가 거기서 끝나 `JSON.parse`가 실패). `readingMinutes`의 `round`를 `floor`로 바꾸면 `expected 2 to be 3`, 시리즈의 초안 필터를 지우면 `total: 2` 시험이 깨진다.
- 첫 `npm run typecheck`가 `TS2307: Cannot find module '../src/components/Seo.astro'`로 실패했다 → `test/astro.d.ts`. 이어서 `Index signature for type 'string' is missing in type 'Props'` → `type`으로 바꿨다.
- 로컬 `actionlint`는 mise의 `shellcheck` 심에 버전이 없어 `browsers.yml`에서 멈췄다. `mise exec aqua:rhysd/actionlint@latest aqua:koalaman/shellcheck@latest -- actionlint`로 둘을 함께 주면 통과한다.

## 직접 해볼 실험

끝나면 `git checkout src`로 되돌린다.

1. `src/lib/tags.ts`의 `.normalize("NFKC")`를 지우고 `npm test`.
   <details><summary>예상 결과</summary>`tagSlug > "ＣＳＳ３" → "css3"`가 `expected 'ｃｓｓ３' to be 'css3'`로, NFD/NFC 시험이 `expected '요소' to be '요소'`(눈에는 같지만 코드 포인트가 다르다)로 실패한다. 나머지 35개는 통과한다.</details>
2. `Seo.astro`의 `.replace(/</g, "\\u003c")`를 지우고 `npx vitest run test/seo.test.ts`.
   <details><summary>예상 결과</summary>`Seo: 글` 의 JSON-LD 시험 둘이 실패한다. 제목의 `</script>`에서 스크립트가 끝나 cheerio가 읽은 본문이 잘린 JSON이 되고 `JSON.parse`가 던진다. 홈 시험은 제목에 `<`가 없어 통과한다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/testing/ (Vitest, `getViteConfig`, Container API 예시)
- https://docs.astro.build/en/reference/container-reference/ (`create`, `renderToString`, `props`, `partial`)
- https://vitest.dev/api/vi.html (`vi.mock`, `vi.stubEnv`, `vi.resetModules`)
