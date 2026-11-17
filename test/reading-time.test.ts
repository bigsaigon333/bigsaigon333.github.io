import { describe, expect, test } from "vitest";

import {
  CHARS_PER_MINUTE,
  readableCharacters,
  readingMinutes,
  withoutFencedCode,
} from "../src/lib/reading-time";

describe("withoutFencedCode", () => {
  test("``` 와 ~~~ 펜스 블록을 통째로 뺀다", () => {
    const md = ["가", "```js", "code", "```", "나", "~~~", "x", "~~~", "다"];
    expect(withoutFencedCode(md.join("\n"))).toBe("가\n나\n다");
  });

  test("닫는 펜스는 여는 것보다 짧을 수 없다", () => {
    const md = ["````", "```", "still code", "````", "글"].join("\n");
    expect(withoutFencedCode(md)).toBe("글");
  });

  test("닫히지 않은 펜스는 끝까지 코드다", () => {
    expect(withoutFencedCode("글\n```\ncode\nmore")).toBe("글");
  });
});

describe("readableCharacters", () => {
  test("공백이 아닌 글자를 코드 포인트로 센다", () => {
    expect(readableCharacters("가 나\t다\n라")).toBe(4);
    expect(readableCharacters("😀😀")).toBe(2);
  });

  test("링크·이미지의 주소, 맨 URL, 태그, 주석, Markdown 기호는 세지 않는다", () => {
    const md =
      "# 제목\n[링크](https://a.b/c) ![대체](x.png) https://x.y/z <b>굵게</b> <!-- 주석 --> **강조** `코드`";
    // 제목 링크 대체 굵게 강조 코드
    expect(readableCharacters(md)).toBe(2 + 2 + 2 + 2 + 2 + 2);
  });
});

describe("readingMinutes", () => {
  test("최소 1분", () => {
    expect(readingMinutes("")).toBe(1);
  });

  test(`${CHARS_PER_MINUTE}자당 1분, 반올림`, () => {
    expect(readingMinutes("가".repeat(CHARS_PER_MINUTE * 3))).toBe(3);
    expect(readingMinutes("가".repeat(CHARS_PER_MINUTE * 2.4))).toBe(2);
    expect(readingMinutes("가".repeat(CHARS_PER_MINUTE * 2.5))).toBe(3);
  });

  test("코드 블록은 시간에 들지 않는다", () => {
    const code = "x".repeat(CHARS_PER_MINUTE * 10);
    expect(readingMinutes(`글\n\`\`\`\n${code}\n\`\`\``)).toBe(1);
  });
});
