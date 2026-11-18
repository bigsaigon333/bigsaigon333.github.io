// 댓글 API(comments/ 워커)의 출처. CSP(config/csp.mjs 의 connect-src)와 댓글 컴포넌트(src/components/Comments.astro 의
// data-api)가 모두 이 값 하나를 쓴다. 둘이 어긋나면 브라우저가 요청을 막고 댓글이 조용히 숨는다.
//
// 값은 다른 공개 값처럼 config/.env.<mode> 의 PUBLIC_COMMENTS_API 에 있고(config/env.mjs 의 스키마가 같은 이름을 검사한다),
// 같은 이름의 환경 변수가 파일보다 우선한다. 이 모듈은 astro.config 를 읽을 때(csp 통합) 불리므로 astro:env 를 쓸 수 없다.
// 그래서 Vite 의 loadEnv 로 같은 파일을 같은 규칙으로 읽는다. 모드는 NODE_ENV: Astro 는 설정을 읽기 전에
// build 면 production, dev 면 development 로 정하고(core/util.js ensureProcessNodeEnv), Vitest 는 test 로 정한다.
import { loadEnv } from "vite";

import { envDir } from "./env.mjs";

const NAME = "PUBLIC_COMMENTS_API";

/**
 * 주소를 출처(https://host[:port])로 바꾼다. https 만, 로컬 개발용으로 http://localhost·127.0.0.1 만 받는다.
 * 경로·쿼리·fragment 가 있으면 거부한다(CSP 의 출처와 fetch 주소가 같은 글자여야 한다).
 * @param {string | undefined} value
 */
export function parseCommentsApi(value) {
  if (!value) throw new Error(`${NAME} 이(가) 비었다(config/.env.<mode>)`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${NAME}=${value}: URL 이 아니다`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!(url.protocol === "https:" || (local && url.protocol === "http:")))
    throw new Error(`${NAME}=${value}: https 만 받는다(로컬은 http 도)`);
  if (value.replace(/\/$/, "") !== url.origin)
    throw new Error(`${NAME}=${value}: 경로 없이 출처만 적는다(${url.origin})`);
  return url.origin;
}

const mode = process.env.NODE_ENV || "production";

/** 댓글 API 출처. 끝에 / 가 없다. */
export const COMMENTS_API = parseCommentsApi(loadEnv(mode, envDir, NAME)[NAME]);
