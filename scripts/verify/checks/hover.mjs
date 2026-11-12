// hover — a pointer on a link must change it exactly as it does on the baseline.
//
// The screenshots of the visual check are taken with no pointer over the page, so a :hover rule can come or go
// without it noticing. Here a real pointer is put on every visible a[href] and <summary>, one after the other,
// and the computed style of the element and of everything inside it is read:
//
//   color  background-color  text-decoration-line  text-decoration-color  box-shadow  opacity  cursor  outline-style
//
// together with the transitions and animations the pointer set off. The same is read before the pointer has
// moved at all: a value that already differs at rest is reported as that, and again as a hover difference only
// when the pointer changes it on one of the two sides.
//
// Elements are paired by their position in document order, counted from 0 (the #n of a report line). What is
// inside them is paired by tag path, e.g. div[2] > span: the first <span> of the second <div>.
//
// Allowlist item: route:<route> skips the route.
// An accept entry with "mask" (lib/accept.mjs) leaves out every link inside an element the mask selects, on both sides.
import { mapLimit, MAX_PAGES, openBrowser } from "../lib/browser.mjs";
import { editPages, postRoutesWith } from "../lib/html.mjs";

const NAME = "hover";
const VIEWPORT = { width: 1280, height: 900 };
const SELECTOR = "a[href], summary";
const PROPERTIES = [
  "color",
  "background-color",
  "text-decoration-line",
  "text-decoration-color",
  "box-shadow",
  "opacity",
  "cursor",
  "outline-style",
];
// A pointer move has taken effect by the time the browser reports it done. This only bounds the wait for
// one that has not.
const POINTER_WAIT_MS = 2_000;
/** Differences spelled out in the one-line detail; all of them are in the report. */
const SHOWN = 3;

const oneLine = (error) => String(error?.message ?? error).split("\n")[0];
const shorten = (text, max) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

// ── in the page ─────────────────────────────────────────────────────────────────────────────────

/**
 * Finds what there is to hover and returns it with its values at rest. Leaves window.__verifyHover behind:
 *   aim(index)   bring the element into view → { point, neutral }: where to put the pointer (null when
 *                no point of the element can be reached), and where to park it afterwards
 *   read(index)  the values of the element now that the pointer is on it
 */
