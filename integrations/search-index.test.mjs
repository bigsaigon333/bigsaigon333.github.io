import { describe, expect, test } from "vitest";

import { hasBody, keepFile, pageUrl } from "./search-index.mjs";

describe("pageUrl", () => {
  test.each([
    ["index.html", "/"],
    ["posts/a.html", "/posts/a"],
    ["tags/index.html", "/tags/"],
    ["search.html", "/search"],
  ])("%j → %j", (rel, url) => {
    expect(pageUrl(rel)).toBe(url);
  });
});

describe("hasBody", () => {
  test("data-pagefind-body 속성이 있는 페이지만", () => {
    expect(hasBody('<main class="prose" data-pagefind-body>')).toBe(true);
    expect(hasBody('<main data-pagefind-body="">')).toBe(true);
    expect(hasBody("<main data-pagefind-body-x>")).toBe(false);
    expect(hasBody("<p>data-pagefind-body 를 쓴다</p>")).toBe(false);
    expect(hasBody("<main>")).toBe(false);
  });
});

describe("keepFile", () => {
  test.each([
    "pagefind.js",
    "pagefind-entry.json",
    "wasm.unknown.pagefind",
    "wasm.en.pagefind",
    "pagefind.ko_b8c770461f.pf_meta",
    "index/ko_2b36637.pf_index",
    "fragment/ko_1815b79.pf_fragment",
    "filter/ko_e893857.pf_filter",
  ])("JS API 가 읽는 %j 는 쓴다", (rel) => {
    expect(keepFile(rel)).toBe(true);
  });

  test.each([
    "pagefind-ui.js",
    "pagefind-ui.css",
    "pagefind-modular-ui.js",
    "pagefind-component-ui.js",
    "pagefind-highlight.js",
    "pagefind-worker.js",
    "playground/index.html",
  ])("기본 UI·워커 %j 는 쓰지 않는다", (rel) => {
    expect(keepFile(rel)).toBe(false);
  });
});
