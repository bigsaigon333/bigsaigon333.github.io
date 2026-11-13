// The S8.5 dev toolbar app: renders a window into its canvas (a ShadowRoot) and pings the
// server through the integration's `toolbar` helpers.
import { defineToolbarApp } from "astro/toolbar";

export default defineToolbarApp({
  init(canvas, app, server) {
    const win = document.createElement("astro-dev-toolbar-window");
    const out = document.createElement("p");
    out.dataset.s85Pong = "";
    out.textContent = "waiting for the server…";
    win.append(out);
    canvas.append(win);

    server.on<{ initialized: number }>("s85:pong", ({ initialized }) => {
      out.textContent = `pong from server, initialized ${initialized}`;
      app.toggleNotification({ state: true, level: "info" });
    });
    server.send("s85:ping", { at: Date.now() });
  },
});