function survey({ selector, properties, patience, mask }) {
  const family = (element) => [element, ...element.querySelectorAll("*")];
  const boxes = (node) =>
    Array.from(node.getClientRects()).filter(
      (box) => box.width > 0 && box.height > 0,
    );
  const visible = (element) =>
    element.checkVisibility({ visibilityProperty: true }) &&
    family(element).some((node) => boxes(node).length > 0);

  const masked = (element) => mask !== "" && element.closest(mask) !== null;
  window.__verifyMasked = Array.from(
    document.querySelectorAll(selector),
  ).filter(masked).length;
  const targets = Array.from(document.querySelectorAll(selector)).filter(
    (element) => visible(element) && !masked(element),
  );

  /**
   * "div[2] > span": the way from `element` down to `node`, here the first <span> of its second <div> child.
   * Empty for the element itself.
   */
  const pathFrom = (element, node) => {
    const steps = [];
    for (let at = node; at !== element; at = at.parentElement) {
      let nth = 1;
      for (
        let twin = at.previousElementSibling;
        twin;
        twin = twin.previousElementSibling
      )
        if (twin.localName === at.localName) nth += 1;
      steps.unshift(nth > 1 ? `${at.localName}[${nth}]` : at.localName);
    }
    return steps.join(" > ");
  };

  /**
   * Everything in motion, as [element, name]. Asking for it brings the styles up to date, which is what starts
   * the transitions of a new :hover state. Transitions are taken to their end, so that what is read next is
   * where the element ends up and not somewhere on the way there.
   */
  const motions = () => {
    const found = [];
    for (const animation of document.getAnimations()) {
      const owner = animation.effect?.target;
      if (animation instanceof CSSTransition) {
        found.push([owner, `transition ${animation.transitionProperty}`]);
        animation.finish();
      } else if (animation.playState === "running") {
        found.push([
          owner,
          animation instanceof CSSAnimation
            ? `animation ${animation.animationName}`
            : "animation",
        ]);
      }
    }
    return found;
  };

  const look = (element, moving) => ({
    motion:
      Array.from(
        new Set(
          moving
            .filter(([owner]) => owner && element.contains(owner))
            .map(([, name]) => name),
        ),
      )
        .sort()
        .join(", ") || "none",
    // One row per element of the family, one value per property.
    values: family(element).map((node) => {
      const style = getComputedStyle(node);
      return properties.map((property) => style.getPropertyValue(property));
    }),
  });

  const until = async (condition) => {
    const deadline = performance.now() + patience;
    while (!condition()) {
      if (performance.now() >= deadline) return false;
      await new Promise((done) => setTimeout(done, 5));
    }
    return true;
  };

  /** A point of the viewport that is on `element` and that nothing else covers. */
  const pointOn = (element) => {
    const { clientWidth, clientHeight } = document.documentElement;
    for (const node of family(element)) {
      for (const box of boxes(node)) {
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        if (x < 0 || y < 0 || x >= clientWidth || y >= clientHeight) continue;
        if (element.contains(document.elementFromPoint(x, y))) return { x, y };
      }
    }
    return null;
  };

  /** A point of the viewport that is on none of the elements. */
  const neutralSpot = () => {
    const right = document.documentElement.clientWidth - 2;
    const bottom = document.documentElement.clientHeight - 2;
    for (const [x, y] of [
      [1, 1],
      [right, 1],
      [1, bottom],
      [right, bottom],
    ]) {
      const under = document.elementFromPoint(x, y);
      if (!under || !under.closest(selector)) return { x, y };
    }
    return null;
  };

  window.__verifyHover = {
    async aim(index) {
      // The pointer has been parked: wait for the last element to be let go, and for it to be back at rest.
      if (!(await until(() => !targets.some((one) => one.matches(":hover")))))
        throw new Error("the pointer is still on a link after moving off it");
      motions();
      targets[index].scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "instant",
      });
      return { point: pointOn(targets[index]), neutral: neutralSpot() };
    },

    async read(index) {
      const element = targets[index];
      // The point was on the element a moment ago. Not hovered now means the measurement went wrong, and
      // saying so is better than comparing two sides that were both never hovered.
      if (!(await until(() => element.matches(":hover"))))
        throw new Error(
          `the pointer was put on element #${index} but does not hover it`,
        );
      return look(element, motions());
    },
  };

  const moving = motions();
  return targets.map((element) => ({
    tag: element.localName,
    href: element.getAttribute("href"),
    text: element.textContent.replace(/\s+/g, " ").trim().slice(0, 80),
    parts: family(element).map((node) => pathFrom(element, node)),
    rest: look(element, moving),
  }));
}

// ── measuring ───────────────────────────────────────────────────────────────────────────────────

/**
 * Every visible link and <summary> of one page outside the elements `mask` selects:
 * { elements: [{ tag, href, text, parts, rest, hover }], masked: <number of links left out> }.
 */
function measure(browser, url, route, mask) {
  return browser.withPage(VIEWPORT, async (tab) => {
    const status = await tab.open(url);
    if (status >= 400 && route !== "/404") throw new Error(`HTTP ${status}`);
    if (tab.failures.length)
      throw new Error(`third-party request failed: ${tab.failures[0]}`);

    const { page } = tab;
    const elements = await page.evaluate(survey, {
      selector: SELECTOR,
      properties: PROPERTIES,
      patience: POINTER_WAIT_MS,
      mask,
    });
    const masked = await page.evaluate(() => window.__verifyMasked);

    for (const [index, element] of elements.entries()) {
      const { point, neutral } = await page.evaluate(
        (at) => window.__verifyHover.aim(at),
        index,
      );
      if (!neutral)
        throw new Error("no spot in the viewport that is off every link");

      element.hover = null; // stays null when something covers the element: no pointer gets onto it
      if (!point) continue;
      await page.mouse.move(point.x, point.y);
      element.hover = await page.evaluate(
        (at) => window.__verifyHover.read(at),
        index,
      );
      await page.mouse.move(neutral.x, neutral.y);
    }
    return { elements, masked };
  });
}

// ── comparing ───────────────────────────────────────────────────────────────────────────────────

