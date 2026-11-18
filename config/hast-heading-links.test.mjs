import { satteri } from "@astrojs/markdown-satteri";
import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";

import { headingLinksPlugin } from "./hast-heading-links.mjs";
import markdown from "./markdown.mjs";

// 이 저장소의 설정(KaTeX 플러그인, 이 플러그인)으로 렌더한 것과, 같은 설정에서 이 플러그인만 뺀 것을 비교한다.
// 뺀 쪽의 id 는 Sätteri 의 heading-ids 가 혼자 붙인 값이라, 둘이 같으면 slug 계산이 그대로라는 뜻이다.
const withLinks = await markdown.processor.createRenderer({});
const withoutLinks = await satteri({
  ...markdown.processor.options,
  hastPlugins: markdown.processor.options.hastPlugins.filter(
    (plugin) => plugin !== headingLinksPlugin,
  ),
}).createRenderer({});

const DOC = [
  "# 맨 위 제목",
  "## 소개",
  "## 소개",
  "### 임의의 집합 $C$",
  "#### **굵게** `code` 와 _기울임_",
  "##### 소개",
  "###### 소개",
  "## Hello, World! 안녕?",
  "## 소개",
].join("\n\n");

function headings(html) {
  const $ = cheerio.load(html);
  return $("h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((el) => ({
      tag: el.tagName,
      id: $(el).attr("id"),
      text: $(el).text(),
      links: $(el)
        .find("a.heading-link")
        .toArray()
        .map((a) => $(a).attr("href")),
    }));
}

describe("headingLinksPlugin", () => {
  it("heading-ids 와 같은 id 와 headings 를 낸다(한글, 중복, 수식, h1·h5·h6 섞임)", async () => {
    const a = await withLinks.render(DOC, {});
    const b = await withoutLinks.render(DOC, {});
    expect(a.metadata.headings).toEqual(b.metadata.headings);
    const ha = headings(a.code);
    const hb = headings(b.code);
    expect(ha.map(({ tag, id, text }) => ({ tag, id, text }))).toEqual(
      hb.map(({ tag, id, text }) => ({ tag, id, text })),
    );
    expect(ha.map((h) => h.id)).toEqual([
      "맨-위-제목",
      "소개",
      "소개-1",
      "임의의-집합-",
      "굵게-code-와-기울임",
      "소개-2",
      "소개-3",
      "hello-world-안녕",
      "소개-4",
    ]);
  });

  it("h2–h4 만 자기 id 로 가는 링크 하나로 내용을 감싼다", async () => {
    const { code } = await withLinks.render(DOC, {});
    for (const h of headings(code)) {
      if (["h2", "h3", "h4"].includes(h.tag))
        expect(h.links).toEqual([`#${h.id}`]);
      else expect(h.links).toEqual([]);
    }
    const $ = cheerio.load(code);
    // 수식 KaTeX HTML 도 링크 안에 든다.
    expect($("h3 > a.heading-link .katex").length).toBe(1);
    expect($("h2").first().children().length).toBe(1);
  });

  it("문서마다 slugger 를 새로 만든다", async () => {
    const first = await withLinks.render("## 소개\n\n## 소개", {});
    const second = await withLinks.render("## 소개\n\n## 소개", {});
    expect(headings(second.code)).toEqual(headings(first.code));
    expect(headings(first.code).map((h) => h.id)).toEqual(["소개", "소개-1"]);
  });

  it("제목 안에 링크가 있으면 감싸지 않고 이름 있는 빈 링크를 앞에 둔다", async () => {
    const doc = "## [MDN](https://developer.mozilla.org) 문서";
    const a = await withLinks.render(doc, {});
    const b = await withoutLinks.render(doc, {});
    const $ = cheerio.load(a.code);
    const solo = $("h2 > a.heading-link");
    expect(solo.length).toBe(1);
    expect(solo.attr("href")).toBe("#mdn-문서");
    expect(solo.text()).toBe("");
    expect(solo.attr("aria-label")).toBe("MDN 문서 섹션 링크");
    expect($("h2 a.heading-link a").length).toBe(0);
    expect(headings(a.code)[0].text).toBe(headings(b.code)[0].text);
    expect(a.metadata.headings).toEqual(b.metadata.headings);
  });
});
