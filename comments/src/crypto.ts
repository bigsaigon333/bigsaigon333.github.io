export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** 32바이트 난수를 base64url 로(43자). 세션 토큰, OAuth state, PKCE verifier 에 쓴다. */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return new Uint8Array(digest);
}

export async function sha256Hex(text: string): Promise<string> {
  return [...(await sha256(text))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** RFC 7636 S256: BASE64URL(SHA256(ASCII(code_verifier))). */
export async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(await sha256(verifier));
}
