// 워커와 클라이언트(src/scripts/comments/**)가 함께 따르는 API 계약.
// 이 파일은 런타임 코드 없이 타입과 상수만 둔다. 클라이언트는 이 파일을 그대로 import 해도 된다.

/** API 경로 앞부분. 호환되지 않게 바꾸면 /v2 를 새로 연다. */
export const API_PREFIX = "/v1";

/** 본문 길이 제한(코드 포인트 수, 앞뒤 공백을 뺀 뒤). */
export const BODY_MIN = 1;
export const BODY_MAX = 4000;

/** TextQuote prefix/suffix 최대 길이, exact 최대 길이. */
export const QUOTE_CONTEXT_MAX = 32;
export const QUOTE_EXACT_MAX = 1000;

/** 쓰기 요청 수 제한: 사용자당 RATE_WINDOW_MS 안에 RATE_LIMIT 회. */
export const RATE_LIMIT = 10;
export const RATE_WINDOW_MS = 10 * 60 * 1000;

/** 가입한 지 이 기간이 안 된 GitHub 계정은 로그인할 수 없다. */
export const MIN_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** 세션(bearer 토큰) 수명. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 글 목록 한 페이지의 thread 수. */
export const PAGE_DEFAULT = 50;
export const PAGE_MAX = 100;

/** 리다이렉트 방식 로그인이 돌아올 때 쓰는 URL fragment 키. */
export const TOKEN_FRAGMENT = "comments-token";
export const ERROR_FRAGMENT = "comments-error";

/** 팝업이 window.opener 로 보내는 메시지의 type. */
export const AUTH_MESSAGE_TYPE = "comments:auth";

export interface User {
  /** GitHub 숫자 id. */
  id: number;
  login: string;
  avatarUrl: string;
  /** OWNER_GITHUB_ID 와 같으면 true(관리자). */
  isOwner: boolean;
}

/** W3C Web Annotation TextQuoteSelector + TextPositionSelector. */
export interface Anchor {
  exact: string;
  prefix: string;
  suffix: string;
  /** 본문 텍스트 안의 위치(코드 유닛). start < end. */
  start: number;
  end: number;
}

export interface Comment {
  id: string;
  threadId: string;
  author: User;
  /** 평문. 지운 댓글은 빈 문자열. */
  body: string;
  /** ISO 8601 */
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
}

export interface Thread {
  id: string;
  postId: string;
  /** 글 전체에 단 thread 는 null. */
  anchor: Anchor | null;
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
  /** 오래된 순. 첫 댓글이 thread 를 연 댓글이다. */
  comments: Comment[];
}

export interface ThreadPage {
  threads: Thread[];
  /** 다음 페이지가 없으면 null. `?cursor=` 로 넘긴다. */
  nextCursor: string | null;
}

export interface Health {
  ok: true;
  mode: Mode;
}

export type Mode = "readwrite" | "readonly";

export type ErrorCode =
  | "bad_request"
  | "invalid_body"
  | "invalid_anchor"
  | "invalid_post"
  | "unauthorized"
  | "session_expired"
  | "forbidden"
  | "banned"
  | "account_too_new"
  | "not_found"
  | "method_not_allowed"
  | "gone"
  | "origin_not_allowed"
  | "rate_limited"
  | "readonly"
  | "invalid_state"
  | "oauth_failed"
  | "not_configured"
  | "internal";

/** 2xx 가 아닌 모든 응답의 본문. */
export interface ApiError {
  error: { code: ErrorCode; message: string };
}

export interface CreateThreadRequest {
  anchor?: Anchor | null;
  body: string;
}

export interface CreateCommentRequest {
  body: string;
}

export interface EditCommentRequest {
  body: string;
}

export interface ResolveRequest {
  resolved: boolean;
}

export interface TestLoginRequest {
  id: number;
  login: string;
  /** GitHub 가입 시각(ISO). 없으면 아주 오래된 계정으로 본다. 계정 나이 규칙을 시험할 때 쓴다. */
  createdAt?: string;
}

export interface MeResponse {
  user: User;
  /** 차단된 사용자는 읽기만 할 수 있다. */
  banned: boolean;
}

export interface BanRequest {
  /** true 면 그 사용자의 댓글을 모두 soft delete 한다. */
  purge?: boolean;
}

export interface TokenResponse {
  token: string;
}

/** 팝업 로그인이 끝나면 window.opener.postMessage(msg, origin) 로 보내는 값. */
export type AuthMessage =
  | { type: typeof AUTH_MESSAGE_TYPE; token: string }
  | { type: typeof AUTH_MESSAGE_TYPE; error: ErrorCode };
