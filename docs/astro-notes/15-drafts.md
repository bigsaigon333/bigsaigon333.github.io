# 15. 초안: import.meta.env.DEV, 컬렉션 필터, dev 전용 컬렉션

## 한 줄 요약

`posts/draft/draft:*.md`의 `draft:` 접두어를 떼고(이름만 바꿨다), `posts/draft/`를 dev에서만 읽는 `drafts` 컬렉션으로 만들었다. `astro dev`에서는 초안이 `[초안]` 표시와 함께 홈 목록과 `/posts/<이름>`에 나오고, 운영 빌드의 `dist/`는 한 바이트도 바뀌지 않았다.

## 개념

- **`import.meta.env.DEV`/`PROD`**: Vite가 빌드할 때 상수로 **정적 치환**한다. `astro dev`는 `DEV=true`, `astro build`는 `PROD=true`. `if (!import.meta.env.DEV) return getPublishedPosts();` 아래의 dev 가지는 운영 번들에서 돌지 않는다.
- **`content.config.ts`에서도 쓸 수 있다.** 설정 파일이 Vite를 거쳐 로드되기 때문이다. `loader: import.meta.env.DEV ? glob({ base: "./posts/draft", … }) : () => []` → 운영 빌드에서 `drafts`는 빈 컬렉션이다(인라인 로더가 빈 배열을 돌려준다). 스키마는 그대로라 `CollectionEntry<"drafts">` 타입은 늘 있다.
- **컬렉션을 둘로 나눈 이유**: 초안은 쓰다 만 글이라 frontmatter가 없기도 하다(`from-mathematics-…-ch07.md`). `posts`의 엄격한 스키마로 읽으면 dev가 멈춘다. `drafts`는 `title`·`date`만 선택으로 풀고, `transform`으로 결과 모양을 `posts`와 맞춘다(`"(제목 없음)"`, `1970-01-01`). 그래서 페이지는 `CollectionEntry<"posts"> | CollectionEntry<"drafts">`를 그대로 `render()`한다.
- **`getCollection(name, filter)`**: `getPublishedPosts`는 `isDraft`로 거른다. 새 `getVisiblePosts`는 운영에서는 같은 것을, dev에서는 `posts` 전부 + `drafts`를 돌려준다. sitemap은 dev에서도 `getPublishedPosts`만 쓴다.
- **id 충돌**: `drafts`의 id도 파일 이름이라 `posts/draft/a.md`와 `posts/a.md`가 같은 주소를 갖는다. 컬렉션이 달라 저장소에서 덮이지는 않지만 `getStaticPaths`가 같은 경로를 두 번 내므로, `getVisiblePosts`가 이름을 밝히고 throw한다.
- **초안 방법 셋을 둘로 줄이지 않은 이유**: 최상위 `draft:` 이름은 이제 쓸 이유가 없지만, 검증 장치(`checks/drafts.mjs`의 분류기와 `cli-cases.mjs`의 "최상위 초안은 빌드되지만 어디에도 실리지 않는다")가 그 이름을 초안으로 본다. 사이트가 그 규칙을 버리면 자기 검사가 실패한다. 규칙은 남기고 README에서 "쓰지 않는다"로 적었다.
- **초안에 댓글을 싣지 않는다.** utterances는 문서 제목으로 이슈를 찾고 만든다. dev에서 초안에 댓글을 달면 실제 저장소에 초안 제목의 이슈가 생긴다.

## Next.js 대응

| 예전 (`git show main:<경로>`)                                          | 지금                                                                                   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `lib/posts.ts`의 `isDraft`: 파일 이름이 `draft:`로 시작하면 초안       | `isDraft`: `drafts` 컬렉션, `draft: true`, 최상위 `draft:` 이름                        |
| `posts/draft/`는 `fs.readdirSync("posts")`가 파일만 골라 자연히 빠졌다 | `posts`는 `*.md`(최상위만), `drafts`는 dev에서만 `posts/draft/*.md`                    |
| dev에서도 초안을 볼 수 없었다                                          | `process.env.NODE_ENV` 대신 `import.meta.env.DEV`. dev에서 `[초안]` 표시와 함께 보인다 |

