// 댓글 UI 조각. loader.ts 가 필요할 때만 동적 import 한다(site-guard 의 lazyBudget 안).
//
// - 하이라이트: CSS Custom Highlight API. "comments" 는 열린 본문 댓글 전부, "comments-active" 는 지금 고른 것.
//   본문 DOM 을 바꾸지 않는다. 하이라이트를 누르면 caret 위치로 어느 thread 인지 찾아 패널을 연다.
// - 선택 버튼 "선택한 글에 댓글 달기": 본문(<main>)에서 글을 고르면 그 아래에 뜬다. <main> 바로 뒤에 넣어
//   키보드로도 Tab 으로 닿는다. 누르면 패널에 새 댓글 상자가 열린다.
// - 패널 aside[aria-label="댓글"]: 본문 댓글 목록과 새 댓글 상자. 데스크톱은 오른쪽 레일, 좁은 화면은 하단 시트(CSS).
// - 섹션: 로그인 상태, 글 전체 댓글, 원문을 찾을 수 없는 댓글(저장한 문장이 본문에서 사라진 것).
// 사용자가 쓴 글은 모두 textContent 로만 넣는다(innerHTML 없음).
import type {
  Anchor,
  ApiError,
  Comment,
  MeResponse,
  Thread,
  ThreadPage,
  User,
} from "../../../comments/src/contract";
import {
  domRange,
  indexText,
  locate,
  quote,
  textOffset,
  type TreeNode,
} from "../../lib/anchor";
import {
  FRESH_KEY,
  TOKEN_KEY,
  type Mounted,
  type MountOptions,
} from "./shared";

const HIGHLIGHT = "comments";
const ACTIVE = "comments-active";
const SELECT_LABEL = "선택한 글에 댓글 달기";

const MESSAGES: Record<string, string> = {
  account_too_new:
    "가입한 지 7일이 지나지 않은 GitHub 계정은 댓글을 쓸 수 없습니다.",
  banned: "댓글을 쓸 수 없는 계정입니다.",
  rate_limited: "댓글을 너무 자주 썼습니다. 잠시 뒤에 다시 시도해 주세요.",
  readonly: "지금은 댓글을 읽기만 할 수 있습니다.",
  invalid_body: "댓글은 1자 이상 4000자 이하로 써 주세요.",
  unauthorized: "다시 로그인해 주세요.",
  session_expired: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
  oauth_failed: "로그인하지 못했습니다.",
  not_configured: "지금은 로그인할 수 없습니다.",
};
const message = (code: string) =>
  MESSAGES[code] ?? "요청을 처리하지 못했습니다.";

type Child = Node | string | null | false | undefined;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string | boolean | EventListener>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "function") el.addEventListener(key, value);
    else if (value === true) el.setAttribute(key, "");
    else if (typeof value === "string") el.setAttribute(key, value);
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

const fill = (el: Element, ...children: Child[]) =>
  el.replaceChildren(...children.filter((c): c is Node | string => !!c));

const button = (label: string, onClick: () => void, cls = "") =>
  h("button", { type: "button", class: cls, click: onClick }, label);

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

const writeToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 이번 페이지에서만 쓴다.
  }
};

