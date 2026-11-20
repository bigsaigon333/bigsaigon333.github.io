# 41. 글의 뒤로 가기 버튼

## 한 줄 요약

글 맨 위에 `<a href="/">← 뒤로</a>`를 둔다. 링크만으로 홈에 가고, 스크립트는 이전 기록이 이 사이트일 때만 `history.back()`으로 바꿔 목록의 스크롤 위치와 `<ClientRouter />` 전환을 살린다.

## 개념

- **`src/components/BackLink.astro`**: `<back-link>` 커스텀 엘리먼트가 `<a>`에 클릭 리스너를 한 번 단다(CopyCode 와 같은 패턴). 페이지를 바꿔 넣으면 새 엘리먼트가 붙어 `connectedCallback`이 다시 돌고, 옛 엘리먼트는 버려지므로 리스너가 겹치지 않는다.
- **이전 기록이 이 사이트인지**: `document.referrer`는 처음 로드한 문서에만 맞고 클라이언트 라우팅으로는 갱신되지 않는다. 그래서 referrer 의 origin 이 같거나, ClientRouter 가 `pushState`마다 올리는 `history.state.index`가 0 보다 크면 이 사이트로 본다. 주소를 직접 열었으면 둘 다 아니라서 href 대로 `/`로 간다. sessionStorage 플래그는 같은 탭에서 주소를 직접 입력한 경우를 구별하지 못해 쓰지 않았다.
- 수정 키(Cmd, Ctrl, Shift, Alt)나 가운데 클릭은 가로채지 않는다.
- 접근 가능한 이름은 `aria-label="뒤로 가기"`, 화살표는 `aria-hidden`이다. 색은 `--color-muted`, 포커스는 `--color-accent` 토큰이다.

## Next.js 대응

| Next.js                                       | 이 저장소                                                         |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `useRouter().back()`(`next/navigation`)       | `history.back()`(ClientRouter 가 `popstate`로 전환을 이어 받는다) |
| `<Link href="/">`(JS 없이도 동작하는 `<a>`)   | 그냥 `<a href="/">`, 스크립트는 클릭만 바꾼다                     |
| 클라이언트 컴포넌트(`"use client"`)의 이벤트  | 번들된 `<script>`의 커스텀 엘리먼트                               |
| App Router 의 스크롤 복원(`scroll` 기본 동작) | 뒤로 가기 기록이라 브라우저와 ClientRouter 가 스크롤을 되돌린다   |

## 빌드 결과물에서 확인하기

- `grep -o '<back-link>.*</back-link>' dist/posts/<글>.html`: 모든 글에 링크가 하나, `href="/"`다. 홈과 카테고리 쪽에는 없다.
- 스크립트는 `dist/_astro/`의 번들 모듈 하나로 나오고, CSP 의 `script-src`에 새 해시가 늘지 않는다(인라인이 아니다).

## 닫힌 고리가 잡아낸 것

- `interactions` 검사가 모든 글에서 링크 하나(href `/`)를 확인하고, 홈에서 들어온 글은 클릭하면 `history.length`가 늘지 않고 창 표식이 남은 채 `/`로 가는지(= 뒤로 가기), 주소를 직접 연 글은 `/`로 가는지 본다.
- selftest 변이 "글에서 뒤로 가기 링크를 없앤다"는 실패해야 한다. 링크를 지운 빌드에서 `interactions`가 FAIL 한다.

## 직접 해볼 실험

끝나면 바꾼 줄을 되돌린다.

1. `BackLink.astro`의 `cameFromSite()`가 늘 `true`를 돌려주게 바꾸고 `npm run verify -- --only=interactions`.
   <details><summary>예상 결과</summary>주소를 직접 연 글에서도 클릭이 `history.back()`이 되어 `/`로 가지 않는다. 직접 연 글의 사례가 실패한다.</details>
2. `history.back()`을 `location.href = "/"`로 바꾸고 같은 명령을 돌린다.
   <details><summary>예상 결과</summary>홈에서 들어온 글에서 기록이 하나 늘고 새 문서를 불러와 창 표식이 사라진다. "added a history entry" 또는 "loaded a new document"로 실패한다.</details>

## 문서 근거

- https://developer.mozilla.org/en-US/docs/Web/API/History/back
- https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements
- https://docs.astro.build/en/guides/view-transitions/
- https://nextjs.org/docs/app/api-reference/functions/use-router
