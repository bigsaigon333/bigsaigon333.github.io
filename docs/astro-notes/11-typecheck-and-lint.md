# 11. 타입 검사와 린트: astro check, tsc(TypeScript 7), oxlint

## 한 줄 요약

루트의 `typescript`를 7.0.2(네이티브 컴파일러)로 올렸다. `.ts`는 `npm run typecheck`(`tsc --noEmit`, 86ms)가, `.astro`는 `npm run check`(`tools/astro-check/`에 따로 깔린 `@astrojs/check` + TypeScript 6, 1.0초)가 보고, 타입으로 못 잡는 것은 `npm run lint`(oxlint, 55ms)가 본다.

## 개념

- **`tsc`는 `.astro`를 읽지 않는다.** `astro dev`와 `astro build`도 타입을 지우기만 하고 검사하지 않는다. `.astro`의 `interface Props`, `Astro.props`, 템플릿의 `{표현식}`을 검사하는 것은 `@astrojs/check`뿐이다.
- **`@astrojs/check`가 하는 일**: Astro 언어 서버(`@astrojs/language-server`)가 `.astro`를 가상의 TSX로 바꾸고(`@astrojs/astro2tsx`), Volar(`@volar/kit`)가 그 TSX를 TypeScript의 **언어 서비스 API**(`ts.sys`, `ts.findConfigFile`, `LanguageServiceHost`)에 넣어 진단을 받은 뒤 위치를 원래 파일로 되돌린다. 에디터의 빨간 줄과 같은 경로다.
- **`.astro/types.d.ts`**: `astro sync`가 만든다. 내용은 두 줄로, `astro/client`(`astro:content` 같은 가상 모듈, `import.meta.env`)와 `content.d.ts`(스키마에서 나온 `CollectionEntry<"posts">`)를 참조한다. `tsconfig.json`의 `include` 첫 항목이 이 파일이다. 없으면 `tsc`가 `astro:content`를 못 찾으므로 `check`와 `typecheck` 둘 다 `astro sync`부터 돈다.
- **TypeScript 7이 바꾼 것**: 컴파일러가 네이티브 실행 파일이 됐다. `node_modules/typescript`는 3.5MB의 껍데기고 실제 `tsc`는 `node_modules/@typescript/typescript-<플랫폼>/lib/tsc`(23MB)다. `require("typescript")`는 `version`, `versionMajorMinor`만 내놓는다. 언어 서비스 API가 없어서 Volar 위의 검사기가 돌 수 없다.
- **그래서 TypeScript가 둘이다.** `@astrojs/check`의 peer는 `typescript@^5 || ^6`인데, npm은 루트 의존성의 peer를 루트의 `node_modules/typescript`(7)로 푼다. `@astrojs/check`를 `tools/astro-check` 워크스페이스의 의존성으로 옮기면 npm이 `tools/astro-check/node_modules/`에 `@astrojs/check`와 `typescript@6.0.3`을 함께 넣는다(언어 서버 아래에 6.0.3이 한 벌 더 깔려 24MB씩 두 벌이다).
- **`astro check` 명령은 쓸 수 없다.** 루트의 TypeScript가 7 이상이면 시작하자마자 거부한다(astro 7.4.11). `check` 스크립트는 같은 검사기의 실행 파일을 직접 부른다: `astro sync && tools/astro-check/node_modules/.bin/astro-check`.
- **oxlint**: Rust로 쓴 린터라 `typescript` 패키지가 필요 없다(ESLint + typescript-eslint + eslint-plugin-astro는 TypeScript 6 API로 파싱한다). `.oxlintrc.json`에서 `correctness` 범주만 `error`로 켰다. `.astro`에서는 펜스와 `<script>`만 본다.
- **누가 무엇을 보나**: `.ts`의 타입 → `tsc`(7)와 `check`. `.astro`의 타입 → `check`만. `.mjs`는 `checkJs`가 꺼져 있어 타입 검사가 없다 → `.mjs`에만 켠 oxlint의 `no-undef`가 오타 난 이름을 잡는다.

