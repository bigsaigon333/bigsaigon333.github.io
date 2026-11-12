# 문서 요약: structure-config

> 문서 스카우트가 공식 문서를 읽고 요약한 것이다. 요약과 실제 동작이 다르면 실제 동작을 따르고 학습 노트에 적는다.

## Astro 구조/설정 다이제스트 (docs.astro.build 기준, 2026-11-12 조회)

**1. 구조**
- 루트 필수/권장: `src/`, `public/`, `package.json`, `astro.config.mjs`(권장; `.js`/`.ts`도 지원), `tsconfig.json`(권장).
- Astro가 예약한 디렉터리는 `src/pages/` 하나뿐이며 필수다. 나머지(`src/components`, `src/layouts`, `src/styles`)는 관례일 뿐이다.
- `src/content.config.ts`는 문서 예시 트리에 `src/` 아래 파일로 나온다(본문에 별도 규정 없음).
- `src/` 밖에 두는 것: `public/` (그대로 복사, 번들링 없음, `robots.txt` 등), `package.json`, `astro.config.mjs`, `tsconfig.json`.

**2. 설정 키 (`astro.config.mjs`)**
```js
import { defineConfig } from 'astro/config';
export default defineConfig({
  site: 'https://example.github.io',   // 최종 배포 URL, "strongly recommended"
  trailingSlash: 'ignore',              // 기본값 'ignore' | 'always' | 'never'
  compressHTML: 'jsx',                  // v7 기본값
  outDir: './dist',                     // 기본값
  build: { format: 'file' },            // 기본값 'directory'
});
```
- `base`: 기본값 없음(미설정). 사용자 사이트(루트 배포)라면 설정하지 않는다.
- `build.format`: 허용값 `'file' | 'directory' | 'preserve'`. 문서 예: `src/pages/about.astro`와 `src/pages/about/index.astro`는 `'file'`에서 `/about.html`을 만든다. `posts/[id].astro`와 `index.astro`의 출력 파일명은 **문서에 없음**.
- `compressHTML` (v7 기본 `'jsx'`): React式 JSX 공백 규칙. 요소 주변 공백/줄바꿈을 제거하고, 여러 줄 텍스트를 한 줄로 합치며, 한 줄 안의 공백은 유지한다. 공백을 남기려면 `{" "}`를 명시한다. `true`는 `.astro` 컴포넌트에서 손실 없이 공백을 제거한다. `false`는 압축하지 않는다.
- `build.inlineStylesheets`: 기본 `auto`. `ViteConfig.build.assetsInlineLimit`(기본 4kb)보다 작은 스타일시트만 인라인.
- `prerenderConflictBehavior`(6.0 추가): 기본 `'warn'`.
- `output`: 기본 `'static'`.

**3. `build.format: 'file'`에서의 URL**
- `Astro.url.pathname`은 `.html`을 포함한다(예: `/foo.html`).
- 문서는 이 형식과 함께 `trailingSlash: 'never'` 사용을 권장한다.
- 생성된 링크 형식(`<a href>` 등)은 **문서에 없음** (명시 확인 필요).

**4. CLI**
- `astro dev`: 개발 서버(기본 포트 4321, HMR). 키 `s`=콘텐츠 동기화, `q`=종료.
- `astro build`: `dist/`에 정적 파일 생성. 옵션 `--timings`(7.4.0 추가).
- `astro preview`: `dist/`를 로컬 서빙. 'file' 출력의 확장자 없는 URL 서빙 여부는 **문서에 없음**.
- `astro check`: 타입/진단 실행, 오류 시 종료코드 1, CI용. `--minimumFailingSeverity`, `--noSync`. 필요한 패키지(`@astrojs/check`, `typescript`) 설치 요건은 **문서에 없음**.
- `astro sync`: `.astro/types.d.ts` 생성. `dev`/`build`/`check`가 자동 실행.
- `--background`는 7.0.0 추가. `preview`의 백그라운드 모드는 7.2.0부터.

**5. TypeScript (`tsconfig.json`)**
```json
{
  "extends": "astro/tsconfigs/base",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"],
  "compilerOptions": {
    "paths": { "@components/*": ["./src/components/*"] }
  }
}
```
- 프리셋: `astro/tsconfigs/base`, `strict`, `strictest`. 권장은 `strict` 이상. `verbatimModuleSyntax: true`가 기본 활성.
- 생성 타입 위치: `.astro/types.d.ts`. 전역 타입은 `src/env.d.ts`에 둔다.

**6. 텔레메트리 끄기**
- 환경변수 `ASTRO_TELEMETRY_DISABLED`(CI에 설정 권장), 또는 `astro telemetry disable`.

**주의**: 이 페이지들에서 실험적(experimental) 표시 항목은 확인되지 않았다. 설정 레퍼런스 요약에 따르면 `markdown.remarkPlugins`/`rehypePlugins`/`gfm`/`smartypants`/`remarkRehype`는 deprecated이며 `markdown.processor`를 쓴다. 본 블로그 설정에는 해당 없음.

## 읽은 문서

- https://docs.astro.build/en/basics/project-structure/
- https://docs.astro.build/en/reference/configuration-reference/
- https://docs.astro.build/en/reference/cli-reference/
- https://docs.astro.build/en/guides/typescript/

## 확인하지 못한 것

- build.format 'file'에서 src/pages/posts/[id].astro 및 src/pages/index.astro의 정확한 출력 파일명 (문서에 없음)
- build.format 'file'에서 생성되는 내부 링크 형식 (.html 포함 여부, 문서에 없음)
- astro preview가 'file' 출력의 확장자 없는 URL을 서빙하는지 (문서에 없음)
- astro check 실행에 @astrojs/check와 typescript 설치가 필요한지 (문서에 명시 없음)
- build.format 및 build.inlineStylesheets 항목은 설정 레퍼런스의 잘린 부분을 요약 모델이 추출한 내용에 의존함 (원문 확인 못함)
- src/content.config.ts의 위치 규정 (문서 예시 트리에만 등장)
