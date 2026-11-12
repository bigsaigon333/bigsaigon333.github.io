# 문서 요약: content-collections

> 문서 스카우트가 공식 문서를 읽고 요약한 것이다. 요약과 실제 동작이 다르면 실제 동작을 따르고 학습 노트에 적는다.

## 1. src/content.config.ts (로컬 Markdown)
```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/data/blog' }),
  schema: z.object({ title: z.string(), pubDate: z.coerce.date(), updatedDate: z.coerce.date().optional() }),
});
export const collections = { blog };
```
- export 이름은 `collections`. `.js`/`.mjs`도 지원.

## 2. glob() 옵션 (문서: content-loader-reference)
- `pattern`: `string | string[]`, micromatch 문법, base 기준 상대. 예시 `**/*.md`(재귀). 최상위만은 `*.md`로 추정(micromatch 의미), 문서 예시 없음.
- `base`: `string | URL`, 기본 `"."`. 문서상 "from anywhere on the filesystem"; `./posts` 같은 src 밖 예시는 없음.
- `generateId({ entry, base, data })` => `string`. `entry`는 base 기준 상대 경로. 기본은 github-slugger kebab-case.
- `retainBody` (기본 true, added 5.17.0): false면 `body` undefined, `rendered.html`/`filePath`는 유지.
- `deferRender` (기본 false, added 7.1.0): Markdown 렌더를 페이지 렌더 시점으로 지연(메모리 절감).
- frontmatter `slug:`로 개별 id 덮어쓰기 가능.
- `file()` loader: `file('src/data/x.json')`, 배열(각 객체에 `id`) 또는 키=id 객체, `parser` 옵션.

## 3. Entry shape (CollectionEntry)
- `id: string`, `collection`, `data`, `body: string | undefined`(raw), `rendered: RenderedContent | undefined`, `filePath: string | undefined`(프로젝트 상대).
- `digest`: CollectionEntry 레퍼런스에 없음. 로더 DataEntry에만 "optional content digest"로 언급. 앱 코드에서 쓰지 말 것.
- id: `hello-world.md` -> `hello-world`. 소문자화, 비ASCII, `:` 처리 규칙은 문서에 없음(github-slugger 위임으로만 언급). 확인 불가.

## 4. Schema (`astro/zod`)
- 문서 예시: `pubDate: z.coerce.date()`, `z.coerce.date().optional()`. "2022-05-08" 문자열 -> Date 변환 근거.
- 기본값, 쉼표 문자열 -> `string[]` 변환: 문서 예시 없음(Zod 표준 API로만 추정, 확인 불가).
- Zod 4 여부: 문서에 명시 없음.
- 잘못된 frontmatter: "Astro will provide a helpful error"라고만 서술. 파일명 포함 여부 문서에 없음.

## 5. 조회
```ts
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
const posts = await getCollection('blog', ({ data }) => data.draft !== true);
const one = await getEntry('blog', 'hello-world'); // undefined 가능
type Post = CollectionEntry<'blog'>;
const sorted = [...posts].sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
```
- 정렬: 문서 "non-deterministic and platform-dependent" -> 직접 정렬 필수.

## 6. 렌더링
```astro
---
import { getEntry, render } from 'astro:content';
const entry = await getEntry('blog', 'hello-world');
if (!entry) throw new Error('not found');
const { Content, headings, remarkPluginFrontmatter } = await render(entry);
---
<Content />
```
- `headings`: getHeadings()와 동일 형태 서술. `remarkPluginFrontmatter`: `any`.

## 7. 타입 생성 / 스토어 / 버전
- 타입: dev 재시작 또는 content sync(`s + enter`) 시 정의. astro sync/build 시점 명시 없음.
- 스토어 위치: 문서 미명시. JSON Schema 출력은 `.astro/collections/`.
- v6.0.0: live collections 추가(`src/live.config.*`, `defineLiveCollection`, `getLiveCollection`, `getLiveEntry`). build-time 컬렉션 방식은 변경 서술 없음.
- v7: `deferRender`(7.1.0), live cache 관련 7.0.0 표기.
- legacy collection 제거 여부: 이 페이지들에 없음. v6/v7 업그레이드 가이드 미확인.
- experimental/deprecated 표기: 읽은 페이지에 없음. 사이드바에 "Collection storage", "Intellisense for collections" experimental flag 존재(내용 미확인).

## 읽은 문서

- https://docs.astro.build/en/guides/content-collections/
- https://docs.astro.build/en/reference/modules/astro-content/
- https://docs.astro.build/en/reference/content-loader-reference/

## 확인하지 못한 것

- glob pattern으로 최상위 *.md만 매칭하는 동작 (문서 예시 없음, micromatch 추정)
- base가 src 밖(예: ./posts)을 가리킬 때의 동작 (문서 예시 없음)
- id 생성 시 소문자화, 비ASCII, ':' 처리 규칙 (github-slugger 언급만)
- CollectionEntry에 digest 필드 존재 여부 (로더 DataEntry에만 명시)
- z.coerce.date().default() 등 기본값, 쉼표 문자열 -> string[] 변환 (문서 예시 없음)
- Zod 4 사용 여부
- 잘못된 frontmatter 빌드 에러가 파일명을 포함하는지
- astro sync/build 시 타입 생성 시점
- 데이터 스토어(.astro/ 하위) 물리 위치
- legacy collections 제거 여부 (v6/v7 업그레이드 가이드 미확인)
- Generating Routes from Content 섹션 (getStaticPaths 패턴, 정적 출력 라우팅) 미확인
