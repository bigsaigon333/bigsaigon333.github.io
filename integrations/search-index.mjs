// search-index — astro:build:done 에서 Pagefind 로 사이트 내 검색 색인을 만들어 dist/pagefind/ 에 쓴다.
// `npm run build` 가 곧 색인까지 만들므로 CI 와 배포에 따로 할 일이 없다.
//
// 무엇을 색인하나: data-pagefind-body 가 붙은 요소의 글자만. 글 페이지의 <main class="prose">(본문)만 그 속성을 가지므로
// 목차, 시리즈 이동, 뒤로 가기 링크, 복사 버튼(브라우저에서 만들어져 빌드 HTML 에 없다), 헤더·푸터는 들어가지 않는다.
// 그 속성이 없는 페이지(홈, 태그, 카테고리, 404, /search)는 Pagefind 에 넘기지도 않는다.
// 제목·날짜·카테고리(meta)와 카테고리·태그(filter)는 Seo.astro 의 article:* <meta> 에 붙인 data-pagefind-* 가 정한다.
//
// 주소: build.format "file" 이라 글은 dist/posts/<id>.html 이지만 사이트의 주소는 /posts/<id> 다(trailingSlash never).
// 파일 경로로 넘기면 Pagefind 가 ".html" 을 붙인 주소를 내므로, 주소를 직접 넘긴다(pageUrl).
//
// 쓰는 파일: Pagefind 가 내는 것 중 검색 페이지가 JS API 로 읽는 것만(KEEP). 기본 UI(pagefind-ui.*, modular·component UI),
// 강조 스크립트, 워커(검색 페이지는 noWorker 로 메인 스레드에서 돌린다. config/csp.mjs 의 WASM)는 쓰지 않는다.
// 색인이 비거나 Pagefind 가 오류를 내면 빌드를 멈춘다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 색인 파일을 쓰는 dist 안의 디렉터리. 검색 페이지가 이 경로의 pagefind.js 를 import 한다. */
export const OUTPUT_DIR = "pagefind";

const BODY = /\sdata-pagefind-body(?=[\s>=])/;

/**
 * Pagefind 가 내는 파일 중 검색 페이지가 읽는 것인가. 경로는 OUTPUT_DIR 안의 상대 경로("pagefind.js", "index/ko_…").
 * @param {string} rel
 */
export function keepFile(rel) {
  return (
    rel === "pagefind.js" ||
    rel === "pagefind-entry.json" ||
    /^wasm\.[\w-]+\.pagefind$/.test(rel) ||
    /^pagefind\.[\w-]+\.pf_meta$/.test(rel) ||
    /^(index|fragment|filter)\/[\w-]+\.pf_(index|fragment|filter)$/.test(rel)
  );
}

/**
 * dist 안의 HTML 파일 → 사이트의 주소(site-guard 와 같은 규칙). "posts/a.html" → "/posts/a", "index.html" → "/".
 * @param {string} rel
 */
export function pageUrl(rel) {
  const posix = rel.split(path.sep).join("/");
  if (posix === "index.html") return "/";
  if (posix.endsWith("/index.html"))
    return `/${posix.slice(0, -"index.html".length)}`;
  return `/${posix.replace(/\.html$/, "")}`;
}

/** 색인할 페이지인가: 본문을 data-pagefind-body 로 표시했다. @param {string} html */
export const hasBody = (html) => BODY.test(html);

/** @returns {import("astro").AstroIntegration} */
export default function searchIndex() {
  return {
    name: "search-index",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const started = performance.now();
        const root = fileURLToPath(dir);
        // 무거운 바이너리 래퍼라 빌드할 때만 불러온다(astro dev·check 에는 필요 없다).
        const pagefind = await import("pagefind");
        const out = path.join(root, OUTPUT_DIR);
        fs.rmSync(out, { recursive: true, force: true });

        const { index, errors } = await pagefind.createIndex({});
        try {
          if (!index) throw new Error(`Pagefind: ${errors.join("; ")}`);
          const pages = fs
            .readdirSync(root, { recursive: true })
            .filter((rel) => rel.endsWith(".html"))
            .sort();
          let indexed = 0;
          for (const rel of pages) {
            const content = fs.readFileSync(path.join(root, rel), "utf8");
            if (!hasBody(content)) continue;
            const added = await index.addHTMLFile({
              url: pageUrl(rel),
              content,
            });
            if (added.errors.length)
              throw new Error(`Pagefind: ${rel}: ${added.errors.join("; ")}`);
            indexed++;
          }
          if (indexed === 0)
            throw new Error(
              "search-index: data-pagefind-body 가 있는 페이지가 없다",
            );

          const { files, errors: fileErrors } = await index.getFiles();
          if (fileErrors.length)
            throw new Error(`Pagefind: ${fileErrors.join("; ")}`);
          let bytes = 0;
          let written = 0;
          for (const file of files) {
            if (!keepFile(file.path)) continue;
            const target = path.join(out, file.path);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, file.content);
            bytes += file.content.length;
            written++;
          }
          if (!files.some((file) => file.path === "pagefind.js"))
            throw new Error(
              "search-index: Pagefind 가 pagefind.js 를 내지 않았다",
            );
          logger.info(
            `글 ${indexed}쪽을 색인했다: ${OUTPUT_DIR}/ 파일 ${written}개, ${bytes}바이트 (${Math.round(performance.now() - started)}ms)`,
          );
        } finally {
          await pagefind.close();
        }
      },
    },
  };
}
