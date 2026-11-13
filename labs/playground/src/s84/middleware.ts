// S8.4 handlers, appended to the sequence in src/middleware.ts. Each one acts only on /s84 and
// /ko/s84 URLs and calls next() untouched for every other demo.
import { defineMiddleware } from "astro:middleware";

const inScope = (pathname: string) => /^\/(ko\/)?s84(\/|$)/.test(pathname);

// Sets locals for the page and, on the way out, a request id and a Server-Timing header.
export const timing = defineMiddleware(async (context, next) => {
  if (!inScope(context.url.pathname)) return next();
  const started = performance.now();
  // context.rewrite() runs the whole sequence again with the same locals: keep the first values.
  context.locals.s84 ??= {
    requestId: crypto.randomUUID(),
    greeting: "set by middleware",
  };
  const { requestId } = context.locals.s84;
  const response = await next();
  if (context.isPrerendered) return response;
  // Redirect responses (Response.redirect) have immutable headers: copy before setting.
  const out = new Response(response.body, response);
  out.headers.set("x-s84-request-id", requestId);
  out.headers.set(
    "server-timing",
    `s84;dur=${(performance.now() - started).toFixed(1)}`,
  );
  return out;
});

// /s84/whoami has no page: next(url) renders /s84/locals in place (the URL stays /s84/whoami)
// without running the middleware again, so the locals set above are the ones the page reads.
// The target must be on demand: a prerendered page (e.g. /s84/posts/1) is not in the server
// bundle and the rewrite fails with a 500.
export const whoami = defineMiddleware((context, next) => {
  if (context.url.pathname.replace(/\/$/, "") === "/s84/whoami")
    return next("/s84/locals");
  return next();
});

// ko→en fallback for /ko/s84/** only: when the ko page does not exist, render the en page
// under the same URL. Astro's own `i18n.fallback` would add /ko copies of every demo's pages.
export const koFallback = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (!pathname.startsWith("/ko/s84/")) return next();
  const response = await next();
  if (response.status !== 404) return response;
  if (context.locals.s84) context.locals.s84.requestedLocale = "ko";
  const fallback = await context.rewrite(pathname.slice("/ko".length));
  if (fallback.status === 404) return fallback;
  const out = new Response(fallback.body, fallback);
  out.headers.set("x-s84-fallback", "ko->en");
  return out;
});
