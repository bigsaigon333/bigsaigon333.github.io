# 문서 요약: markdown-pipeline

> 문서 스카우트가 공식 문서를 읽고 요약한 것이다. 요약과 실제 동작이 다르면 실제 동작을 따르고 학습 노트에 적는다.

## markdown-pipeline (Astro 문서 기준, 조회일 2026-11-12)

- 기본 processor는 v7부터 Sätteri. 설정 없이 동작. unified는 `@astrojs/markdown-remark` 설치 후 사용 (processor 옵션은 astro@6.4.0 추가).

**1. unified + remark-math + rehype-katex + rehype-highlight** (플러그인 조합 자체는 문서에 없음, 아래는 옵션 구조만 문서 기준)
```js
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
export default defineConfig({
  markdown: {
    syntaxHighlight: false, // 2번
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex, rehypeHighlight],
    }),
  },
});
```
- `unified()` 옵션: `remarkPlugins` (기본 []), `rehypePlugins` (기본 []), `gfm` (기본 true), `smartypants` (기본 true), `remarkRehype` (객체, 기본값 문서에 없음), `recmaPlugins` (기본 [], MDX용).
- v7: top-level `markdown.remarkPlugins/rehypePlugins/gfm/smartypants/remarkRehype`는 deprecated, processor 옵션으로 이동.

**2. 내장 highlight 끄기**: `markdown.syntaxHighlight: false` (key는 `markdown` 아래, v7에서 위치 변경 언급 없음). 값은 `'shiki' | 'prism' | false` 또는 `{ type, excludeLangs }`. 기본 `{ type: 'shiki', excludeLangs: ['math'] }`.

**3. smartypants / GFM**
- unified: `smartypants: false`, `gfm: false`.
- Sätteri: `features: { smartPunctuation: false }`, `features: { gfm: false }`.
- GFM은 양쪽 모두 기본 on. smartPunctuation은 양쪽 모두 기본 on.

**4. raw HTML 통과/sanitize**: 문서에 없음 (확인 불가).

**5. heading id**: Astro가 github-slugger 기반으로 자동 주입. 비활성화 옵션은 문서에 없음. 커스텀: unified는 `rehypeHeadingIds`, Sätteri는 `satteriHeadingIdsPlugin()`을 앞에 배치. 플러그인이 설정한 id는 보존됨.

**6. Sätteri 플러그인 모델**
```js
import { satteri } from '@astrojs/markdown-satteri';
export default { markdown: { processor: satteri({
  mdastPlugins: [], hastPlugins: [], features: { /* gfm, smartPunctuation */ },
}) } };
```
- 플러그인은 Sätteri 전용 (문서 예시: `satteri-*` 패키지). 기존 remark/rehype 플러그인 직접 호환 여부는 문서에 없음. 가이드는 Unified 플러그인을 "Sätteri로 포팅"해야 한다고 표현.
- 내장 math: 문서에 없음. footnote: `features.gfm.footnotes` (backContent, backLabel, label).
- unified와의 차이점: 문서에 없음 (외부 satteri.bruits.org 문서는 미읽음).

**7. Shiki**: `markdown.shikiConfig` 키는 `theme`, `themes` (`{ light, dark }`), `defaultColor`, `langs`, `langAlias`, `wrap`, `transformers`.
- 출력 클래스: `.astro-code` (dual theme CSS 예시 기준). 기본 테마 `github-dark`.
- 양 processor 적용: 문서에 명시 없음. Sätteri 옵션 타입이 `AstroMarkdownOptions`를 포함해 적용될 가능성은 있으나 미확인.
- `<Code />` 컴포넌트는 `shikiConfig`를 상속하지 않음.

**8. `<Content />`**: 파일 본문을 HTML로 렌더해 반환. 추가 래퍼 요소 여부는 문서에 없음.

## 읽은 문서

- https://docs.astro.build/en/guides/markdown-content/
- https://docs.astro.build/en/guides/syntax-highlighting/
- https://docs.astro.build/en/reference/configuration-reference/
- https://docs.astro.build/en/reference/markdown-processors/satteri/
- https://docs.astro.build/en/reference/markdown-processors/unified/

## 확인하지 못한 것

- raw HTML(details, img width, br) 통과 및 sanitize 여부: 문서에 없음
- heading id 자동 주입 비활성화 옵션: 문서에 없음
- remark-math, rehype-katex, rehype-highlight 조합 및 플러그인 순서: 문서에 없음 (예시 순서는 미검증)
- Sätteri에서 remark/rehype 플러그인 직접 호환 여부와 내장 math 지원: 문서에 없음
- Sätteri와 unified 출력 차이: 외부 satteri.bruits.org 문서 미확인
- markdown.shikiConfig/syntaxHighlight가 Sätteri에도 적용되는지: 타입상 가능성만 있고 명시 문서 없음
- Shiki 출력 클래스 및 인라인 style 동작의 정확한 상세: 가이드 문구가 엇갈려 미확정
- <Content /> 래퍼 요소 유무: 문서에 없음
- remarkRehype 기본값: 문서에 없음
- markdown.syntaxHighlight가 v7에서 키 위치가 바뀌었는지: 변경 언급 없음, 확인 불가