/** A link by its href, a <summary> by its text. */
const identify = (element) =>
  element.tag === "a"
    ? `a[href="${shorten(element.href, 40)}"]`
    : `${element.tag} "${shorten(element.text, 32)}"`;

/** A difference that has nothing to do with where the pointer is. */
const plain = (baseline, candidate) => ({ state: "", baseline, candidate });

/**
 * Differences of one value. `rest` and `hover` are [baseline, candidate]; `hover` is null when the pointer
 * could not get onto the element on one of the sides.
 */
function judge(rest, hover) {
  const found = [];
  if (rest[0] !== rest[1])
    found.push({ state: "at rest", baseline: rest[0], candidate: rest[1] });
  // Without an effect of the pointer on either side, differing under it only repeats the difference at rest.
  if (
    hover &&
    hover[0] !== hover[1] &&
    (hover[0] !== rest[0] || hover[1] !== rest[1])
  )
    found.push({ state: "on hover", baseline: hover[0], candidate: hover[1] });
  return found;
}

/** Both sides have the same number of elements. → { differences, responding, unreachable } */
function compare(baseline, candidate) {
  const differences = [];
  const unreachable = [];
  let responding = 0; // elements of the baseline that the pointer changes: a pass with none of them says little

  for (const [index, base] of baseline.entries()) {
    const other = candidate[index];
    const element = `${identify(base)}#${index}`;
    const note = (part, property, ...found) => {
      for (const difference of found)
        differences.push({ index, element, part, property, ...difference });
    };
    if (base.hover && JSON.stringify(base.hover) !== JSON.stringify(base.rest))
      responding += 1;

    if (base.tag !== other.tag) {
      note("", "tag", plain(base.tag, other.tag));
      continue;
    }
    // What only one side has inside the element has nothing to be compared with: a difference of its own.
    for (const part of base.parts)
      if (!other.parts.includes(part))
        note(part, "element", plain("present", "missing"));
    for (const part of other.parts)
      if (!base.parts.includes(part))
        note(part, "element", plain("missing", "present"));

    const reached = Boolean(base.hover) && Boolean(other.hover);
    const pointer = (side) =>
      side.hover ? "gets onto it" : "cannot get onto it";
    if (!base.hover && !other.hover) unreachable.push(element);
    else if (!reached)
      note("", "pointer", plain(pointer(base), pointer(other)));

    note(
      "",
      "animation",
      ...judge(
        [base.rest.motion, other.rest.motion],
        reached ? [base.hover.motion, other.hover.motion] : null,
      ),
    );
    for (const [row, part] of base.parts.entries()) {
      const twin = other.parts.indexOf(part);
      if (twin === -1) continue; // reported above as missing
      for (const [column, property] of PROPERTIES.entries())
        note(
          part,
          property,
          ...judge(
            [base.rest.values[row][column], other.rest.values[twin][column]],
            reached
              ? [
                  base.hover.values[row][column],
                  other.hover.values[twin][column],
                ]
              : null,
          ),
        );
    }
  }

  return { differences, responding, unreachable };
}

const lineOf = (difference) =>
  `${difference.element}${difference.part ? ` > ${difference.part}` : ""} ${difference.property}${
    difference.state ? ` ${difference.state}` : ""
  }: ${difference.baseline} → ${difference.candidate}`;

/** One route, from the measurements of its two sides. → { route, ok, detail, … } */
function verdict(route, baseline, candidate) {
  for (const [side, measured] of [
    ["baseline", baseline],
    ["candidate", candidate],
  ])
    if (measured.error)
      return {
        route,
        ok: false,
        detail: `${side}: ${oneLine(measured.error)}`,
      };

  const elements = {
    baseline: baseline.elements.length,
    candidate: candidate.elements.length,
  };
  if (elements.baseline !== elements.candidate) {
    const shared = Math.min(elements.baseline, elements.candidate);
    let at = 0;
    while (
      at < shared &&
      identify(baseline.elements[at]) === identify(candidate.elements[at])
    )
      at += 1;
    const here = (side) =>
      at < side.elements.length ? identify(side.elements[at]) : "nothing";
    return {
      route,
      ok: false,
      elements,
      detail: `baseline has ${elements.baseline} visible a[href]/summary elements, candidate has ${elements.candidate}; first mismatch at #${at}: ${here(baseline)} → ${here(candidate)}`,
    };
  }

  const { differences, responding, unreachable } = compare(
    baseline.elements,
    candidate.elements,
  );
  const outcome = {
    route,
    ok: differences.length === 0,
    elements,
    responding,
    unreachable,
  };
  if (outcome.ok) return outcome;

  const count = differences.length;
  const touched = new Set(differences.map((difference) => difference.index));
  const shown = differences.slice(0, SHOWN).map(lineOf).join("; ");
  const more = count > SHOWN ? `; +${count - SHOWN} more` : "";
  return {
    ...outcome,
    detail: `${shown}${more} (${count} difference${count === 1 ? "" : "s"} in ${touched.size} of ${elements.baseline} elements)`,
    differences: differences.map(lineOf),
  };
}

