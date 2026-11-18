// 인라인 댓글의 문장 위치(W3C Web Annotation 의 TextQuote + TextPosition). 순수 함수만 둔다.
//
// "본문 텍스트"는 본문 뿌리(<main class="prose">) 아래 텍스트 노드의 data 를 문서 순서대로 그냥 이은 문자열이다.
// 블록 사이에 줄바꿈을 끼우지 않는다. selection.toString() 과 달리 CSS 에 따라 바뀌지 않아서, 같은 HTML 이면
// 언제나 같은 글자와 같은 위치가 나온다. 아래 요소의 글자는 넣지 않는다(SKIP).
//   - 수식: KaTeX 의 MathML(<math>)과 그 옆의 aria-hidden 사본. 같은 수식이 두 번 들어가고, 선택해도 의미가 없다.
//   - 복사 버튼(.copy-code): 스크립트가 나중에 넣으므로 넣으면 위치가 페이지마다 달라진다.
//   - aria-hidden="true", <script>·<style>·<template>.
//
// DOM 타입 대신 아래의 작은 구조(TreeNode)만 쓴다. 브라우저의 Node 가 그대로 맞고, 시험은 가짜 노드로 돈다.
import type { Anchor } from "../../comments/src/contract";

export type { Anchor };

/** 저장하는 앞뒤 문맥의 길이(contract 의 QUOTE_CONTEXT_MAX). */
export const CONTEXT = 32;
/** exact 의 최대 길이(contract 의 QUOTE_EXACT_MAX). */
export const EXACT_MAX = 1000;

export interface TreeNode {
  nodeType: number;
  childNodes: ArrayLike<TreeNode>;
  /** 텍스트 노드의 글자. */
  data?: string;
  /** 요소의 소문자 이름(HTML 은 소문자, MathML <math> 도 "math"). */
  localName?: string | null;
  getAttribute?: (name: string) => string | null;
  classList?: { contains(token: string): boolean };
}

const TEXT = 3;
const ELEMENT = 1;
const SKIP_TAGS = new Set(["math", "script", "style", "template"]);

/** 이 요소의 글자를 본문 텍스트에서 뺄지. */
export function skipped(node: TreeNode): boolean {
  return (
    SKIP_TAGS.has(node.localName ?? "") ||
    node.getAttribute?.("aria-hidden") === "true" ||
    node.classList?.contains("copy-code") === true
  );
}

export interface Segment {
  node: TreeNode;
  /** 본문 텍스트 안에서 이 노드가 시작하는 위치. */
  start: number;
  /** 문서 순서(뿌리 아래 모든 노드의 전위 순회 번호). */
  order: number;
}

export interface TextIndex {
  text: string;
  segments: Segment[];
  /** 뿌리 아래 모든 노드(뺀 것 포함) → [전위 번호, 마지막 자손의 전위 번호]. */
  order: Map<TreeNode, [number, number]>;
}

/** 뿌리 아래의 본문 텍스트와, 위치 ↔ 노드를 오가는 표. */
export function indexText(root: TreeNode): TextIndex {
  const segments: Segment[] = [];
  const order = new Map<TreeNode, [number, number]>();
  let text = "";
  let counter = 0;
  const visit = (node: TreeNode, hidden: boolean) => {
    const entry: [number, number] = [counter, counter];
    counter++;
    order.set(node, entry);
    const hide = hidden || (node.nodeType === ELEMENT && skipped(node));
    if (node.nodeType === TEXT && !hide && node.data) {
      segments.push({ node, start: text.length, order: entry[0] });
      text += node.data;
    }
    for (const child of Array.from(node.childNodes)) visit(child, hide);
    entry[1] = counter - 1;
  };
  visit(root, false);
  return { text, segments, order };
}

/**
 * DOM 경계점(Range 의 start/end 와 같은 (노드, offset))을 본문 텍스트의 위치로. 뿌리 밖이면 null.
 * 뺀 노드나 요소 사이를 가리키면 start 는 그 뒤의 첫 글자로, end 는 그 앞의 마지막 글자 뒤로 붙인다.
 */
