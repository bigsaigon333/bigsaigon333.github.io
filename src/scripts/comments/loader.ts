// <post-comments> 로더. 모든 글 페이지에 정적으로 실리므로 작게 둔다(UI 는 ui.ts 를 동적 import).
//
// 1. 로그인 리다이렉트에서 돌아왔으면 fragment(#comments-token=… 또는 #comments-error=…)를 읽어 지운다.
// 2. idle 때 thread 목록을 받는다(4초 제한). 실패하면 hidden 그대로 둔다(콘솔에 아무것도 쓰지 않는다).
// 3. 성공하면 hidden 을 풀고, thread 가 있거나 로그인에서 돌아왔으면 바로, 아니면 본문을 선택하거나 이 엘리먼트가
//    화면 가까이 올 때 UI 를 불러온다.
import type { ThreadPage } from "../../../comments/src/contract";
import {
  FRESH_KEY,
  TOKEN_KEY,
  type Mounted,
  type MountOptions,
} from "./shared";

const TIMEOUT_MS = 4000;
const FRESH_MS = 30_000;

function store(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // 저장소를 쓸 수 없는 창(사생활 보호 등)에서는 이번 페이지에서만 쓴다.
  }
}

/** 리다이렉트 로그인의 결과를 주소에서 꺼내고 지운다. */
function takeFragment(): { token?: string; error?: string } | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("comments-token");
  const error = params.get("comments-error");
  if (token === null && error === null) return null;
  history.replaceState(history.state, "", location.pathname + location.search);
  if (token) store(() => localStorage, TOKEN_KEY, token);
  return { token: token ?? undefined, error: error ?? undefined };
}

function fresh(post: string): boolean {
  try {
    return (
      Date.now() - Number(sessionStorage.getItem(FRESH_KEY + post)) < FRESH_MS
    );
  } catch {
    return false;
  }
}

class PostComments extends HTMLElement {
  #abort: AbortController | null = null;
  #ui: Mounted | null = null;

  connectedCallback() {
    const { api, post } = this.dataset;
    if (!api || !post) return;
    const abort = (this.#abort = new AbortController());
    const { signal } = abort;
    const auth = takeFragment();

    const run = async () => {
      let page: ThreadPage;
      try {
        const response = await fetch(
          `${api}/v1/posts/${encodeURIComponent(post)}/threads?limit=100`,
          {
            signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
            cache: fresh(post) ? "no-cache" : "default",
          },
        );
        if (!response.ok) return;
        page = await response.json();
        if (!Array.isArray(page.threads)) return;
      } catch {
        return;
      }
      if (signal.aborted) return;
      this.hidden = false;

      let started = false;
      const load = () => {
        if (started || signal.aborted) return;
        started = true;
        observer.disconnect();
        const options: MountOptions = {
          api,
          post,
          page,
          authError: auth?.error,
          signal,
        };
        import("./ui").then(
          (ui) => {
            if (!signal.aborted) this.#ui = ui.mount(this, options);
          },
          () => {
            this.hidden = true;
          },
        );
      };
      const observer = new IntersectionObserver(
        (entries) => entries.some((e) => e.isIntersecting) && load(),
        { rootMargin: "400px 0px" },
      );
      if (page.threads.length > 0 || auth) return load();
      observer.observe(this);
      signal.addEventListener("abort", () => observer.disconnect());
      document.addEventListener(
        "selectionchange",
        () => {
          const selection = getSelection();
          const body = document.querySelector("main");
          if (
            selection &&
            !selection.isCollapsed &&
            body?.contains(selection.anchorNode)
          )
            load();
        },
        { signal },
      );
    };

    if ("requestIdleCallback" in window)
      requestIdleCallback(() => void run(), { timeout: 3000 });
    else setTimeout(() => void run(), 200);
    document.addEventListener(
      "astro:before-swap",
      () => this.disconnectedCallback(),
      {
        signal,
        once: true,
      },
    );
  }

  disconnectedCallback() {
    this.#abort?.abort();
    this.#abort = null;
    this.#ui?.destroy();
    this.#ui = null;
  }
}

if (!customElements.get("post-comments"))
  customElements.define("post-comments", PostComments);
