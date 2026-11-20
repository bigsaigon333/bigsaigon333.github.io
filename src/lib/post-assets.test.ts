import katex from "katex";
import { describe, expect, it } from "vitest";

import { postAssets } from "./post-assets";

describe("postAssets", () => {
  it("KaTeX 가 그린 수식(인라인, 블록)이 있으면 math", () => {
    expect(postAssets(`<p>${katex.renderToString("x")}</p>`).math).toBe(true);
    expect(
      postAssets(katex.renderToString("x", { displayMode: true })).math,
    ).toBe(true);
  });

  it("글자로만 나온 $, 백틱, 인라인 <code>, 이스케이프된 마크업은 math 가 아니다", () => {
    expect(
      postAssets(
        "<p>가격은 $5 이고 `x` 는 <code>inline</code> 이다. class=&quot;katex&quot; 라는 글자</p>",
      ),
    ).toEqual({ math: false });
  });

  it("렌더된 HTML 이 없으면 math 로 본다", () => {
    expect(postAssets(undefined)).toEqual({ math: true });
  });
});