## Next.js 대응

| 예전 (`git show main:<경로>`)                                                                    | 지금                                                                                                     |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `package.json`의 `typescript@4.9.4`. 타입 검사 스크립트 없이 `next build`가 빌드 중에 검사       | `typescript@^7.0.2`, `npm run typecheck`, `npm run check`. `astro build`는 검사하지 않는다               |
| `tsconfig.json`의 `include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"]`                            | `extends: "astro/tsconfigs/strict"`, `include: [".astro/types.d.ts", "**/*"]`                            |
| `.tsx` 컴포넌트의 props를 `tsc`가 검사                                                           | `.astro`의 `interface Props`는 `@astrojs/check`만 검사                                                   |
| `.eslintrc.json`(`eslint:recommended`, `import`, `unicorn`, `next`, `prettier`), `eslint@8.10.0` | `.oxlintrc.json`(플러그인 `eslint`, `typescript`, `unicorn`, `oxc`, `import`, `promise`의 `correctness`) |
| `import/order`, `sort-imports`, `.stylelintrc.json`                                              | 옮기지 않았다. 코드 모양은 Prettier만 본다                                                               |
| `package.json`의 `lint-staged`: `eslint --cache --fix`, `stylelint`, `prettier`                  | `.lintstagedrc.json`: `oxlint`, `prettier`                                                               |

## 빌드 결과물에서 확인하기

타입 검사와 린트는 `dist/`를 바꾸지 않는다(`verify --static --no-check`의 7개 검사가 그대로 PASS). 설치 결과에서 확인한다.

- `npx tsc -v` → `Version 7.0.2`, `tools/astro-check/node_modules/.bin/tsc -v` → `Version 6.0.3`.
- `npm ls typescript` → 루트에 `typescript@7.0.2`, `astro-check-ts6` 아래에 `typescript@6.0.3`, exit 0.
- `node -e 'console.log(Object.keys(require("typescript")))'` → `[ 'version', 'versionMajorMinor' ]`.
- 시간(Apple M5, 7회 중앙값): `tsc --noEmit`이 TypeScript 7에서 **86ms**, 6에서 **521ms**(6배). `astro-check` **1,040ms**, `astro sync` 427ms, `oxlint` 55ms. 스크립트 전체는 `typecheck` 0.59초, `check` 1.55초, `lint` 0.13초다. 이 저장소에서 7이 버는 시간은 0.4초고, `typecheck`에서는 `astro sync`가 `tsc`보다 오래 걸린다.
- `npx oxlint --debug=files | wc -l` → 41(`.mjs` 26, `.astro` 11, `.ts` 4).

## 닫힌 고리가 잡아낸 것

- **scoped `overrides`로는 안 된다.** `"overrides": {"@astrojs/check": {"typescript": "6.0.3"}}` → TypeScript 6은 `node_modules/@astrojs/language-server/node_modules/`에 깔렸지만 루트에 놓인 `@astrojs/check`의 `require.resolve("typescript")`가 루트의 7을 집었다 → `The TypeScript module loaded (found 7.0.2) does not expose the programmatic API`. `npm ls`도 `invalid`.
- **별칭(`typescript-legacy`)도 안 된다.** 잠금 파일 없이 설치하면 `ERESOLVE`(peer `^5 || ^6` ↔ 루트 7)다. `astro-check`에는 다른 TypeScript를 가리키는 옵션이 없고 `@volar/kit`도 `require("typescript")`를 그대로 쓴다.
- **검증 장치의 check 단계가 깨진다.** `scripts/verify/run.mjs`가 `npx astro check`를 부른다 → `astro check does not currently support TypeScript 7.0` → `FAIL check 0/1`(나머지 7개는 PASS). `npm run -s check`를 부르게 고쳐야 한다. 이 단계가 고칠 수 없는 파일이라 이 커밋에서는 깨진 채로 남겼다(`npm run -s check`와 `verify --static --no-check`를 따로 돌리면 둘 다 통과).
- **잠금 파일을 지우고 다시 만들면** 버전은 같아도 `parse5`, `entities`, `undici` 등 관계없는 13개의 설치 위치가 바뀐다 → `npm uninstall @astrojs/check typescript` 뒤에 새 `package.json`으로 설치해서 검사 도구 쪽만 움직이게 했다.
- **`ignorePatterns: ["posts"]`가 `src/pages/posts/[id].astro`까지 뺐다.** `--debug=files`가 41 → 40 → `"/posts"`로 루트에 고정했다.
- **oxlint가 찾은 것**: `scripts/progress/watch.mjs`의 안 쓰는 `WAVE_LABELS`(삭제), `state.mjs`의 `...(x ?? {})`(`--fix`가 고침)와 버리는 구조 분해 변수(`_ts`, `_type`으로). `scripts/verify/lib/browser.mjs:371`의 `new Array(n)`(`unicorn/no-new-array`)도 같은 이유로 남아서, 이 커밋에서 `npm run lint`는 그 한 건으로 exit 1이다.

