import { describe, expect, test } from "vitest";

import { tagPath, tagSlug, tagUrl } from "../src/lib/tags";
import { SITE } from "../src/lib/site";

describe("tagSlug", () => {
  test.each([
    ["Proxy", "proxy"],
    ["built-in object", "built-in-object"],
    ["void 요소", "void-요소"],
    ["요소vs태그", "요소vs태그"],
    // 공백·구두점이 이어지면 "-" 하나, 앞뒤의 "-" 는 뗀다
    ["  a  ,  b  ", "a-b"],
    ["C++", "c"],
    ["Node.js", "node-js"],
    // NFKC: 전각 영문·숫자는 반각으로
    ["ＣＳＳ３", "css3"],
    // 구두점뿐이면 빈 문자열(getTags 가 멈춘다)
    ["!!!", ""],
  ])("%j → %j", (keyword, slug) => {
    expect(tagSlug(keyword)).toBe(slug);
  });

  test("조합형(NFD)과 완성형(NFC) 한글은 같은 슬러그", () => {
    const nfc = "요소";
    const nfd = nfc.normalize("NFD");
    expect(nfd).not.toBe(nfc);
    expect(tagSlug(nfd)).toBe(tagSlug(nfc));
  });

  test("대소문자만 다른 키워드는 같은 슬러그가 된다(getTags 가 충돌로 멈추는 근거)", () => {
    expect(tagSlug("CSS")).toBe(tagSlug("css"));
  });
});

describe("tagPath, tagUrl", () => {
  test("한글 슬러그는 퍼센트 인코딩한다", () => {
    expect(tagPath("void 요소")).toBe("/tags/void-%EC%9A%94%EC%86%8C");
    expect(tagUrl("Proxy")).toBe(`${SITE.url}/tags/proxy`);
  });
});
