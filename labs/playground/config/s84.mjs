// Config seam of demo S8.4: config redirects and i18n.
//
// i18n is global in Astro. `routing: "manual"` turns off Astro's own i18n middleware, so routes of
// the other demos are never checked or redirected; and `fallback` is deliberately not set, because
// Astro would then add a `/ko/...` fallback route for EVERY page (including /s81 … /s85). The ko→en
// fallback is done by src/s84/middleware.ts for /ko/s84/** only.
export default {
  i18n: {
    locales: ["en", "ko"],
    defaultLocale: "en",
    routing: "manual",
  },
  redirects: {
    "/s84/old": "/s84/new",
    "/s84/moved": { status: 302, destination: "/s84/new" },
    "/s84/legacy/[page]": "/s84/posts/[page]",
  },
};