export function textOffset(
  index: TextIndex,
  node: TreeNode,
  offset: number,
  side: "start" | "end",
): number | null {
  const range = index.order.get(node);
  if (!range) return null;
  const segment = index.segments.find((s) => s.node === node);
  if (segment)
    return segment.start + Math.min(offset, segment.node.data!.length);
  // 경계 뒤에 오는 첫 노드의 전위 번호.
  let point: number;
  if (node.nodeType === TEXT) point = offset > 0 ? range[1] + 1 : range[0];
  else {
    const child = node.childNodes[offset];
    point = child ? index.order.get(child)![0] : range[1] + 1;
  }
  if (side === "start") {
    const next = index.segments.find((s) => s.order >= point);
    return next ? next.start : index.text.length;
  }
  let prev: Segment | undefined;
  for (const s of index.segments) if (s.order < point) prev = s;
  return prev ? prev.start + prev.node.data!.length : 0;
}

/** 본문 텍스트의 [start, end) → DOM 경계점 둘. 범위를 벗어나면 null. */
export function domRange(
  index: TextIndex,
  start: number,
  end: number,
): {
  startNode: TreeNode;
  startOffset: number;
  endNode: TreeNode;
  endOffset: number;
} | null {
  if (!(0 <= start && start < end && end <= index.text.length)) return null;
  const at = (pos: number, side: "start" | "end") => {
    // start 는 그 글자를 가진 노드, end 는 그 앞 글자를 가진 노드.
    const segs = index.segments;
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i]!;
      if (side === "start" ? s.start <= pos : s.start < pos)
        return { node: s.node, offset: pos - s.start };
    }
    return null;
  };
  const a = at(start, "start");
  const b = at(end, "end");
  if (!a || !b) return null;
  return {
    startNode: a.node,
    startOffset: a.offset,
    endNode: b.node,
    endOffset: b.offset,
  };
}

/**
 * 선택한 [start, end) 를 저장할 Anchor 로. 앞뒤 공백을 걷어 내고, EXACT_MAX 를 넘으면 앞에서부터 자른다.
 * 걷어 낸 뒤 글자가 없으면 null.
 */
export function quote(text: string, start: number, end: number): Anchor | null {
  let s = Math.max(0, start);
  let e = Math.min(text.length, end);
  while (s < e && /\s/.test(text[s]!)) s++;
  while (e > s && /\s/.test(text[e - 1]!)) e--;
  if (s >= e) return null;
  if (e - s > EXACT_MAX) {
    e = s + EXACT_MAX;
    // 서로게이트 쌍을 가르지 않는다.
    if (/[\uD800-\uDBFF]/.test(text[e - 1]!)) e--;
  }
  return {
    exact: text.slice(s, e),
    prefix: text.slice(Math.max(0, s - CONTEXT), s),
    suffix: text.slice(e, e + CONTEXT),
    start: s,
    end: e,
  };
}

/** 앞뒤 문맥이 얼마나 맞는지(맞는 글자 수). prefix 는 끝에서부터, suffix 는 앞에서부터 센다. */
function contextScore(text: string, at: number, anchor: Anchor): number {
  let score = 0;
  const { prefix, suffix, exact } = anchor;
  for (let i = 1; i <= prefix.length; i++) {
    if (text[at - i] !== prefix[prefix.length - i]) break;
    score++;
  }
  const after = at + exact.length;
  for (let i = 0; i < suffix.length; i++) {
    if (text[after + i] !== suffix[i]) break;
    score++;
  }
  return score;
}

/**
 * 저장한 Anchor 를 지금 본문 텍스트에서 찾는다. 못 찾으면 null(원문이 사라진 댓글).
 * 1. 저장한 위치의 글자가 exact 와 같으면 그 자리.
 * 2. 아니면 exact 가 나오는 모든 자리 중 앞뒤 문맥이 가장 많이 맞는 곳, 같으면 저장한 위치에 가까운 곳.
 */
export function locate(
  text: string,
  anchor: Anchor,
): { start: number; end: number } | null {
  const { exact } = anchor;
  if (!exact) return null;
  const full = anchor.prefix.length + anchor.suffix.length;
  if (
    text.slice(anchor.start, anchor.end) === exact &&
    contextScore(text, anchor.start, anchor) === full
  )
    return { start: anchor.start, end: anchor.end };
  let best: { at: number; score: number; distance: number } | null = null;
  for (
    let at = text.indexOf(exact);
    at !== -1;
    at = text.indexOf(exact, at + 1)
  ) {
    const score = contextScore(text, at, anchor);
    const distance = Math.abs(at - anchor.start);
    if (
      !best ||
      score > best.score ||
      (score === best.score && distance < best.distance)
    )
      best = { at, score, distance };
  }
  return best ? { start: best.at, end: best.at + exact.length } : null;
}
