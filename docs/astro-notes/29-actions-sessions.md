# 29. Actions와 세션: zod 폼 검증, 점진적 향상, 세션 장바구니

## 한 줄 요약

`labs/playground`에 `src/actions/index.ts`의 `server.s82`(`subscribe`·`addToCart`·`clearCart`·`checkout`)를 만들었다. `/s82/subscribe/`는 JS 없이 `<form action={actions.s82.subscribe}>`로 같은 페이지에 POST하고, JS가 있으면 같은 Action을 `/_actions/s82.subscribe`로 불러 페이지 이동 없이 결과·필드 오류를 그린다. `/s82/cart/`는 `Astro.session`에 방문 수와 장바구니를 두어 쿠키 하나에는 이어지고 클라이언트끼리는 섞이지 않는다. `verify/s82.mjs` 10케이스.

## 개념

- **정의**: `defineAction({ accept, input, handler })`를 `server` 객체로 export한다. 객체를 중첩하면 이름이 `s82.subscribe`가 된다. zod는 `astro/zod`에서(v4, `z.email()`). `handler(input, context)`의 `context.session`·`cookies`로 서버 상태를 다룬다.
- **`accept: "form"`**: FormData를 스키마 모양으로 바꾼다. `z.number()` 필드는 숫자로, 빈 칸은 `null`로 들어와 필수 숫자가 0이 되지 않고 실패한다. 생략하면 JSON(`checkout`).
- **두 갈래 호출**: HTML 폼은 `action="?_action=s82.subscribe"`로 페이지 자신에 POST → Astro가 렌더링 전에 실행하고 `Astro.getActionResult(actions.s82.subscribe)`가 `{ data, error }`를 준다. 입력 오류면 응답이 400이다. 클라이언트는 `await actions.s82.subscribe(formData)`가 `POST /_actions/s82.subscribe`를 보내고 성공은 `application/json+devalue`, 실패는 JSON(`fields`, `code`)이다.
- **오류**: `isInputError(error)`면 `error.fields.email` 같은 메시지 배열. 그 밖은 `throw new ActionError({ code: "BAD_REQUEST", message })`.
- **보안**: Action은 누구나 부를 수 있는 공개 엔드포인트다. 각 핸들러가 입력과 권한을 직접 확인한다. 폼 형식 POST는 `checkOrigin`이 `Sec-Fetch-Site`, 없으면 `Origin`을 서버 origin과 비교해 403을 낸다.
- **세션**: 쿠키에는 무작위 id만, 값은 드라이버(여기선 `sessionDrivers.lruCache`, 프로세스 메모리)에. `session.get/set/delete`는 처음 쓸 때 세션을 만들고 `Set-Cookie`를 단다. 값은 devalue로 직렬화되고 `App.SessionData`(`src/s82/session.d.ts`)로 키 타입을 준다. 세션은 방문자당 하나라 키에 `s82:`를 붙였다.

## Next.js 대응

| Next.js                                  | Astro (S8.2)                                               |
| ---------------------------------------- | ---------------------------------------------------------- |
| Server Action (`"use server"`)           | `defineAction` in `src/actions/index.ts`                   |
| `<form action={serverAction}>` (JS 없이) | `<form method="POST" action={actions.x}>` + 요청 시 렌더링 |
| `useActionState`의 반환 상태             | `Astro.getActionResult(actions.x)`                         |
| zod `safeParse` 직접 호출                | `input: z.object(...)`, `isInputError(error).fields`       |
| iron-session 같은 외부 라이브러리        | 내장 `Astro.session` / `context.session` + 드라이버        |

## 빌드 결과물에서 확인하기

- `/s82/subscribe/`의 폼 HTML은 `action="?_action=s82.subscribe"`. 유효한 POST는 200에 `data-result="Welcome Astro (21)"`, 잘못된 POST는 400에 필드마다 `data-error-for`, 입력값은 되살린다.
- `POST /_actions/s82.checkout`(빈 카트) → 400 `{"code":"BAD_REQUEST","message":"the cart is empty"}`. 담고 나면 200 `[{"items":1},3]`(devalue는 값이 인덱스인 평평한 배열).
- `GET /s82/cart/` → `Set-Cookie: s82-session=<uuid>; Path=/; HttpOnly; SameSite=Lax`. 같은 쿠키로 다시 오면 방문 수 2, 3. 쿠키 A·B의 장바구니가 따로 남는다.
- `npm --prefix labs/playground run verify` → `ALL PASS 17/17`(s81 7 + s82 10). `run check` 0 errors.

## 닫힌 고리가 잡아낸 것

- 페이지·Action 전에 `FAILED 1/10`(404, 세션 쿠키 없음, 브라우저 타임아웃)을 봤다. 403 케이스만 통과해 빈 확인이었고, 같은 출처는 200이라는 대조를 더했다.
- 대조가 403으로 실패했다. `Origin: http://127.0.0.1:<port>`인데도 막혔다. `security.allowedDomains`가 없으면 Node 앱은 Host 헤더를 믿지 않고 자기 origin을 `http://localhost:<port>`로 둔다(`astro/dist/core/app/node.js`). 브라우저는 `Sec-Fetch-Site: same-origin`을 먼저 보내 통과한다.
- 폼 POST 결과 페이지를 `reload()`하면 다시 제출된다. 그래서 다시 `goto`했고, POST 렌더링은 방문 수에 넣지 않았다.

## 직접 해볼 실험

끝나면 바꾼 줄을 되돌린다.

1. `config/s82.mjs`를 `export default {};`로 바꾸고 `npm --prefix labs/playground run verify -- --only=s82`.
   <details><summary>예상 결과</summary>`FAILED 6/10`. 세션 케이스 4개가 `astro-session=…; Path=/; HttpOnly; Secure; SameSite=Lax`만 받는다. Node 어댑터가 기본 드라이버(fsLite)를 붙여 `node_modules/.astro/sessions/`에 세션 파일이 생긴다. 브라우저 케이스는 장바구니는 맞고 쿠키 이름만 틀린다(Chromium은 `http://127.0.0.1`에서도 `Secure` 쿠키를 받는다).</details>
2. `src/pages/s82/subscribe.astro`의 `<form … novalidate>`에서 `novalidate`를 지우고 같은 명령.
   <details><summary>예상 결과</summary>`FAILED 9/10`. JS를 끈 브라우저 케이스가 `no form POST`. `type="email"`의 브라우저 기본 검증이 제출을 막아 zod 오류까지 가지 못한다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/actions/ (`defineAction`, `accept: "form"`, `getActionResult`, `ActionError`, `isInputError`)
- https://docs.astro.build/en/guides/sessions/ (`Astro.session`, 드라이버, `App.SessionData`)
- https://docs.astro.build/en/reference/configuration-reference/#session-options (`session.cookie`, `ttl`)
- https://docs.astro.build/en/reference/configuration-reference/#securitycheckorigin (`checkOrigin`)
- https://docs.astro.build/en/guides/integrations-guide/node/#sessions (Node 기본 드라이버)
