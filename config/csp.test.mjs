import { describe, expect, it } from "vitest";

import { styleHashes, withStyleHashes } from "./csp.mjs";

const meta = (style) =>
  `<meta http-equiv="content-security-policy" content="default-src 'self';script-src 'self' 'sha256-SCRIPT=';style-src ${style};style-src-attr 'unsafe-inline'">`;

describe("styleHashes", () => {
  it("style-src 의 해시만 읽는다(script-src·style-src-attr 는 보지 않는다)", () => {
    expect(styleHashes(meta("'self' 'sha256-A=' 'sha256-B+/='"))).toEqual([
      "'sha256-A='",
      "'sha256-B+/='",
    ]);
    expect(styleHashes(meta("'self'"))).toEqual([]);
  });
});

describe("withStyleHashes", () => {
  it("style-src 의 해시를 주어진 목록으로 바꾸고 해시가 아닌 출처와 다른 지시어는 그대로 둔다", () => {
    const out = withStyleHashes(meta("'self' 'sha256-A='"), [
      "'sha256-A='",
      "'sha256-C='",
    ]);
    expect(out).toBe(meta("'self' 'sha256-A=' 'sha256-C='"));
    expect(out).toContain("script-src 'self' 'sha256-SCRIPT='");
    expect(out).toContain("style-src-attr 'unsafe-inline'");
  });

  it("페이지마다 다른 해시도 같은 목록이면 같은 정책이 된다", () => {
    const hashes = ["'sha256-A='", "'sha256-B='"];
    expect(withStyleHashes(meta("'self' 'sha256-A='"), hashes)).toBe(
      withStyleHashes(meta("'self' 'sha256-B='"), hashes),
    );
  });
});