export function mount(host: HTMLElement, options: MountOptions): Mounted {
  const { api, post, signal } = options;
  const apiOrigin = new URL(api).origin;
  const main = document.querySelector("main");
  const highlights = "highlights" in CSS ? CSS.highlights : null;

  let threads: Thread[] = [...options.page.threads];
  let token = readToken();
  let me: User | null = null;
  let banned = false;
  let status = options.authError ? message(options.authError) : "";
  let activeId: string | null = null;
  let panelOpen = false;
  let pending: Anchor | null = null;
  let editing: string | null = null;
  const drafts = new Map<string, string>();
  let ranges = new Map<string, Range>();

  const section = h("section", {
    class: "cm-root",
    "aria-labelledby": "comments-title",
  });
  const panel = h("aside", {
    class: "cm-panel",
    "aria-label": "댓글",
    hidden: true,
  });
  const select = h(
    "button",
    {
      type: "button",
      class: "cm-select",
      hidden: true,
      mousedown: (e) => e.preventDefault(),
    },
    SELECT_LABEL,
  );
  host.replaceChildren(section, panel);
  main?.after(select);

  // ---- 본문 위치 ----
  const index = () => indexText(main as unknown as TreeNode);

  function locateAll() {
    ranges = new Map();
    if (!main) return;
    const idx = index();
    for (const thread of threads) {
      if (!thread.anchor) continue;
      const found = locate(idx.text, thread.anchor);
      const points = found && domRange(idx, found.start, found.end);
      if (!points) continue;
      const range = new Range();
      range.setStart(points.startNode as Node, points.startOffset);
      range.setEnd(points.endNode as Node, points.endOffset);
      ranges.set(thread.id, range);
    }
  }

  function paint() {
    if (!highlights) return;
    const all = new Highlight();
    const active = new Highlight();
    active.priority = 1;
    for (const thread of threads) {
      const range = ranges.get(thread.id);
      if (!range || thread.resolved) continue;
      all.add(range);
      if (thread.id === activeId) active.add(range);
    }
    highlights.set(HIGHLIGHT, all);
    highlights.set(ACTIVE, active);
  }

  // ---- API ----
  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T | null> {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    try {
      const response = await fetch(api + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        cache: "no-store",
      });
      if (response.status === 204) return null;
      const data = await response.json();
      if (response.ok) return data as T;
      const code = (data as ApiError).error?.code ?? "internal";
      if (code === "unauthorized" || code === "session_expired") {
        token = null;
        me = null;
        writeToken(null);
      }
      throw new Error(code);
    } catch (error) {
      if (signal.aborted) throw error;
      status = message(error instanceof Error ? error.message : "");
      render();
      throw error;
    }
  }

  const write = async <T>(method: string, path: string, body?: unknown) => {
    const result = await call<T>(method, path, body);
    try {
      sessionStorage.setItem(FRESH_KEY + post, String(Date.now()));
    } catch {
      // 다음 새로 고침에서 30초 캐시가 보일 수 있을 뿐이다.
    }
    status = "";
    return result;
  };

  async function loadMe() {
    if (!token) {
      me = null;
      return render();
    }
    const result = await call<MeResponse>("GET", "/v1/me").catch(() => null);
    me = result?.user ?? null;
    banned = result?.banned ?? false;
    render();
  }

  async function loadRest(cursor: string | null) {
    while (cursor && !signal.aborted) {
      const page = await call<ThreadPage>(
        "GET",
        `/v1/posts/${encodeURIComponent(post)}/threads?limit=100&cursor=${encodeURIComponent(cursor)}`,
      ).catch(() => null);
      if (!page) return;
      threads = threads.concat(page.threads);
      cursor = page.nextCursor;
    }
    refresh();
  }

  function login() {
    const url = (mode: string) =>
      `${api}/v1/auth/start?${new URLSearchParams({ origin: location.origin, mode, return_to: location.href })}`;
    const popup = window.open(
      url("popup"),
      "comments-login",
      "popup,width=520,height=680",
    );
    if (!popup) location.assign(url("redirect"));
  }

  async function logout() {
    await call("POST", "/v1/auth/logout").catch(() => null);
    token = null;
    me = null;
    writeToken(null);
    render();
  }

  const replace = (thread: Thread) => {
    threads = threads.map((t) => (t.id === thread.id ? thread : t));
  };
  const replaceComment = (comment: Comment) => {
    threads = threads.map((t) =>
      t.id === comment.threadId
        ? {
            ...t,
            comments: t.comments.map((c) =>
              c.id === comment.id ? comment : c,
            ),
          }
        : t,
    );
  };

  async function createThread(anchor: Anchor | null, key: string) {
    const body = drafts.get(key) ?? "";
    const thread = await write<Thread>(
      "POST",
      `/v1/posts/${encodeURIComponent(post)}/threads`,
      {
        anchor,
        body,
      },
    ).catch(() => null);
    if (!thread) return;
    drafts.delete(key);
    threads = [...threads, thread];
    if (anchor) {
      pending = null;
      activeId = thread.id;
    }
    refresh();
  }

  async function reply(thread: Thread) {
    const key = `reply:${thread.id}`;
    const comment = await write<Comment>(
      "POST",
      `/v1/threads/${thread.id}/comments`,
      {
        body: drafts.get(key) ?? "",
      },
    ).catch(() => null);
    if (!comment) return;
    drafts.delete(key);
    threads = threads.map((t) =>
      t.id === thread.id ? { ...t, comments: [...t.comments, comment] } : t,
    );
    render();
  }

  async function resolve(thread: Thread) {
    const next = await write<Thread>(
      "POST",
      `/v1/threads/${thread.id}/resolve`,
      {
        resolved: !thread.resolved,
      },
    ).catch(() => null);
    if (next) replace(next);
    refresh();
  }

  async function edit(comment: Comment) {
    const key = `edit:${comment.id}`;
    const next = await write<Comment>("PATCH", `/v1/comments/${comment.id}`, {
      body: drafts.get(key) ?? comment.body,
    }).catch(() => null);
    if (!next) return;
    drafts.delete(key);
    editing = null;
    replaceComment(next);
    render();
  }

  async function remove(comment: Comment) {
    if (!confirm("이 댓글을 지울까요?")) return;
    const next = await write<Comment>(
      "DELETE",
      `/v1/comments/${comment.id}`,
    ).catch(() => null);
    if (next) replaceComment(next);
    render();
  }

  // ---- 그리기 ----
  const canWrite = () => me !== null && !banned;

  function editor(
    key: string,
    field: string,
    label: string,
    submit: () => void,
    cancel?: () => void,
    initial = "",
  ) {
    const area = h("textarea", {
      "aria-label": field,
      maxlength: "4000",
      "data-key": key,
      input: () => drafts.set(key, area.value),
    });
    area.value = drafts.get(key) ?? initial;
    return h(
      "form",
      { submit: (e) => (e.preventDefault(), submit()) },
      area,
      h(
        "div",
        { class: "cm-bar" },
        h("button", { type: "submit" }, label),
        cancel && button("취소", cancel),
      ),
    );
  }

  const loginButton = () => button("GitHub로 로그인", login);

  function commentView(comment: Comment) {
    const mine = me?.id === comment.author.id;
    const date = new Date(comment.createdAt).toLocaleDateString("ko-KR");
    const body =
      editing === comment.id
        ? editor(
            `edit:${comment.id}`,
            "고칠 내용",
            "저장",
            () => void edit(comment),
            () => ((editing = null), render()),
            comment.body,
          )
        : h(
            "p",
            { class: "cm-body" },
            comment.deleted ? "삭제된 댓글입니다." : comment.body,
          );
    return h(
      "li",
      { class: "cm-comment" },
      h(
        "div",
        { class: "cm-meta" },
        `${comment.author.login} · ${date}${comment.editedAt && !comment.deleted ? " · 수정됨" : ""}`,
      ),
      body,
      !comment.deleted &&
        editing !== comment.id &&
        (mine || me?.isOwner) &&
        h(
          "div",
          { class: "cm-bar" },
          mine &&
            button("수정", () => ((editing = comment.id), render()), "cm-link"),
          button("삭제", () => void remove(comment), "cm-link"),
        ),
    );
  }

  function threadView(thread: Thread, inPanel: boolean) {
    const range = ranges.get(thread.id);
    const opener = thread.comments[0]?.author.id;
    const card = h(
      "li",
      {
        class: "cm-thread",
        "data-thread": thread.id,
        "data-active": thread.id === activeId,
        "data-resolved": thread.resolved,
      },
      thread.anchor &&
        h("blockquote", { class: "cm-quote" }, thread.anchor.exact),
      h(
        "div",
        { class: "cm-bar" },
        thread.resolved && h("span", { class: "cm-muted" }, "해결됨"),
        inPanel &&
          range &&
          button("본문에서 보기", () => show(thread.id, true), "cm-link"),
        me &&
          (me.id === opener || me.isOwner) &&
          button(
            thread.resolved ? "다시 열기" : "해결",
            () => void resolve(thread),
            "cm-link",
          ),
      ),
      h("ul", { class: "cm-list" }, ...thread.comments.map(commentView)),
      canWrite() &&
        editor(
          `reply:${thread.id}`,
          "답글 내용",
          "답글 달기",
          () => void reply(thread),
        ),
    );
    return card;
  }

  function render() {
    if (signal.aborted) return;
    const focused = document.activeElement?.getAttribute("data-key");
    const inline = threads.filter((t) => t.anchor && ranges.has(t.id));
    inline.sort((a, b) =>
      ranges
        .get(a.id)!
        .compareBoundaryPoints(Range.START_TO_START, ranges.get(b.id)!),
    );
    const whole = threads.filter((t) => !t.anchor);
    const orphans = threads.filter((t) => t.anchor && !ranges.has(t.id));

    fill(
      section,
      h("h2", { id: "comments-title" }, "댓글"),
      h("p", { class: "cm-status", role: "status" }, status),
      bar(inline.length),
      h("ul", { class: "cm-list" }, ...whole.map((t) => threadView(t, false))),
      canWrite()
        ? editor(
            "new",
            "댓글 내용",
            "댓글 달기",
            () => void createThread(null, "new"),
          )
        : !me &&
            h(
              "p",
              { class: "cm-muted" },
              "로그인하면 글에 댓글을 달 수 있습니다. 본문의 글을 골라 그 문장에 댓글을 달 수도 있습니다.",
            ),
      orphans.length > 0 && h("h3", {}, "원문을 찾을 수 없는 댓글"),
      orphans.length > 0 &&
        h(
          "ul",
          { class: "cm-list" },
          ...orphans.map((t) => threadView(t, false)),
        ),
    );

    panel.hidden = !panelOpen;
    if (panelOpen)
      fill(
        panel,
        h(
          "div",
          { class: "cm-panel-head" },
          h("h2", {}, "본문 댓글"),
          button("닫기", close),
        ),
        pending &&
          h(
            "div",
            { class: "cm-thread" },
            h("blockquote", { class: "cm-quote" }, pending.exact),
            canWrite()
              ? editor(
                  "pending",
                  "댓글 내용",
                  "댓글 달기",
                  () => void createThread(pending, "pending"),
                  () => ((pending = null), render()),
                )
              : me
                ? h("p", { class: "cm-muted" }, message("banned"))
                : loginButton(),
          ),
        inline.length > 0
          ? h(
              "ul",
              { class: "cm-list" },
              ...inline.map((t) => threadView(t, true)),
            )
          : !pending &&
              h("p", { class: "cm-muted" }, "본문에 단 댓글이 없습니다."),
      );
    if (focused)
      (
        host.querySelector(`[data-key="${focused}"]`) as HTMLElement | null
      )?.focus();
  }

  function bar(inlineCount: number) {
    const row = h("div", { class: "cm-bar" });
    if (me)
      row.append(
        h("span", { class: "cm-muted" }, `${me.login}(으)로 로그인함`),
        button("로그아웃", () => void logout(), "cm-link"),
      );
    else row.append(loginButton());
    if (inlineCount > 0)
      row.append(button(`본문 댓글 ${inlineCount}개 보기`, () => open(null)));
    return row;
  }

  function refresh() {
    locateAll();
    paint();
    render();
  }

  function open(threadId: string | null) {
    panelOpen = true;
    if (threadId) activeId = threadId;
    paint();
    render();
    const target =
      (threadId && panel.querySelector(`[data-thread="${threadId}"]`)) ||
      panel.querySelector("textarea") ||
      panel.querySelector("button");
    (target as HTMLElement | null)?.scrollIntoView?.({ block: "nearest" });
    if (pending) panel.querySelector("textarea")?.focus();
    else panel.querySelector<HTMLElement>("button")?.focus();
  }

  function close() {
    panelOpen = false;
    pending = null;
    activeId = null;
    paint();
    render();
  }

  function show(threadId: string, scroll: boolean) {
    activeId = threadId;
    paint();
    render();
    const range = ranges.get(threadId);
    if (scroll && range)
      range.startContainer.parentElement?.scrollIntoView({ block: "center" });
  }

  // ---- 선택 ----
  let selectTimer = 0;
  function onSelection() {
    clearTimeout(selectTimer);
    selectTimer = window.setTimeout(() => {
      const selection = getSelection();
      const range =
        selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      let anchor: Anchor | null = null;
      if (
        main &&
        range &&
        !range.collapsed &&
        main.contains(range.commonAncestorContainer)
      ) {
        const idx = index();
        const s = textOffset(
          idx,
          range.startContainer as unknown as TreeNode,
          range.startOffset,
          "start",
        );
        const e = textOffset(
          idx,
          range.endContainer as unknown as TreeNode,
          range.endOffset,
          "end",
        );
        if (s !== null && e !== null) anchor = quote(idx.text, s, e);
      }
      if (!anchor || !range) {
        if (document.activeElement !== select) select.hidden = true;
        return;
      }
      selected = anchor;
      const rect = range.getBoundingClientRect();
      select.hidden = false;
      select.style.top = `${rect.bottom + scrollY + 6}px`;
      select.style.left = `${Math.max(8, Math.min(rect.left + scrollX, scrollX + innerWidth - select.offsetWidth - 8))}px`;
    }, 120);
  }
  let selected: Anchor | null = null;
  select.addEventListener("click", () => {
    if (!selected) return;
    pending = selected;
    select.hidden = true;
    getSelection()?.removeAllRanges();
    open(null);
  });

  // ---- 하이라이트 누르기 ----
  function onClick(event: MouseEvent) {
    if (!getSelection()?.isCollapsed || ranges.size === 0) return;
    const doc = document as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
    };
    let node: Node | null = null;
    let offset = 0;
    const position = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (position) ({ offsetNode: node, offset } = position);
    else {
      const caret = document.caretRangeFromPoint?.(
        event.clientX,
        event.clientY,
      );
      if (caret) ({ startContainer: node, startOffset: offset } = caret);
    }
    if (!node) return;
    for (const thread of threads) {
      const range = ranges.get(thread.id);
      if (range && !thread.resolved && range.isPointInRange(node, offset)) {
        open(thread.id);
        return;
      }
    }
  }

  // ---- 연결 ----
  const listen = { signal };
  document.addEventListener("selectionchange", onSelection, listen);
  main?.addEventListener("click", onClick, listen);
  addEventListener(
    "message",
    (event) => {
      const data = event.data as {
        type?: string;
        token?: string;
        error?: string;
      } | null;
      if (event.origin !== apiOrigin || data?.type !== "comments:auth") return;
      if (data.token) {
        token = data.token;
        writeToken(token);
        status = "";
        void loadMe();
      } else {
        status = message(data.error ?? "");
        render();
      }
    },
    listen,
  );
  addEventListener(
    "storage",
    (event) => {
      if (event.key !== TOKEN_KEY) return;
      token = event.newValue;
      void loadMe();
    },
    listen,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && panelOpen) close();
    },
    listen,
  );

  refresh();
  void loadMe();
  void loadRest(options.page.nextCursor);
  onSelection();

  return {
    destroy() {
      clearTimeout(selectTimer);
      highlights?.delete(HIGHLIGHT);
      highlights?.delete(ACTIVE);
      select.remove();
      panel.remove();
    },
  };
}
