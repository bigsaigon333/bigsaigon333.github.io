// 섹션 링크(H1): 본문의 h2–h4 안 내용을 그 제목으로 가는 링크 `<a class="heading-link" href="#<id>">` 로 감싼다.
//
// id 는 Sätteri 의 heading-ids 플러그인(@astrojs/markdown-satteri 의 satteri-processor.js, createHeadingIdsPlugin)이
// 붙인다. 그런데 사용자 hast 플러그인은 그보다 먼저 돈다. 그래서 여기서 id 를 똑같이 계산해 href 와 함께 넣는다.
// heading-ids 는 제목에 이미 id 가 있으면 그것을 그대로 쓰고(목차의 heading.slug 도 그 값) slugger 에 넣지 않는다.
// 그래서 h2–h4 뿐 아니라 h1–h6 모두에 id 를 넣는다. 일부만 넣으면 나머지 제목은 heading-ids 의 새 slugger 가
// 이 플러그인이 쓴 slug 를 모른 채 계산해 중복 접미사(-1)가 어긋날 수 있다.
//
// heading-ids 와 같게 하는 것:
//   - 문서마다 새 github-slugger 하나(그래서 플러그인은 팩토리다. Sätteri 가 문서마다 부른다).
//   - 글자: ctx.textContent(제목). 그 글자에 "frontmatter" 가 있으면 collectHastText(아래, 원본과 같은 코드).
//   - 이미 문자열 id 가 있으면 그 값을 쓰고 slugger 에 넣지 않는다.
//
// 링크는 제목의 글자를 바꾸지 않는다(검증 장치의 toc 검사가 목차 글자와 제목 글자를 비교한다).
// 눈에 보이는 `#` 는 src/styles/prose.css 의 `.heading-link::before` 가 그린다.
import Slugger from "github-slugger";

const LINKED = new Set(["h2", "h3", "h4"]);

// satteri-processor.js 의 resolveFrontmatterExpression·collectHastText 를 그대로 옮겼다(내보내지 않는 모듈이다).
function resolveFrontmatterExpression(expr, frontmatter) {
  if (!expr.startsWith("frontmatter.") && !expr.startsWith("frontmatter["))
    return undefined;
  const pathStr = expr.slice("frontmatter".length);
  const parts = [];
  const pathRegex = /\.(\w+)|\[(\d+)\]|\["([^"]+)"\]|\['([^']+)'\]/g;
  let match;
  while ((match = pathRegex.exec(pathStr)) !== null) {
    parts.push(match[1] ?? match[2] ?? match[3] ?? match[4]);
  }
  if (parts.length === 0) return undefined;
  let value = frontmatter;
  for (const key of parts) {
    if (value == null || typeof value !== "object") return undefined;
    value = value[key];
  }
  return typeof value === "string" ? value : undefined;
}

function collectHastText(node, frontmatter) {
  let text = "";
  if (node.type === "mdxFlowExpression" || node.type === "mdxTextExpression") {
    if (node.value != null && frontmatter) {
      const resolved = resolveFrontmatterExpression(
        node.value.trim(),
        frontmatter,
      );
      text += resolved ?? node.value;
    }
  } else if ("value" in node && node.value != null) {
    text += node.value;
  }
  if ("children" in node && node.children) {
    for (const child of node.children) {
      text += collectHastText(child, frontmatter);
    }
  }
  return text;
}

const RAW_ANCHOR = /<a[\s>]/i;

/** 자손에 링크(<a> 요소나 <a 가 든 원시 HTML)가 있는가. */
function hasAnchor(node) {
  for (const child of node.children ?? []) {
    if (child.type === "element" && child.tagName === "a") return true;
    if (child.type === "raw" && RAW_ANCHOR.test(child.value ?? "")) return true;
    if (hasAnchor(child)) return true;
  }
  return false;
}

/** Sätteri 의 hastPlugins 에 넣는 팩토리. 문서마다 불려 새 slugger 를 만든다. */
export function headingLinksPlugin() {
  const slugger = new Slugger();
  return {
    name: "heading-links",
    element: {
      filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
      visit(node, ctx) {
        const existingId = node.properties?.id;
        let slug;
        if (typeof existingId === "string") {
          slug = existingId;
        } else {
          const rawText = ctx.textContent(node);
          const text = rawText.includes("frontmatter")
            ? collectHastText(node, ctx.data.astro?.frontmatter ?? {})
            : rawText;
          slug = slugger.slug(text);
          ctx.setProperty(node, "id", slug);
        }
        if (!LINKED.has(node.tagName)) return;
        const href = `#${slug}`;
        if (hasAnchor(node)) {
          // 링크 안에 링크를 둘 수 없다(HTML 파서가 바깥 링크를 끊는다). 제목 안에 이미 링크가 있으면 내용은 그대로 두고
          // 빈 링크를 앞에 하나 넣는다. 글자가 없으니 textContent 는 그대로이고, 이름은 aria-label 이 준다.
          ctx.prependChild(node, {
            type: "element",
            tagName: "a",
            properties: {
              className: ["heading-link", "heading-link-solo"],
              href,
              ariaLabel: `${ctx.textContent(node).trim()} 섹션 링크`,
            },
            children: [],
          });
          return;
        }
        ctx.setField(node, "children", [
          {
            type: "element",
            tagName: "a",
            properties: { className: ["heading-link"], href },
            children: [...node.children],
          },
        ]);
      },
    },
  };
}
