# 28. CSP: `security.csp`, 인라인 스크립트 해시, meta 정책의 한계

## 한 줄 요약

`config/csp.mjs`의 통합이 Astro 내장 `security.csp`를 켜서 모든 페이지에 같은 `<meta http-equiv="content-security-policy">` 하나를 싣는다. 허용하는 것은 이 사이트의 파일, GA(googletagmanager·google-analytics), utterances(스크립트와 iframe)뿐이고 `script-src`에 `'unsafe-inline'`이 없다. is:inline 스크립트(테마, GA 설정)는 `inlineScript(Astro, code)`가 sha256을 정책에 넣는다. 새 `csp` 검사가 모든 라우트와 홈 → 글 → 글의 클라이언트 이동에서 위반 0을 확인한다.

## 개념

- **meta 정책**: GitHub Pages는 응답 헤더를 정할 수 없으니 `<meta http-equiv>`만 쓸 수 있다. meta 정책은 **그 뒤에 파싱되는 것만** 덮는다. 그리고 `frame-ancestors`(클릭재킹 방어), `report-uri`·`report-to`(위반 보고), `sandbox`는 meta에서 무시되고, `Content-Security-Policy-Report-Only`도 헤더뿐이다.
- **Astro가 해 주는 것**: 자기가 묶은 스크립트·스타일의 해시를 `script-src`·`style-src`에 넣고, `font-src 'self'`(Fonts API)를 더한다. `directives`로 나머지 지시어, `scriptDirective.resources`로 외부 출처, `styleDirective.resources`의 `{ resource: "'unsafe-inline'", kind: "attribute" }`로 `style-src-attr`만 연다(Shiki의 `style="--shiki-light:…"` 때문. 속성은 해시로 허용할 수 없다).
- **Astro가 모르는 것**: is:inline 스크립트. 그래서 본문을 프런트매터에서 문자열로 만들고 `<script is:inline set:html={…} />`로 그대로 내보내며, 같은 문자열의 해시를 `Astro.csp.insertScriptHash()`로 넣는다. define:vars가 만들던 `(function(){const gaId = …;…})();` 모양 그대로다. utterances의 client.js가 `<head>`에 넣는 `<style>`도 해시로 허용한다(client.js에서 옮긴 글자).
- **meta 위치**: Astro는 meta를 `</head>` 앞에 둔다. 그러면 테마 스크립트·GA 로더가 정책 밖이다. 통합의 `astro:build:done`이 meta를 `<meta charset>` 바로 뒤로 옮긴다.
- **`<ClientRouter />`와 함께 쓰기**(Astro 문서는 지원하지 않는다고 적는다). 두 가지가 문제였다.
  - 라우터는 첫 문서의 정책을 지우지 못하고 새 문서의 meta를 **더한다**. 페이지마다 끼운 CSS가 달라 정책이 다르면 새 페이지의 `<style>`이 첫 정책에 막힌다.
  - HTML에 끼운 모듈 스크립트가 있으면 라우터가 `<script type="module" src="data:application/javascript,">`를 넣는다. data:를 허용하면 아무 data: 스크립트나 돈다.
  - 그래서 `vite.build.assetsInlineLimit = 0`으로 스크립트·CSS·글꼴을 모두 파일로 낸다. 정책이 31쪽 모두 같아지고(다르면 빌드를 멈춘다), data: 스크립트도 생기지 않는다.

## Next.js 대응

| Next.js                                              | Astro (S7.2)                                               |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `middleware.ts`에서 nonce를 만들어 CSP 헤더에 싣는다 | 정적 출력이라 nonce가 없다. 빌드 때 계산한 해시를 meta에   |
| `<Script nonce={nonce}>`                             | `inlineScript(Astro, code)` → `Astro.csp.insertScriptHash` |
| `next.config.js` `headers()`의 `frame-ancestors`     | 할 수 없다(meta 정책). 헤더를 줄 수 있는 호스트가 필요하다 |
| `experimental.sri`                                   | `scriptDirective.strictDynamic`(importmap integrity)       |

