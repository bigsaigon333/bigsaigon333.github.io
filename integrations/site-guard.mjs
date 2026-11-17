// site-guard — astro:build:done 에서 dist 를 훑어 두 가지를 지킨다. 어기면 빌드를 실패시킨다.
//
//   1. 링크: 모든 HTML 페이지의 내부 href·src·srcset(그리고 사이트 주소로 시작하는 절대 URL)이 dist 의 파일로
//      풀린다. 푸는 방식은 GitHub Pages 와 같다: `/p/` → p/index.html, `/p` → p(파일), p.html, p/index.html.
//   2. JS 예산: 페이지마다 실리는 JS 바이트가 options.jsBudget 이하다. 센 것: 인라인 <script>(JSON 데이터 제외),
//      내부 script[src]·modulepreload 파일, 그 파일들이 정적으로 import 하는 내부 파일(전이적으로, 파일당 한 번).
//      다른 출처의 스크립트(gtag, utterances)는 바이트를 모르므로 세지 않는다. 압축 전 바이트다.
//
// HTML 은 파서 없이 읽는다: <script>·<style>·주석의 본문을 지운 뒤 태그(`<x …>`) 안의 속성만 본다. 본문의 글자는
// `&lt;` 로 이스케이프되어 있으므로 코드 블록 속의 `<a href>` 는 태그로 잡히지 않는다.
// 실패는 logger.error 로 위반을 하나씩 적고, 요약 한 줄을 담은 Error 를 던진다(던지면 astro build 가 0 이 아닌 코드로 끝난다).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA_TYPES = new Set(["application/json", "application/ld+json"]);
const URL_ATTRS = new Set(["href", "src", "srcset", "poster", "content"]);
const TAG =
  /<([a-zA-Z][\w-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>]+))?)*)\s*\/?>/g;
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/g;
const RAW_BODY =
  /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>|<!--[\s\S]*?-->/gi;
const IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"']+?\.m?js)["']/g;

const decode = (value) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function walk(dir, base = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

/** dist 의 HTML 파일 경로 → 그 페이지의 URL 경로(build.format 이 file 이든 directory 든). */
function pageUrl(file) {
  if (file === "index.html") return "/";
  if (file.endsWith("/index.html"))
    return `/${file.slice(0, -"index.html".length)}`;
  return `/${file.replace(/\.html$/, "")}`;
}

/** GitHub Pages 처럼 URL 경로를 dist 의 파일로 푼다. 없으면 null. */
function resolveFile(files, pathname) {
  const p = pathname.replace(/^\/+/, "");
  const candidates =
    p === "" || p.endsWith("/")
      ? [`${p}index.html`]
      : [p, `${p}.html`, `${p}/index.html`];
  return candidates.find((c) => files.has(c)) ?? null;
}

/** HTML 한 장 → { refs: [{ tag, attr, value }], scripts: { inline: string[], src: string[] } } */
function scan(html) {
  const inline = [];
  const stripped = html.replace(RAW_BODY, (match, tag, attrs, body) => {
    if (!tag) return "";
    if (tag.toLowerCase() === "script" && !/\ssrc\s*=/.test(attrs)) {
      const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] ?? "";
      if (!DATA_TYPES.has(type.toLowerCase())) inline.push(body);
    }
    return `<${tag}${attrs}>`;
  });

  const refs = [];
  const src = [];
  for (const [, tagName, attrText] of stripped.matchAll(TAG)) {
    const tag = tagName.toLowerCase();
    const attrs = {};
    for (const [, name, dq, sq, bare] of attrText.matchAll(ATTR))
      attrs[name.toLowerCase()] = decode(dq ?? sq ?? bare ?? "");
    for (const [attr, value] of Object.entries(attrs)) {
      if (!URL_ATTRS.has(attr)) continue;
      const values =
        attr === "srcset"
          ? value.split(",").map((part) => part.trim().split(/\s+/)[0])
          : [value];
      for (const v of values) if (v) refs.push({ tag, attr, value: v });
    }
    if (tag === "script" && attrs.src) src.push(attrs.src);
    if (
      tag === "link" &&
      /\bmodulepreload\b/.test(attrs.rel ?? "") &&
      attrs.href
    )
      src.push(attrs.href);
  }
  return { refs, scripts: { inline, src } };
}

