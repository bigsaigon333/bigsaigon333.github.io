# 41. 글의 뒤로 가기 버튼

## 한 줄 요약

글 맨 위에 `<a href="/">← 뒤로</a>`를 둔다. 링크만으로 홈에 가고, 스크립트는 이전 기록이 이 사이트일 때만 `history.back()`으로 바꿔 목록의 스크롤 위치와 `<ClientRouter />` 전환을 살린다.

## 개념

- **`src/components/BackLink.astro`**: `<back-link>` 커스텀 엘리먼트가 `<a>`에 클릭 리스너를 한 번 단다(CopyCode 와 같은 패턴). 페이지를 바꿔 넣으면 새 엘리먼트가 붙어 `connectedCallback`이 다시 돌고, 옛 엘리먼트는 버려지므로 리스너가 겹치지 않는다.
- **이전 기록이 이 사이트인지**: `document.referrer`는 처음 로드한 문서에만 맞고 클라이언트 라우팅으로는 갱신되지 않는다. 그래서 referrer 의 origin 이 같거나, ClientRouter 가 `pushState`마다 올리는 `history.state.index`가 0 보다 크면 이 사이트로 본다. 주소를 직접 열었으면 둘 다 아니라서 href 대로 `/`로 간다. sessionStorage 플래그는 같은 탭에서 주소를 직접 입력한 경우를 구별하지 못해 쓰지 않았다.
- 수정 키(Cmd, Ctrl, Shift, Alt)나 가운데 클릭은 가로채지 않는다.
- 접근 가능한 이름은 `aria-label="뒤로 가기"`, 화살표는 `aria-hidden`이다. 색은 `--color-muted`, 포커스는 `--color-accent` 토큰이다.

## 검증

`interactions` 검사가 모든 글에서 링크 하나(href `/`)를 확인하고, 홈에서 들어온 글은 클릭하면 `history.length`가 늘지 않고 창 표식이 남은 채 `/`로 가는지(= 뒤로 가기), 주소를 직접 연 글은 `/`로 가는지 본다. selftest 변이 "글에서 뒤로 가기 링크를 없앤다"는 실패해야 한다.
