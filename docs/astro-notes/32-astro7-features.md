# 32. Astro 7 새 기능: 라우트 캐시, 로거, 라이브 컬렉션, 개발 툴바 앱

## 한 줄 요약

`labs/playground/`에서 Astro 7.4의 새 기능 넷을 돌려 봤다. `cache: { provider: memoryCache() }`와 `routeRules`가 요청 시 렌더링 응답을 메모리에 담는다(`X-Astro-Cache: MISS → HIT → STALE`). `logger: logHandlers.compose(...)`로 직접 만든 로그 핸들러를 끼운다. `src/live.config.ts`의 라이브 컬렉션은 JSON 파일을 요청마다 다시 읽는다. `addDevToolbarApp`으로 붙인 툴바 앱은 `astro dev`에서 서버와 메시지를 주고받는다. `npm --prefix labs/playground run verify`의 s85 케이스 12개가 이것을 확인한다. `src/fetch.ts`(고급 라우팅)는 쓰지 않았다. 다른 데모의 라우트를 건드릴 이유가 없었다.

## 개념

- **라우트 캐시**: `Astro.cache.set({ maxAge, swr, tags })`(엔드포인트는 `context.cache`)와 설정의 `routeRules['/s85/cache/rule/[...path]']`가 캐시 옵션을 만든다. 라우트 호출은 규칙 위에 합쳐진다. 스칼라 값은 나중 것이 이기고 `tags`는 쌓인다. `set(false)`는 캐시를 끈다. `invalidate({ tags })`는 태그로, `invalidate({ path })`는 경로가 정확히 같을 때만 지운다.
- **memoryCache 동작**: GET만 담는다. 키는 origin + 경로 + 정렬된 쿼리다. `Set-Cookie`가 있는 응답은 담지 않고 `cache` 라벨로 경고를 남긴다. 옵션은 `CDN-Cache-Control`·`Cache-Tag` 헤더로 넘어온다. 메모리 provider는 그 헤더를 읽은 뒤 응답에서 **지운다**. 그래서 밖에서 보이는 것은 `X-Astro-Cache`와 `Last-Modified`뿐이다. `astro dev`에서는 `cache.enabled === false`이고 캐시 동작은 아무 일도 하지 않는다.
- **로거**: 설정 최상위 `logger`에 `{ entrypoint, config }`를 준다. 엔트리포인트는 `default(config) → { write(message) }`를 내보낸다. `message`는 `{ level, label, message, newLine }`이다. `matchesLevel`(`astro/logger`)로 레벨을 거른다. Astro는 설정을 읽을 때 Node에서 이 모듈을 바로 import한다(그래서 `.mjs`로 썼다). 서버 번들에는 `virtual:astro:logger`로 들어간다. 불러오기에 실패하면 경고 없이 기본 node 로거로 돌아간다.
- **라이브 컬렉션**: `defineLiveCollection({ loader, schema })`를 `src/live.config.ts`에 둔다. 로더의 `loadCollection({ filter })`·`loadEntry({ filter: { id } })`가 요청마다 불린다. 결과의 `cacheHint`(`tags`, `lastModified`)는 `Astro.cache.set(entry)`로 캐시에 넘긴다. 실패는 던지지 않고 `{ error }`로 온다(`LiveEntryNotFoundError`, `LiveCollectionValidationError`).
- **개발 툴바 앱**: 통합의 `astro:config:setup`에서 `addDevToolbarApp({ id, name, icon, entrypoint })`를 부른다. 앱은 `defineToolbarApp({ init(canvas, app, server) })`다. 서버 쪽은 `astro:server:setup`의 `toolbar.on`·`send`·`onAppInitialized`를 쓴다.

## Next.js 대응

| Next.js                                       | Astro 7 (S8.5)                                             |
| --------------------------------------------- | ---------------------------------------------------------- |
| `export const revalidate = 60` / `fetch` 캐시 | `Astro.cache.set({ maxAge: 60 })`, `routeRules`            |
| `revalidateTag('x')` / `revalidatePath('/p')` | `context.cache.invalidate({ tags: ['x'] })` / `({ path })` |
| `cacheHandler` (커스텀 캐시)                  | `cache.provider` (`memoryCache()`, 어댑터의 CDN provider)  |
| 런타임에 데이터를 읽는 서버 컴포넌트          | `getLiveCollection` / `getLiveEntry` (라이브 컬렉션)       |
| (없음, 커스텀 로거는 직접 감싼다)             | `logger: logHandlers.compose(logHandlers.node(), { ... })` |

