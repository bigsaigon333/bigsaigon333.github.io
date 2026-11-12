# 문서 요약: scripts-deploy

> 문서 스카우트가 공식 문서를 읽고 요약한 것이다. 요약과 실제 동작이 다르면 실제 동작을 따르고 학습 노트에 적는다.

## Astro 스크립트 & GitHub Pages 배포 (문서 기준)

**Q1. 처리되는 `<script>` vs `is:inline`**
- 속성이 `src` 외에 없을 때만 처리됨. 처리 시: TypeScript, `import` 번들링, `type="module"` 자동 부여, 컴포넌트 중복 사용 시 페이지당 1회 포함(dedup), 작으면 HTML에 인라인.
- 속성이 `src` 외에 하나라도 있으면 `is:inline`이 암묵 적용됨. `is:inline`은 작성한 그대로 출력되고, 번들/dedup/import 해석 없음, `defer` 등 로딩 속성 무효, 컴포넌트에 쓰면 인스턴스마다 복제됨.
- HTML 내 최종 위치: 문서에 없음 (작성 위치 그대로라는 설명은 `is:inline`에만 있음).

**Q2. 외부/인라인 스크립트 (gtag 등)**
- 외부: `<script is:inline src="https://my-analytics.com/script.js"></script>` (`public/` 파일은 `src="/my-script.js"`)
- 인라인 스니펫도 `<script is:inline>...</script>`로 작성. gtag 전용 예시는 문서에 없음.

**Q3. 서버 값 전달**
- `define:vars={{ message }}`: JSON 직렬화 가능한 값. `<script>`에 쓰면 `is:inline` 암묵 적용, 컴포넌트 인스턴스마다 재실행됨. `<style>`에는 is:inline을 강제하지 않음.
- 대안(문서 권장): `data-*` 속성 — `<astro-greet data-message={message}>` 후 `this.dataset.message`로 읽기.

**Q4. 위젯 전용 속성 (`<script src=... repo=... async>`)**
- 문서상 `is:inline` 스크립트는 "exactly as written"으로 출력되므로 커스텀 속성은 처리 대상이 아님. 속성 보존을 명시한 문장은 문서에 없음 (확인 불가). `async`/`defer`는 번들 파일이 아니라 효과가 없다고 명시됨.

**Q5. `<ClientRouter />`** (view-transitions 가이드 요약 기반)
- 번들된 module 스크립트는 한 번만 실행되고 이후 페이지에서 재실행되지 않음. `is:inline` 스크립트는 재방문 시 다시 실행될 수 있음.
- 매 전환마다 재실행: `<script is:inline data-astro-rerun>`. 초기 로드와 매 네비게이션에서 `document.addEventListener("astro:page-load", () => {...})`.

**Q6. GitHub Pages 워크플로**
```yaml
name: Deploy to GitHub Pages
on: { push: { branches: [main] }, workflow_dispatch: {} }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: withastro/action@v6
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```
- `<user>.github.io` 저장소: `site: 'https://<username>.github.io'`, `base` 생략 (문서 원문: 저장소명이 `<username>.github.io` 패턴이면 base 불필요).
- 저장소 설정: Settings > Pages > Source = **GitHub Actions**.
- 주의: lockfile(`pnpm-lock.yaml` 등) 커밋 필수.

**Q7. withastro/action 입력** (README 기준)
- `path`(기본: 저장소 루트), `node-version`(기본 `24`), `package-manager`(기본: lockfile 자동 감지, 값 `npm|yarn|pnpm|bun|deno`, 버전 태그 허용), `build-cmd`(기본 `<pm> run build`), `cache`(기본 `true`), `cache-dir`(기본 `node_modules/.astro`), `out-dir`(기본 `dist`).
- `.nojekyll` 추가 / `404.html` 처리: 문서에 없음.

**Q8. PR 전용 빌드 잡**: 문서에 없음. 별도 워크플로에서 `on: pull_request`로 `withastro/action@v6`만 실행하고 `actions/deploy-pages` 단계는 제외하는 방식이 가능하나 문서 검증 안 됨.

**플래그**: 문서상 experimental/deprecated 표시 없음. `build.format` 관련 언급 없음. v6/v7 변경점은 이 페이지들에서 확인되지 않음 (v7 업그레이드 가이드는 미확인).

## 읽은 문서

- https://docs.astro.build/en/guides/client-side-scripts/
- https://docs.astro.build/en/guides/deploy/github/
- https://github.com/withastro/action
- https://docs.astro.build/en/reference/directives-reference/
- https://docs.astro.build/en/guides/view-transitions/

## 확인하지 못한 것

- Q1: 처리된 script 태그가 최종 HTML의 어디에 놓이는지 (문서에 없음)
- Q2: gtag 전용 공식 스니펫 (문서에 없음)
- Q4: is:inline 스크립트에서 커스텀 속성(repo, async 등) 보존을 명시한 문장 (문서에 없음, 확인 불가)
- Q5: data-astro-rerun의 'added in astro@4.5.0' 및 astro:page-load 세부 문장은 view-transitions 페이지 후반부 요약 기반이라 원문 대조 안 됨
- Q7: .nojekyll 추가 및 404.html 처리 (문서에 없음)
- Q8: PR 전용 빌드 잡 공식 예시 (문서에 없음, 제안 방식은 미검증)
- v6/v7 변경점: upgrade-to/v7 및 v6 가이드 미확인, deploy 가이드는 v6/v7 변경을 명시하지 않음
- withastro/action README 예시 YAML과 deploy 가이드 YAML은 주석 줄 차이가 있음 (기능 차이 없음으로 판단, 미검증)
