import { describe, expect, test } from "vitest";

import { EXCERPT_LENGTH, excerpt, plainText } from "./excerpt";

describe("plainText", () => {
  test("제목·구분선·표·HTML 블록·코드 블록은 빼고 문단을 공백 하나로 잇는다", () => {
    const md = [
      "## 제목",
      "",
      "첫 문단",
      "둘째 줄",
      "",
      "---",
      "",
      "| a | b |",
      "| - | - |",
      "",
      "<details><summary>x</summary></details>",
      "",
      "```js",
      "const a = 1;",
      "```",
      "",
      "끝 문단",
    ].join("\n");
    expect(plainText(md)).toBe("첫 문단 둘째 줄 끝 문단");
  });

  test("링크는 글만, 이미지·주소·태그·강조 기호는 지우고 단어 안의 하이픈은 남긴다", () => {
    const md =
      "[css-masters-2](https://github.com/x) 라는 **스터디** ![](a.png) `코드` <https://a.b/c> https://x.y <b>굵게</b>";
    expect(plainText(md)).toBe("css-masters-2 라는 스터디 코드 굵게");
  });

  test("인용과 목록 기호를 지운다", () => {
    expect(plainText("> 인용\n\n- 하나\n- 둘\n\n1. 셋")).toBe(
      "인용 하나 둘 셋",
    );
  });
});

describe("excerpt", () => {
  test("짧으면 그대로", () => {
    expect(excerpt("짧은 글")).toBe("짧은 글");
  });

  test("길면 한도 안의 마지막 공백에서 자르고 … 를 붙인다", () => {
    const md = Array.from({ length: 60 }, (_, i) => `단어${i}`).join(" ");
    const result = excerpt(md);
    expect(result.endsWith("…")).toBe(true);
    expect([...result].length).toBeLessThanOrEqual(EXCERPT_LENGTH + 1);
    expect(md.startsWith(result.slice(0, -1))).toBe(true);
    expect(md[result.length - 1]).toBe(" ");
  });

  test("읽을 글이 없으면 빈 문자열", () => {
    expect(excerpt("## 제목만\n\n```\ncode\n```")).toBe("");
  });
});
