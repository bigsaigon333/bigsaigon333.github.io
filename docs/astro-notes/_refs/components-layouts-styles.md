# 문서 요약: components-layouts-styles

> 문서 스카우트가 공식 문서를 읽고 요약한 것이다. 요약과 실제 동작이 다르면 실제 동작을 따르고 학습 노트에 적는다.

## components-layouts-styles (Astro 7.x 문서 기준)
Q1 컴포넌트: `---` 펜스 안이 컴포넌트 스크립트(TS), 아래가 템플릿(HTML + `{}` 표현식). 펜스 코드는 브라우저로 나가지 않음.
```astro
---
interface Props { name: string; greeting?: string; }
const { greeting = "Hello", name } = Astro.props;
---
<h2>{greeting}, {name}!</h2>
<ul>{items.map((x) => <li>{x.name}</li>)}</ul>
```
조건부 렌더링 전용 예시는 문서에 없음(JS 표현식 사용 가능만 명시). Fragment: `<Fragment slot="x">`, `<Fragment set:html={...}>`(래퍼 없이 묶음).
Q2 Slots: 기본 `<slot />`; 이름 `<slot name="after-header" />` + 자식 `slot="after-header"`(직계 자식만). 폴백 `<slot><p>기본</p></slot>`은 전달된 자식이 없을 때만 표시. 레이아웃은 `<MySiteLayout title="Home">…</MySiteLayout>`로 감싸고 내부에 `<slot />`. 중첩 전달: `<slot name="head" slot="head" />`. `src/pages/*.md`는 frontmatter `layout:`으로 레이아웃 지정, 모든 frontmatter가 `Astro.props`로 전달됨(`frontmatter` 객체 형태).
Q3 Directives(실험/폐기 표기 없음):
- `class:list={['box', {red: isRed}]}`: 문자열/객체/배열, falsy 제외(clsx 기반).
- `set:html={str}`: 이스케이프 안 함, XSS 주의.
- `set:text={str}`: 자동 이스케이프(`{str}`과 동일).
- `is:global`: 해당 `<style>` 스코핑 해제(= `:global()` 감싼 것과 같음).
- `is:inline`: 번들/처리 없이 출력 그대로. src 외 속성이 있는 script/style에 자동 적용.
- `define:vars={{ c }}`: frontmatter 값을 CSS 변수로 전달. `<script>`에 쓰면 is:inline 강제.
Q4 Scoped: 기본 `scopedStyleStrategy: 'attribute'`(`data-astro-cid-*`), 옵션 `'where' | 'class' | 'attribute'`. 자식 컴포넌트 내부는 스타일 안 먹음 → 래퍼 div에 스타일. 자식 루트에 class 전달: `const { class: className, ...rest } = Astro.props;` + `<div class={className} {...rest}>`. 슬롯/Markdown 콘텐츠: `article :global(h1) { … }`.
Q5 Global/순서: 레이아웃 frontmatter 최상단에 `import '../styles/global.css';`. 우선순위 낮→높: `<link>`(head) < import된 CSS < scoped `<style>`; 같은 특이도면 나중 import 승. 빌드: `build.inlineStylesheets` 기본 `'auto'`, `vite.build.assetsInlineLimit`(약 4kB) 미만은 `<style>` 인라인, 이상은 외부 시트. 출력 파일 위치는 문서에 없음.
Q6 v7 Rust 컴파일러: 닫히지 않은 태그는 에러(void `<br><img><input><hr>` 제외). 잘못된 중첩(`<p><div>`)은 자동 교정 안 하고 그대로 전달. 템플릿 문법 변경은 v7 가이드에 없음. CSS 직렬화(색상 hex화, url 따옴표)는 무해. 함께 바뀐 기본값: `compressHTML` `'jsx'` → `<span>hello</span><em>world</em>`는 "helloworld". 공백은 `{" "}`, 이전 동작은 `compressHTML: true`.
Q7 Head: `<html>`은 레이아웃 최상위, `<head>`는 레이아웃 안에 직접 작성. 페이지별 head는 `<slot name="head" />`. 자동 주입: .astro 기준 문서에 명시 없음. MDX는 `<meta charset="utf-8">`을 직접 넣어야 함(자동 추가 중단).

## 읽은 문서

- https://docs.astro.build/en/basics/astro-components/
- https://docs.astro.build/en/basics/layouts/
- https://docs.astro.build/en/guides/styling/
- https://docs.astro.build/en/reference/directives-reference/
- https://docs.astro.build/en/guides/upgrade-to/v7/
- https://docs.astro.build/en/reference/configuration-reference/

## 확인하지 못한 것

- build.inlineStylesheets 기본값 'auto'와 4kB 임계값: 설정 문서 요약(모델 추출)에서만 확인, 원문 미확인
- build.format 'file' 옵션 설명: 요약에서만 확인, 원문 미확인
- bundled CSS 출력 파일 위치(경로): 문서에 없음
- 조건부 렌더링(삼항/&&) 전용 예시: 문서에 없음 (astro-syntax 페이지 미독)
- v5/v6 대비 템플릿 문법 차이: v7 가이드에 항목 없음 (확인 범위 내 문서에 없음)
- .astro 컴포넌트 head 자동 주입 여부: 문서에 명시 없음
- scopedStyleStrategy가 v7에서 변경됐는지: 설정 문서 원문에 변경 표기 없음
