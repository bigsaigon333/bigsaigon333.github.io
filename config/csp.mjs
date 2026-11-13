// Content Security Policy(S7.2). astro.config.mjs 가 integrations 끝에 이 통합을 넣는다.
//
// GitHub Pages 는 응답 헤더를 정할 수 없어서 정책은 <meta http-equiv="content-security-policy"> 로만 실린다.
// Astro 의 security.csp 가 그 meta 를 만들고, 자기가 묶은 스크립트·스타일의 sha256 을 script-src·style-src 에 넣는다.
// is:inline 스크립트(테마, GA 설정)는 Astro 가 모르므로 그 컴포넌트가 inlineScript() 로 해시를 더한다.
//
// 이 통합이 더하는 것 세 가지:
// 1. 정책: 허용하는 것은 이 사이트의 파일('self'), GA(googletagmanager, google-analytics), utterances(스크립트와 iframe).
//    script-src 에 'unsafe-inline' 은 없다. 스타일은 요소(<style>)는 해시로 막고, 속성(style="…")만 'unsafe-inline' 이다.
//    Shiki 가 코드 블록의 모든 <span> 에 style="--shiki-light:…" 를 쓰고, 속성은 해시로 허용할 수 없기 때문이다.
// 2. vite.build.assetsInlineLimit = 0: 스크립트·CSS·글꼴을 HTML 이나 CSS 에 끼우지 않고 파일로 낸다.
//    - 작은 모듈 스크립트를 HTML 에 끼우면 <ClientRouter /> 가 페이지를 바꿀 때 그 뒤에
//      <script type="module" src="data:application/javascript,"> 를 넣는다(실행 순서를 기다리는 장치). data: 를
//      script-src 에 넣지 않으면 위반, 넣으면 아무 data: 스크립트나 돈다.
//    - 페이지마다 다른 CSS 를 끼우면 페이지마다 해시가 달라 정책이 달라진다. 라우터는 첫 페이지의 정책을 그대로 두고
//      새 페이지의 meta 를 더한다(meta 정책은 지울 수 없다). 그러면 새 페이지의 <style> 이 첫 정책에 막힌다.
//    - KaTeX 의 작은 글꼴이 data: URL 로 CSS 에 들어가면 font-src 'self' 에 막힌다.
// 3. 빌드 뒤(astro:build:done) meta 를 <meta charset> 바로 뒤로 옮긴다. Astro 는 </head> 앞에 두는데, meta 정책은
//    그 뒤에 나오는 것만 덮는다. 테마 스크립트, GA 로더가 정책 밖에서 돌게 된다. 그리고 모든 페이지의 정책이 같은지
//    확인해 다르면 빌드를 멈춘다(위 2의 이유).
//
// meta 로는 할 수 없는 것: frame-ancestors(다른 사이트가 이 페이지를 iframe 에 넣는 것 막기), report-uri·report-to
// (위반 보고), sandbox. 이 지시어들은 헤더로만 효력이 있다. Report-Only 도 헤더뿐이다.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GA_SCRIPT = "https://*.googletagmanager.com";
const GA_CONNECT = [
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
  "https://*.googletagmanager.com",
];
const GA_IMG = [
  "https://*.google-analytics.com",
  "https://*.googletagmanager.com",
];
const UTTERANCES = "https://utteranc.es";

// utteranc.es/client.js 가 <head> 맨 앞에 넣는 <style> 의 내용(2026-11-13 의 client.js 에서 옮겼다).
// utterances 가 이 글자를 바꾸면 그 스타일이 막혀 댓글 iframe 의 크기가 무너진다. csp 검사가 stub 으로 같은 글자를 넣어 본다.
export const UTTERANCES_STYLE =
  "\n    .utterances {\n      position: relative;\n      box-sizing: border-box;\n      width: 100%;\n      max-width: 760px;\n      margin-left: auto;\n      margin-right: auto;\n    }\n    .utterances-frame {\n      color-scheme: light;\n      position: absolute;\n      left: 0;\n      right: 0;\n      width: 1px;\n      min-width: 100%;\n      max-width: 100%;\n      height: 100%;\n      border: 0;\n    }\n  ";

const sha256 = (text) =>
  `sha256-${createHash("sha256").update(text, "utf8").digest("base64")}`;

/** astro.config 의 security.csp 값. */
export const policy = {
  algorithm: "SHA-256",
  directives: [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'none'",
    `img-src 'self' ${GA_IMG.join(" ")}`,
    `connect-src 'self' ${GA_CONNECT.join(" ")}`,
    `frame-src ${UTTERANCES}`,
  ],
  scriptDirective: { resources: ["'self'", GA_SCRIPT, UTTERANCES] },
  styleDirective: {
    resources: ["'self'", { resource: "'unsafe-inline'", kind: "attribute" }],
    hashes: [sha256(UTTERANCES_STYLE)],
  },
};

/**
 * is:inline 스크립트의 본문을 정책에 넣고 그대로 돌려준다. `<script is:inline set:html={inlineScript(Astro, code)} />`.
 * 해시는 브라우저가 보는 글자 그대로(set:html 은 고치지 않는다)의 sha256 이다.
 * @param {Pick<import("astro").AstroGlobal, "csp">} astro
 * @param {string} code
 */
export function inlineScript(astro, code) {
  astro.csp?.insertScriptHash(sha256(code));
  return code;
}

const META =
  /<meta http-equiv="content-security-policy" content="[^"]*"\s*\/?>/g;
const CHARSET = /<meta charset="utf-8"\s*\/?>/i;

/** dist 의 모든 .html: 정책 meta 를 하나 찾아 <meta charset> 바로 뒤로 옮긴다. → 정책 글자 → 페이지들 */
function hoistPolicies(dir) {
  const policies = new Map();
  const files = fs
    .readdirSync(dir, { recursive: true })
    .filter((rel) => rel.endsWith(".html"));
  for (const rel of files) {
    const file = path.join(dir, rel);
    const html = fs.readFileSync(file, "utf8");
    const metas = html.match(META) ?? [];
    if (metas.length !== 1 || !CHARSET.test(html))
      throw new Error(
        `${rel}: ${metas.length} CSP <meta>, <meta charset> ${CHARSET.test(html) ? "있음" : "없음"}`,
      );
    const [meta] = metas;
    const moved = html
      .replace(meta, "")
      .replace(CHARSET, (charset) => charset + meta);
    fs.writeFileSync(file, moved);
    const pages = policies.get(meta) ?? [];
    pages.push(rel);
    policies.set(meta, pages);
  }
  return policies;
}

/** @returns {import("astro").AstroIntegration} */
export default function csp() {
  return {
    name: "csp",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({
          security: { csp: policy },
          vite: { build: { assetsInlineLimit: 0 } },
        });
      },
      "astro:build:done": ({ dir, logger }) => {
        const policies = hoistPolicies(fileURLToPath(dir));
        if (policies.size !== 1)
          throw new Error(
            `페이지마다 CSP 가 다르다(${policies.size}가지): ${[
              ...policies.values(),
            ]
              .map((pages) => pages[0])
              .join(
                ", ",
              )}. <ClientRouter /> 는 첫 페이지의 정책을 그대로 둔다.`,
          );
        const [pages] = policies.values();
        logger.info(
          `CSP <meta> 를 <head> 맨 앞으로 옮겼다: ${pages.length}쪽, 정책 1가지`,
        );
      },
    },
  };
}
