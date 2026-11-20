import { describe, expect, test } from "vitest";

import { measureLazy } from "./site-guard.mjs";

const files = [
  "pagefind/pagefind.js",
  "pagefind/wasm.unknown.pagefind",
  "index.html",
];
const sizes = {
  "pagefind/pagefind.js": 600,
  "pagefind/wasm.unknown.pagefind": 400,
  "index.html": 5000,
};
const sizeOf = (file) => sizes[file];

describe("measureLazy", () => {
  test("고른 파일만 더하고, 예산 안이면 문제가 없다", () => {
    expect(
      measureLazy(
        { name: "검색", include: /^pagefind\//, bytes: 1000 },
        files,
        sizeOf,
      ),
    ).toEqual({ bytes: 1000, files: 2, problem: null });
  });

  test("예산을 넘으면 그 바이트를 말한다", () => {
    const { problem } = measureLazy(
      { name: "검색", include: /^pagefind\//, bytes: 999 },
      files,
      sizeOf,
    );
    expect(problem).toBe("검색: 1000바이트 > 예산 999바이트 (파일 2개)");
  });

  test("고른 파일이 없으면 실패다(빈 묶음을 재고 통과하지 않는다)", () => {
    const { problem } = measureLazy(
      { name: "검색", include: /^nothing\//, bytes: 1000 },
      files,
      sizeOf,
    );
    expect(problem).toMatch(/맞는 파일이 없다/);
  });
});
