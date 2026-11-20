import { describe, expect, test } from "vitest";

import {
  decodeEntities,
  excerptParts,
  isSearchPath,
  readQuery,
  resultDate,
  statusText,
  withQuery,
} from "./search";

describe("isSearchPath", () => {
  test.each([
    ["/search", true],
    ["/search.html", true],
    ["/search/", false],
    ["/searching", false],
    ["/", false],
  ])("%j → %j", (pathname, expected) => {
    expect(isSearchPath(pathname)).toBe(expected);
  });
});

describe("readQuery", () => {
  test("?q= 의 값을 디코드하고 앞뒤 공백을 뗀다", () => {
    expect(readQuery("?q=%EB%AA%85%EC%A0%9C")).toBe("명제");
    expect(readQuery("?q=+%EB%82%B4%EC%9E%A5+%EA%B0%9D%EC%B2%B4+")).toBe(
      "내장 객체",
    );
  });

  test("없거나 비면 빈 문자열", () => {
    expect(readQuery("")).toBe("");
    expect(readQuery("?x=1")).toBe("");
    expect(readQuery("?q=")).toBe("");
  });
});

describe("withQuery", () => {
  test("검색어를 넣고 경로·다른 매개변수·해시는 그대로 둔다", () => {
    expect(withQuery("https://example.com/search?x=1#top", "명제")).toBe(
      "/search?x=1&q=%EB%AA%85%EC%A0%9C#top",
    );
  });

  test("이미 있던 검색어를 바꾼다", () => {
    expect(withQuery("https://example.com/search?q=a", " b c ")).toBe(
      "/search?q=b+c",
    );
  });

  test("빈 검색어는 매개변수째로 뺀다", () => {
    expect(withQuery("https://example.com/search?q=a", "  ")).toBe("/search");
  });

  test("readQuery 와 짝이 맞는다", () => {
    const query = "Array<T> & 내장 객체";
    const url = new URL(
      withQuery("https://example.com/search", query),
      "https://example.com",
    );
    expect(readQuery(url.search)).toBe(query);
  });
});

describe("decodeEntities", () => {
  test.each([
    ["type Equal1&lt;A, B&gt;", "type Equal1<A, B>"],
    ["&quot;a&quot; &amp; &#39;b&#39;", "\"a\" & 'b'"],
    ["&#x1F600;", "😀"],
    ["&unknown; &#0;", "&unknown; &#0;"],
  ])("%j → %j", (text, expected) => {
    expect(decodeEntities(text)).toBe(expected);
  });
});

describe("excerptParts", () => {
  test("<mark> 를 표시 조각으로, 나머지는 글자로 나눈다", () => {
    expect(
      excerptParts(
        "<mark>정규표현식에</mark> 일치하는지 <mark>정규표현식</mark>",
      ),
    ).toEqual([
      { text: "정규표현식에", mark: true },
      { text: " 일치하는지 ", mark: false },
      { text: "정규표현식", mark: true },
    ]);
  });

  test("이스케이프된 글자는 풀고, <mark> 가 아닌 태그 모양은 글자로 남는다", () => {
    expect(
      excerptParts(
        "&lt;img src=x onerror=alert(1)&gt; <b>굵게</b> <mark>a</mark>",
      ),
    ).toEqual([
      { text: "<img src=x onerror=alert(1)> <b>굵게</b> ", mark: false },
      { text: "a", mark: true },
    ]);
  });

  test("빈 조각은 내지 않고, 이웃한 <mark> 는 하나로 합친다", () => {
    expect(excerptParts("<mark>a</mark><mark>b</mark>")).toEqual([
      { text: "ab", mark: true },
    ]);
    expect(excerptParts("")).toEqual([]);
  });
});

describe("resultDate", () => {
  test("ISO 날짜·시각 → YYYY-MM-DD", () => {
    expect(resultDate("2022-12-23T00:00:00.000Z")).toBe("2022-12-23");
  });

  test("날짜 모양이 아니면 빈 문자열", () => {
    expect(resultDate(undefined)).toBe("");
    expect(resultDate("어제")).toBe("");
  });
});

describe("statusText", () => {
  test.each([
    ["", 0, "검색어를 입력하세요."],
    ["명제", null, "찾는 중…"],
    ["명제", 0, "“명제”에 맞는 글이 없습니다."],
    ["명제", 1, "“명제”: 글 1개"],
  ] as const)("%j, %j → %j", (query, count, expected) => {
    expect(statusText(query, count)).toBe(expected);
  });
});