/**
 * @param {{ jsBudget?: number }} [options] jsBudget: 페이지당 JS 바이트 상한(압축 전). 없으면 예산 검사를 하지 않는다.
 * @returns {import("astro").AstroIntegration}
 */
export default function siteGuard(options = {}) {
  const { jsBudget } = options;
  let site;
  let base = "/";

  return {
    name: "site-guard",
    hooks: {
      "astro:config:done": ({ config }) => {
        site = config.site ? new URL(config.site).origin : undefined;
        base = config.base.endsWith("/") ? config.base : `${config.base}/`;
      },
      "astro:build:done": ({ dir, logger }) => {
        const started = performance.now();
        const root = fileURLToPath(dir);
        const files = new Set(walk(root));
        const jsSize = new Map();

        /** 참조 → dist 기준 URL 경로. 내부가 아니면(다른 출처, mailto:, #…) null. */
        const internal = (value, from, attr) => {
          if (attr === "content" && !(site && value.startsWith(`${site}/`)))
            return null;
          if (/^(#|data:|javascript:)/i.test(value)) return null;
          let url;
          try {
            url = new URL(value, `http://site.invalid${from}`);
          } catch {
            return null;
          }
          const sameSite =
            url.origin === "http://site.invalid" || url.origin === site;
          if (!sameSite || !/^https?:$/.test(url.protocol)) return null;
          let pathname;
          try {
            pathname = decodeURIComponent(url.pathname);
          } catch {
            pathname = url.pathname;
          }
          if (!pathname.startsWith(base)) return pathname; // base 밖: 그대로 두어 풀리지 않게 한다
          return `/${pathname.slice(base.length)}`;
        };

        /** JS 파일 하나와 그것이 정적으로 import 하는 내부 파일들(전이적). */
        const jsClosure = (file, seen) => {
          if (seen.has(file) || !files.has(file)) return;
          seen.add(file);
          const text = fs.readFileSync(path.join(root, file), "utf8");
          jsSize.set(file, Buffer.byteLength(text));
          for (const [, spec] of text.matchAll(IMPORT))
            jsClosure(path.posix.join(path.posix.dirname(file), spec), seen);
        };

        const broken = [];
        const heavy = [];
        let refCount = 0;
        const pages = [...files].filter((f) => f.endsWith(".html")).sort();
        for (const file of pages) {
          const from = pageUrl(file);
          const { refs, scripts } = scan(
            fs.readFileSync(path.join(root, file), "utf8"),
          );
          for (const { tag, attr, value } of refs) {
            const target = internal(value, from, attr);
            if (target === null) continue;
            refCount++;
            if (resolveFile(files, target) === null)
              broken.push(
                `${from}: <${tag} ${attr}="${value}"> → ${target} 에 해당하는 파일이 없다`,
              );
          }

          if (jsBudget === undefined) continue;
          let bytes = 0;
          for (const text of scripts.inline) bytes += Buffer.byteLength(text);
          const seen = new Set();
          for (const value of scripts.src) {
            const target = internal(value, from, "src");
            const resolved = target && resolveFile(files, target);
            if (resolved) jsClosure(resolved, seen);
          }
          for (const f of seen) bytes += jsSize.get(f);
          if (bytes > jsBudget)
            heavy.push(
              `${from}: JS ${bytes}바이트 > 예산 ${jsBudget}바이트 (파일 ${seen.size}개 + 인라인 ${scripts.inline.length}개)`,
            );
        }

        const ms = Math.round(performance.now() - started);
        for (const line of broken) logger.error(`깨진 링크 ${line}`);
        for (const line of heavy) logger.error(`JS 예산 초과 ${line}`);
        if (broken.length || heavy.length) {
          throw new Error(
            `site-guard: 깨진 링크 ${broken.length}개, JS 예산 초과 ${heavy.length}페이지. 위의 [site-guard] 줄을 보라.`,
          );
        }
        logger.info(
          `페이지 ${pages.length}장, 내부 참조 ${refCount}개 모두 풀림` +
            (jsBudget === undefined
              ? ""
              : `, 페이지당 JS ≤ ${jsBudget}바이트`) +
            ` (${ms}ms)`,
        );
      },
    },
  };
}
