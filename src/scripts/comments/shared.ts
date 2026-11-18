// 로더(loader.ts)와 UI(ui.ts)가 함께 쓰는 이름과 타입.
import type { ThreadPage } from "../../../comments/src/contract";

/** localStorage 의 bearer 토큰 키. */
export const TOKEN_KEY = "comments-token";
/** sessionStorage: 이 글에 방금 쓴 시각. 30초 안에는 목록을 브라우저 캐시 없이 다시 받는다. */
export const FRESH_KEY = "comments-fresh:";

export interface MountOptions {
  api: string;
  post: string;
  page: ThreadPage;
  /** 리다이렉트 로그인이 돌려준 오류 코드. */
  authError?: string;
  /** 로더의 수명. abort 되면 UI 도 멈춘다. */
  signal: AbortSignal;
}

export interface Mounted {
  destroy(): void;
}
