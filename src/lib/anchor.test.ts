import { describe, expect, test } from "vitest";

import {
  type Anchor,
  type TreeNode,
  CONTEXT,
  EXACT_MAX,
  domRange,
  indexText,
  locate,
  quote,
  textOffset,
} from "./anchor";

// 브라우저 Node 의 필요한 부분만 흉내 낸 가짜 노드.
const t = (data: string): TreeNode => ({ nodeType: 3, data, childNodes: [] });
const el = (
  name: string,
  attrs: Record<string, string>,
  ...children: TreeNode[]
): TreeNode => ({
  nodeType: 1,
  localName: name,
  childNodes: children,
  getAttribute: (key) => attrs[key] ?? null,
  classList: { contains: (c) => (attrs.class ?? "").split(" ").includes(c) },
});

describe("indexText", () => {
  test("텍스트 노드를 문서 순서대로 구분자 없이 잇는다", () => {
    const root = el(
      "main",
      {},
      el("h2", {}, el("a", { class: "heading-link" }, t("제목"))),
      el("p", {}, t("첫 "), el("strong", {}, t("굵은")), t(" 끝")),
    );
    expect(indexText(root).text).toBe("제목첫 굵은 끝");
  });

  test("MathML, aria-hidden, 복사 버튼, script·style·template 의 글자는 뺀다", () => {
    const root = el(
      "main",
      {},
      el(
        "p",
        {},
        t("수식 "),
        el(
          "span",
          { class: "katex" },
          el("span", { class: "katex-mathml" }, el("math", {}, t("x+1"))),
          el("span", { class: "katex-html", "aria-hidden": "true" }, t("x+1")),
        ),
        t(" 뒤"),
      ),
      el(
        "pre",
        {},
        el("code", {}, t("code")),
        el("button", { class: "copy-code" }, t("복사")),
      ),
      el("script", {}, t("var a")),
      el("style", {}, t("p{}")),
      el("template", {}, t("tpl")),
    );
    expect(indexText(root).text).toBe("수식  뒤code");
  });
});

describe("textOffset", () => {
  const a = t("가나다");
  const hidden = t("숨김");
  const b = t("라마");
  const p1 = el("p", {}, a);
  const span = el("span", { "aria-hidden": "true" }, hidden);
  const p2 = el("p", {}, span, b);
  const root = el("main", {}, p1, p2);
  const index = indexText(root);

  test("텍스트 노드 안의 경계는 그 노드의 시작 + offset", () => {
    expect(index.text).toBe("가나다라마");
    expect(textOffset(index, a, 1, "start")).toBe(1);
    expect(textOffset(index, b, 2, "end")).toBe(5);
  });

  test("요소 사이 경계: start 는 뒤의 첫 글자, end 는 앞의 마지막 글자 뒤", () => {
    // root 의 1번째 자식(p2) 앞 = "다" 뒤, "라" 앞
    expect(textOffset(index, root, 1, "start")).toBe(3);
    expect(textOffset(index, root, 1, "end")).toBe(3);
    expect(textOffset(index, root, 0, "start")).toBe(0);
    expect(textOffset(index, root, 2, "end")).toBe(5);
  });

  test("뺀 노드 안의 경계는 그 앞뒤의 보이는 글자로 붙는다", () => {
    expect(textOffset(index, hidden, 1, "start")).toBe(3);
    expect(textOffset(index, hidden, 0, "end")).toBe(3);
  });

  test("뿌리 밖의 노드는 null", () => {
    expect(textOffset(index, t("밖"), 0, "start")).toBeNull();
  });
});

describe("domRange", () => {
  const a = t("가나다");
  const b = t("라마");
  const index = indexText(el("main", {}, el("p", {}, a), el("p", {}, b)));

  test("노드 경계를 넘는 범위", () => {
    expect(domRange(index, 1, 4)).toEqual({
      startNode: a,
      startOffset: 1,
      endNode: b,
      endOffset: 1,
    });
  });

  test("노드 경계에서 시작하면 뒤 노드의 0, 끝나면 앞 노드의 끝", () => {
    expect(domRange(index, 3, 5)).toMatchObject({
      startNode: b,
      startOffset: 0,
    });
    expect(domRange(index, 0, 3)).toMatchObject({ endNode: a, endOffset: 3 });
  });

  test("빈 범위나 범위 밖은 null", () => {
    expect(domRange(index, 2, 2)).toBeNull();
    expect(domRange(index, 4, 9)).toBeNull();
    expect(domRange(index, -1, 2)).toBeNull();
  });
});

describe("quote", () => {
  const text = "0123456789".repeat(10);

  test("앞뒤 문맥은 32자까지", () => {
    const anchor = quote(text, 40, 45)!;
    expect(anchor).toEqual({
      exact: "01234",
      prefix: text.slice(40 - CONTEXT, 40),
      suffix: text.slice(45, 45 + CONTEXT),
      start: 40,
      end: 45,
    });
  });

  test("본문 처음과 끝에서는 문맥이 짧다", () => {
    expect(quote(text, 0, 3)!.prefix).toBe("");
    expect(quote(text, 98, 100)!.suffix).toBe("");
  });

  test("앞뒤 공백을 걷어 내고, 공백뿐이면 null", () => {
    expect(quote("가  나다 \n라", 1, 7)).toMatchObject({
      exact: "나다",
      start: 3,
      end: 5,
    });
    expect(quote("가   나", 1, 4)).toBeNull();
  });

  test("EXACT_MAX 를 넘으면 앞에서부터 자르고 서로게이트 쌍을 가르지 않는다", () => {
    const long = "가".repeat(EXACT_MAX + 50);
    expect(quote(long, 0, long.length)!.exact.length).toBe(EXACT_MAX);
    const emoji = "a".repeat(EXACT_MAX - 1) + "😀" + "b";
    expect(quote(emoji, 0, emoji.length)!.exact).toBe(
      "a".repeat(EXACT_MAX - 1),
    );
  });
});

describe("locate", () => {
  const text = "사과는 빨갛다. 바나나는 노랗다. 사과는 맛있다.";
  const second = quote(
    text,
    text.lastIndexOf("사과는"),
    text.lastIndexOf("사과는") + 3,
  )!;

  test("저장한 자리가 그대로면 그 자리", () => {
    expect(locate(text, second)).toEqual({
      start: second.start,
      end: second.end,
    });
  });

  test("앞에 글이 더해져 자리가 밀려도 문맥으로 같은 문장을 찾는다", () => {
    const edited = "머리말을 더했다. " + text;
    const found = locate(edited, second)!;
    expect(found.start).toBe(edited.lastIndexOf("사과는"));
    expect(edited.slice(found.start, found.end)).toBe("사과는");
  });

  test("같은 글자가 여러 번 나오면 문맥이 더 많이 맞는 곳", () => {
    const anchor: Anchor = { ...second, start: 0, end: 3 };
    expect(locate(text, anchor)!.start).toBe(text.lastIndexOf("사과는"));
  });

  test("문맥 점수가 같으면 저장한 위치에 가까운 곳", () => {
    const anchor: Anchor = {
      exact: "ab",
      prefix: "",
      suffix: "",
      start: 7,
      end: 9,
    };
    expect(locate("ab-ab-ab-ab", anchor)!.start).toBe(6);
  });

  test("exact 가 본문에 없으면 null(원문을 찾을 수 없는 댓글)", () => {
    expect(locate(text, { ...second, exact: "포도는" })).toBeNull();
    expect(locate(text, { ...second, exact: "" })).toBeNull();
  });
});