// ── the check ───────────────────────────────────────────────────────────────────────────────────

async function run(ctx) {
  const cells = {};
  const allowed = [];
  const routes = [];
  for (const route of ctx.routes) {
    const reason = ctx.allowed(NAME, `route:${route}`);
    if (reason) {
      cells[route] = "skip";
      allowed.push({ item: `route:${route}`, reason });
    } else {
      routes.push(route);
    }
  }

  const browser = await openBrowser(ctx);
  let measured;
  try {
    const urls = {
      baseline: await ctx.serve("baseline"),
      candidate: await ctx.serve("candidate"),
    };
    const pages = routes.flatMap((route) => [
      { route, side: "baseline" },
      { route, side: "candidate" },
    ]);
    measured = await mapLimit(pages, MAX_PAGES, async ({ route, side }) => {
      try {
        const mask = ctx.masks(NAME, route).join(",");
        const { elements, masked } = await measure(
          browser,
          urls[side] + route,
          route,
          mask,
        );
        if (masked > 0) ctx.masked(NAME, route);
        return { elements };
      } catch (error) {
        return { error };
      }
    });
  } finally {
    await browser.close();
  }

  const outcomes = routes.map((route, index) =>
    verdict(route, measured[2 * index], measured[2 * index + 1]),
  );

  const failed = [];
  for (const outcome of outcomes) {
    cells[outcome.route] = outcome.ok ? "pass" : "fail";
    if (!outcome.ok)
      failed.push({ route: outcome.route, detail: outcome.detail });
  }

  return {
    ok: failed.length === 0,
    pass: outcomes.length - failed.length,
    fail: failed.length,
    failed,
    cells,
    extra: { routes: outcomes, allowed },
  };
}

// ── selftest ────────────────────────────────────────────────────────────────────────────────────

// The mutations edit the rules inlined in every page (editPages in lib/html.mjs). `routes` names a page the
// mutated rule shows on, so that one is measured, not all.
export default {
  name: NAME,
  kind: "browser",
  run,

  selftest: {
    mutations: [
      {
        name: "홈 목록 링크의 hover 밑줄 제거",
        routes: ["/"],
        apply(dir) {
          editPages(dir, /a:hover\{text-decoration:underline\}/, "a:hover{}");
        },
      },
      {
        name: "헤더 아이콘 링크의 hover 투명도 변경",
        routes: ["/"],
        apply(dir) {
          editPages(
            dir,
            /(?<=li\[[^\]]*\] a\[[^\]]*\]:hover\{opacity:)\.4/,
            "0.8",
          );
        },
      },
      {
        name: "글 본문 링크의 hover box-shadow 제거",
        routes: (dir) => postRoutesWith(dir, /<main[\s\S]*?<a href=/),
        apply(dir) {
          editPages(dir, /a:hover\{box-shadow:0 \.125rem #000\}/, "a:hover{}");
        },
      },
      {
        // On the baseline this rule matches nothing (the title holds no <p>). Matching the <span>s inside
        // the link is a difference that only shows in a descendant of the hovered element.
        name: "헤더 제목 링크 안쪽 요소의 hover box-shadow 추가",
        routes: ["/"],
        apply(dir) {
          editPages(dir, /:hover p(\[[^\]]*\]) span/, ":hover div$1 span");
        },
      },
    ],
  },
};
