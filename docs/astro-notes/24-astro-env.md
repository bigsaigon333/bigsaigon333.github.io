# 24. astro:env: 타입이 있는 환경 변수 스키마

## 한 줄 요약

GA 측정 ID, `google-site-verification` 토큰, utterances 저장소를 코드에서 빼 `config/env.mjs`의 `env.schema`(astro:env)로 옮겼다. 값은 커밋한 `config/.env.production`·`config/.env.development`에 있고, `src/lib/site.ts`가 `astro:env/server`에서 읽는다. 빌드 결과물은 바이트 단위로 같고, 값이 빠지거나 제약에 어긋나면 빌드가 그 변수 이름을 대며 멈춘다.

## 개념

- **스키마**: `envField.string({ context, access, ... })`. 세 값 모두 HTML에 글자로 박히는 공개 값이라 `access: "public"`. 읽는 곳이 빌드 때 렌더하는 컴포넌트뿐이라 `context: "server"`(`astro:env/server`). `context: "client"`는 번들되는 클라이언트 스크립트에서 읽을 때 필요하다. `client` + `secret` 조합은 없다.
- **제약**: `GA_MEASUREMENT_ID`는 `startsWith: "G-"`, `GOOGLE_SITE_VERIFICATION`은 `length: 43`, `UTTERANCES_REPO`는 `includes: "/"`. 문자열은 그 밖에 `min`·`max`·`url`·`endsWith`를 쓸 수 있다.
- **검사 시점**: 가상 모듈(`astro:env/server`)을 불러올 때 스키마 전체를 검사한다. `site.ts`는 거의 모든 페이지가 가져오므로 빌드마다 검사된다. 빈 문자열은 빠진 것으로 본다. `astro sync`는 타입만 만들고 실패하지 않는다.
- **default를 주지 않는다**: default가 있으면 값이 빠져도 그 값으로 조용히 빌드된다. "빠지면 멈춘다"를 지키려면 값은 파일에 두고 스키마는 비워야 한다.
- **값의 자리와 우선순위**: Vite `loadEnv`가 `envDir`에서 `.env`, `.env.local`, `.env.<mode>`, `.env.<mode>.local` 순으로 읽고, 이미 있는 환경 변수가 이긴다. `vite.envDir`를 `config/`(절대 경로)로 돌렸다. Astro의 로더는 `envDir`를 그대로 `loadEnv`에 넘기므로 상대 경로면 작업 디렉터리 기준이 된다.
- **커밋하는 파일과 트레이드오프**: `.gitignore`는 `.env`와 `.env.*.local`만 막는다. 그래서 모드별 파일 `.env.production`(빌드)·`.env.development`(dev)를 커밋했다. 로컬·CI·자기 검사의 프로젝트 복사본 모두 설정 없이 빌드되고, 워크플로는 값을 모른다. 대가: 두 파일이 같은 값을 따로 가진다(바꿀 때 둘 다). 비밀은 여기에 둘 수 없다. 비밀이 생기면 `access: "secret"`으로 두고 CI 시크릿으로 넘긴다. 개인 덮어쓰기는 무시되는 `config/.env.development.local`에 둔다.
- **dev에서도 같은 값**: dev 방문도 운영 GA 속성에 page_view로 잡힌다(예전과 같다). 막으려면 `.env.development`의 측정 ID만 바꾸면 된다.

## Next.js 대응

| Next.js                                         | Astro (S7.1)                                              |
| ----------------------------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_*`가 클라이언트 번들에 인라인      | `context: "client"` + `astro:env/client`(또는 `PUBLIC_*`) |
| `process.env.X`(서버), 타입·검사 없음           | `astro:env/server`의 이름 있는 export, 타입·검사 있음     |
| `@t3-oss/env-nextjs` 같은 라이브러리로 zod 검사 | `env.schema`가 내장(`envField`)                           |
| `.env.production` 커밋 관례                     | 같다(Vite `loadEnv`). 위치는 `vite.envDir`                |

## 빌드 결과물에서 확인하기

- `diff -r`로 바꾸기 전 빌드와 비교하면 차이가 없다. 전체 `npm run verify`(기준선 origin/main)는 새 accept 없이 22/24이고, 실패한 `budget`·`routes`는 바꾸기 전 빌드(`--candidate`)에서도 똑같다. main이 #15로 움직여 S6의 accept 파일이 낡은 탓이지 이 변경 탓이 아니다.
- 홈 `<head>`: `<meta name="google-site-verification" content="EgEIEy…">`, `gtag/js?id=G-Y270VJN1Y2`, `const gaId = "G-Y270VJN1Y2"`.
- 글 페이지: `<script … repo="bigsaigon333/bigsaigon333.github.io" issue-term="title" …>`(속성 순서 그대로).

## 닫힌 고리가 잡아낸 것

- Red: 바꾸기 전에 `GA_MEASUREMENT_ID= astro build`는 `exit=0`이었다. 변수가 없으니 빠져도 알 수 없었다.
- Green: 같은 명령이 `exit=1`, `[EnvInvalidVariables] … - GA_MEASUREMENT_ID is missing`. `UTTERANCES_REPO=bigsaigon333`이면 `The following constraints for UTTERANCES_REPO are not met: includes`. 환경 변수 없이는 `exit=0`이고 결과물이 같다.
- dev: `GOOGLE_SITE_VERIFICATION=short astro dev`는 페이지 요청이 500(EnvInvalidVariables)이고, 덮어쓰지 않으면 200에 세 값이 그대로 나온다.
- 처음엔 env 파일을 루트에 두려 했다. 자기 검사(`cli-cases.mjs`)가 빌드용 프로젝트 복사본에 `config/`·`src/` 등만 옮겨서, 루트의 `.env.production`은 복사본에 없어 빌드가 멈췄을 것이다. `config/`로 옮겨 피했다.

## 직접 해볼 실험

끝나면 `git checkout config src`로 되돌린다.

1. `config/env.mjs`의 `GA_MEASUREMENT_ID`에 `default: "G-Y270VJN1Y2"`를 더하고 `GA_MEASUREMENT_ID= npm run build`.
   <details><summary>예상 결과</summary>빌드가 성공한다. 빈 값을 빠진 것으로 보고 default를 채운다. 그래서 default를 두면 "빠짐"을 잡을 수 없다.</details>
2. `src/lib/site.ts`의 import를 `astro:env/client`로 바꾸고 `npm run build`.
   <details><summary>예상 결과</summary>`[MISSING_EXPORT] "GA_MEASUREMENT_ID" is not exported by "\0astro:env/client"`로 멈춘다. `context: "server"` 변수는 server 모듈만 내보낸다. `context: "client"`로 바꾸면 다시 빌드된다.</details>
3. `config/.env.production`을 루트로 옮기고 `npm run build`.
   <details><summary>예상 결과</summary>`envDir`가 `config/`라 파일을 찾지 못해 세 변수 모두 `is missing`으로 멈춘다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/environment-variables/ (`env.schema`, `envField`, context·access, 제약)
- https://docs.astro.build/en/reference/modules/astro-env/ (`astro:env/client`·`astro:env/server`)
- https://docs.astro.build/en/reference/configuration-reference/#env
- https://vite.dev/guide/env-and-mode (`.env.<mode>` 파일, 우선순위, `envDir`)