## 직접 해볼 실험

1. `src/pages/404.astro`의 `title: "404: …"`를 `title: 404`로 바꾸고 `npm run -s typecheck; echo $?`, 이어서 `npm run -s check; echo $?`.
   <details><summary>예상 결과</summary>`typecheck`는 0이다. `tsc`는 `.astro`를 읽지 않는다. `check`는 `src/pages/404.astro:10:5 - error ts(2322): Type 'number' is not assignable to type 'string'.`와 `1 error`를 내고 1이다.</details>
2. `scripts/notes-lint.mjs` 맨 끝에 `consol.log(SECTIONS.lenght);`를 붙이고 `npm run -s typecheck`, `npm run -s check`, `npx oxlint scripts/notes-lint.mjs`.
   <details><summary>예상 결과</summary>앞의 둘은 통과한다(`.mjs`는 타입 검사를 하지 않는다). oxlint만 `eslint(no-undef): 'consol' is not defined.`로 실패한다. `.lenght`는 아무도 못 잡는다. 타입이 있어야 보이는 오타다.</details>
3. `npx astro check; echo $?`. 그다음 `src/pages/404.astro`의 펜스에 `const unused = 1;`과 `debugger;`를 넣고 `npx oxlint src`와 `npm run -s check; echo $?`.
   <details><summary>예상 결과</summary>`astro check`는 `astro check does not currently support TypeScript 7.0`을 내고 1이다. oxlint는 `eslint(no-debugger)`만 낸다(`.astro`에서는 안 쓰는 변수를 보고하지 않는다). `check`는 `ts(6133): 'unused' is declared but its value is never read.`를 hint로만 보여 주고 0이다. `.astro` 펜스의 안 쓰는 변수는 어느 게이트도 막지 않는다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/typescript/ (`tsc`는 `.astro`를 무시, dev·build는 타입 검사 안 함, `include`의 `.astro/types.d.ts`, `Props`)
- https://oxc.rs/docs/guide/usage/linter.html , https://oxc.rs/docs/guide/usage/linter/config.html , https://oxc.rs/docs/guide/usage/linter/plugins.html , https://oxc.rs/docs/guide/usage/linter/ignore-files.html , https://oxc.rs/docs/guide/usage/linter/automatic-fixes.html
- https://github.com/withastro/astro/tree/main/packages/language-tools/ts-content-mapper (TypeScript 7.1+의 `contentMappers`로 `tsc`가 `.astro`를 직접 검사한다. 7.1은 아직 베타라 쓰지 않았다. 정식이 되면 `tools/astro-check`를 없앨 수 있다)
- 문서에 없어 소스에서 확인한 것: `astro check`의 TypeScript 7 거부(`node_modules/astro/dist/cli/check/index.js`), `@astrojs/check`가 자기 위치에서 `require.resolve("typescript")`를 하는 것(`dist/index.js`), oxlint가 `.astro`의 `<script>`뿐 아니라 펜스도 보는 것, `correctness`의 기본 심각도가 경고라 exit 0인 것.