## 빌드 결과물에서 확인하기

- `/s85/cache/page/?run=…`을 두 번 부르면 `MISS` 다음 `HIT`이고 `data-render-id`가 같다. `cdn-cache-control`·`cache-tag` 헤더는 없다.
- `/s85/cache/rule/override/`의 옵션은 `{ maxAge: 1, tags: ["s85-rule", "s85-override"] }`다. 두 태그 중 어느 것으로 지워도 `MISS`가 된다. 1.3초 뒤에도 `MISS`라서 규칙의 60이 1로 바뀌었음을 알 수 있다.
- `swr`(`maxAge: 1, swr: 30`)은 1.3초 뒤 `STALE`로 옛 본문을 준다. 다음 요청은 `HIT`이고 새 본문이다.
- 로그: `POST /s85/logger`가 info·warn·error를 하나씩 남긴다. `level: "warn"`인 기록기에는 warn과 error만 남는다.
- 라이브: `POST /s85/live/api` 다음 `/s85/live/`에 새 항목이 보인다(재빌드 없음). 항목 페이지는 쓰기가 그 태그를 지울 때까지 `HIT`이다.

## 닫힌 고리가 잡아낸 것

- Red는 `FAILED 1/12`였다(404). 통과한 하나는 "POST는 캐시하지 않는다"였다. 그 케이스에 "뒤이은 GET이 MISS"라는 확인을 더해 거저 통과하지 못하게 했다.
- 처음에는 `CDN-Cache-Control: max-age=60`을 기대했지만 `null`이었다. 그런데 `HIT`은 됐다. `core/cache/handler.js`가 런타임 provider가 읽은 뒤 두 헤더를 지운다. 그래서 병합 규칙은 페이지의 `Astro.cache.options`와, 태그 무효화·만료 같은 동작으로 확인하도록 바꿨다.
- 툴바 케이스: `astro dev`가 에이전트를 감지하면 스스로 **백그라운드 서버**를 띄운다(`--json`, 부모 pid 1, `.astro/dev.json` 잠금). 다음 실행은 "Dev server already running"으로 실패했다. `astro dev stop`으로 정리한 뒤 `--ignore-lock`으로 포그라운드 자식으로 띄운다.
- `astro check`가 `node:fs`를 몰랐다. lab에 `@types/node`(^24)를 devDependency로 더했다.

## 직접 해볼 실험

끝나면 바꾼 줄을 되돌린다.

1. `config/s85.mjs`에서 `cache` 키를 지우고 `npm --prefix labs/playground run verify -- --only=s85`.
   <details><summary>예상 결과</summary>`FAILED 2/12`. 캐시 케이스는 `null !== 'MISS'`다. provider 없이 `routeRules`만 있으면 아무것도 담지 않는다. `cache.invalidate()`는 던진다. 그래서 `POST /s85/live/api`가 500이 되고 라이브 케이스도 실패한다. 남는 것은 로거와 툴바 케이스다.</details>
2. `config/s85.mjs` 기록기의 `level`을 `"info"`로 바꾸고 같은 명령을 돌린다.
   <details><summary>예상 결과</summary>로거 케이스만 실패한다. 기록된 레벨이 `["error", "info", "warn"]`이 된다. 걸러 내는 것은 Astro가 아니라 핸들러의 `matchesLevel`이다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/caching/ (`cache.provider`, `routeRules`, `cache.set/invalidate`, 개발 모드)
- https://docs.astro.build/en/reference/logger-reference/ (`logHandlers`, 커스텀 엔트리포인트, `matchesLevel`)
- https://docs.astro.build/en/guides/content-collections/ (라이브 컬렉션, `live.config.ts`, `cacheHint`)
- https://docs.astro.build/en/reference/dev-toolbar-app-reference/ (`addDevToolbarApp`, `defineToolbarApp`, `toolbar.onAppInitialized`)
- https://docs.astro.build/en/guides/upgrade-to/v7/ (실험 플래그 정식화, `src/fetch.ts` 예약)