## 빌드 결과물에서 확인하기

- `npm run verify` → `ALL PASS 14/14`, `drafts 21/21`(초안 21개가 어디에도 없다), `routes 22/22`, accept 파일 없음. 기준선(origin/main)과 같다.
- `grep -rl "초안" dist` → 없음.
- dev: `npx astro dev --background --port <빈 포트>` → `/` 200(`[초안]` 21개), `/posts/is-never` 200, `/posts/%EB%AC%B8…` 200, `/sitemap.xml` 200(`[초안]` 0, `is-never` 0) → `npx astro dev stop`.

## 닫힌 고리가 잡아낸 것

- **Red**: 이름을 바꾼 직후 dev에서 `/posts/is-never` → 404. 그때까지 `posts/draft/`는 어떤 로더도 읽지 않았다.
- **astro 7의 `astro dev`는 비대화형 셸에서 배경으로 떠 있었다.** `npx astro dev &`의 pid를 kill해도 서버가 남아, 다음 실행이 `Dev server already running at … (pid …)`로 바로 끝났다. `--background`로 띄우고 `astro dev stop`으로 끈다.
- **이름 바꾸기 커밋에서 lint-staged의 prettier가 21개 파일을 지나갔다.** `git diff -M --numstat`이 모두 `0 0`이라 내용은 그대로다.
- **글 페이지를 그대로 쓰면 dev의 초안 페이지에도 utterances가 실린다.** 초안 제목으로 실제 이슈가 생길 수 있어 `isDraft`면 `<Comments />`를 빼게 했다. 운영에는 초안이 없어 `content`·`embeds`가 그대로 PASS다.

## 직접 해볼 실험

1. `posts/draft/is-never.md`를 `posts/draft/proxy-to-built-in-objects.md`로 복사하고 `npm run dev`로 `/`를 연다.
   <details><summary>예상 결과</summary>`posts/draft/ 의 초안이 최상위 글과 이름이 같다: proxy-to-built-in-objects` 오류. 운영 빌드(`npm run build`)는 `drafts`를 읽지 않으므로 통과한다. 복사본을 지운다.</details>
2. `src/content.config.ts`의 `import.meta.env.DEV ? glob(…) : () => []`를 `glob(…)`로 바꾸고 `npm run build`.
   <details><summary>예상 결과</summary>빌드는 통과하고 `dist/`도 같다(`getVisiblePosts`가 운영에서 `drafts`를 부르지 않는다). 대신 `node_modules/.astro/data-store.json`에 초안 원고가 들어가고, 초안 하나에 오타 키(`desciption`)가 생기면 배포가 멈춘다. 원래대로 돌린다.</details>
3. `src/lib/posts.ts`의 `getVisiblePosts` 첫 줄(`if (!import.meta.env.DEV) …`)을 지우고 `npm run verify -- --only=drafts`.
   <details><summary>예상 결과</summary>PASS다. 운영에서는 `drafts`가 비어 있고 최상위 초안도 없어서 결과가 같다. 방어가 두 겹(로더가 비고, 함수가 거른다)이라 한 겹만 남아도 새지 않는다. 최상위에 `draft: true` 글을 하나 두면 그때는 `drafts`가 FAIL한다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/environment-variables/ (`import.meta.env.DEV`/`PROD`/`MODE`, 빌드 때 정적 치환)
- https://docs.astro.build/en/guides/content-collections/ (`glob()`의 `pattern`·`base`·`generateId`, `getCollection`의 필터, `PROD`로 운영에서만 초안 거르기)
- 요약: `docs/astro-notes/_refs/drafts.md`. 문서에 없어 직접 확인한 것: `content.config.ts`에서 `import.meta.env.DEV`가 dev에서 true(dev 목록에 21개), 인라인 로더 `() => []`, astro 7의 `astro dev --background`/`stop`.