## 빌드 결과물에서 확인하기

- `dist/index.html`이 `<head><meta charset="utf-8"><meta http-equiv="content-security-policy" content="default-src 'self';base-uri 'self';object-src 'none';…">`로 시작한다. 31쪽 모두 같은 글자다.
- `script-src 'self' https://*.googletagmanager.com https://utteranc.es 'sha256-…'`에 테마·GA 설정 스크립트의 해시가 있다. `<script type="module">` 인라인은 없고 `/_astro/*.js` 파일이다. `style-src-attr 'unsafe-inline'`만 속성을 연다.
- 빌드 로그 `[csp] CSP <meta> 를 <head> 맨 앞으로 옮겼다: 31쪽, 정책 1가지`.
- `npm run verify -- --only=csp` → `PASS csp 65/65`(정책 31, 로드 31, 이동 3).

## 닫힌 고리가 잡아낸 것

- 검사를 먼저 써서 돌렸다: `policy: 0 <meta http-equiv="content-security-policy">, expected 1`로 실패.
- `security.csp: true`만 켜자 정책이 4가지(페이지마다 끼운 CSS의 해시)였고, meta가 테마·GA·ClientRouter 스크립트 **뒤**에 있었다. is:inline 두 스크립트의 해시는 없었다.
- 검사는 외부 요청을 직접 받는다. 받은 요청은 정책을 통과한 것이고(stub으로 답하거나 끊는다), 정책이 막은 요청은 renderer를 떠나지 않아 `securitypolicyviolation`으로만 보인다. utteranc.es를 뺀 정책은 `blocked by CSP: script-src-elem blocked https://utteranc.es/client.js`와 `utterances client.js not requested`가 함께 나온다.
- 자기 검사 변이 4개(해시 없는 인라인 스크립트, utteranc.es 없는 정책, meta를 `</head>` 앞으로, 새 글에만 인라인 스크립트)를 모두 잡는다.

## 직접 해볼 실험

끝나면 바꾼 줄을 되돌린다.

1. `config/csp.mjs`의 `vite: { build: { assetsInlineLimit: 0 } }` 줄을 지우고 `npm run build`.
   <details><summary>예상 결과</summary>`astro:build:done`에서 멈춘다: `페이지마다 CSP 가 다르다(4가지): 404.html, index.html, posts/css-masters-2-week1.html, tags/built-in-object.html`.</details>
2. `src/components/Analytics.astro`의 `gtagScript`를 쓰지 않고 예전처럼 `<script is:inline define:vars={{ gaId }}>…</script>`로 되돌린 뒤 `npm run verify -- --no-check --only=csp --route=/`.
   <details><summary>예상 결과</summary>`FAIL csp 3/5`. `load`와 `navigate /`가 `blocked by CSP: script-src-elem blocked inline`(콘솔: `Executing inline script violates …`). 로더는 출처로 허용되므로 요청되고, 해시 없는 설정 스크립트만 막힌다. 이동 단계는 통과한다: head 의 같은 스크립트를 라우터가 다시 돌리지 않는다.</details>
3. `config/csp.mjs`의 `styleDirective.hashes`를 비우고 utterances가 있는 글로 같은 검사를 돌린다.
   <details><summary>예상 결과</summary>`blocked by CSP: style-src-elem blocked inline`과 `div.utterances position static: the client's <style> did not apply`.</details>

## 문서 근거

- https://docs.astro.build/en/reference/configuration-reference/#securitycsp (`algorithm`, `directives`, `scriptDirective`, `styleDirective`, `kind`, ClientRouter·Shiki 미지원)
- https://docs.astro.build/en/reference/api-reference/#csp (`Astro.csp.insertScriptHash`)
- https://w3c.github.io/webappsec-csp/#meta-element (meta에서 무시되는 `report-uri`·`frame-ancestors`·`sandbox`)
- https://developers.google.com/tag-platform/security/guides/csp (GA4가 쓰는 출처)
