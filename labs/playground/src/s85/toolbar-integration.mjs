// Registers the S8.5 dev toolbar app and answers its ping over Vite's HMR channel.
// Only `astro dev` runs these hooks' toolbar parts; the build output has no toolbar.

/** @returns {import("astro").AstroIntegration} */
export default function s85Toolbar() {
  let initialized = 0;
  return {
    name: "s85-toolbar",
    hooks: {
      "astro:config:setup": ({ addDevToolbarApp }) => {
        addDevToolbarApp({
          id: "s85-lab",
          name: "S8.5 lab",
          icon: "🧪",
          entrypoint: new URL("./toolbar-app.ts", import.meta.url),
        });
      },
      "astro:server:setup": ({ toolbar }) => {
        // Vite's `connection` event fires before apps exist; wait for the app instead.
        toolbar.onAppInitialized("s85-lab", () => {
          initialized += 1;
        });
        toolbar.on("s85:ping", () => {
          toolbar.send("s85:pong", { initialized });
        });
      },
    },
  };
}
