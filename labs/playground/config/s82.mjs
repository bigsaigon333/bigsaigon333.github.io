// Config seam of demo S8.2: sessions for the session-backed cart.
// Without `session`, @astrojs/node would add a filesystem driver (node_modules/.astro/sessions).
// An in-memory LRU keeps the lab's state inside the server process like S8.1's item store.
import { sessionDrivers } from "astro/config";

export default {
  session: {
    driver: sessionDrivers.lruCache({ max: 500 }),
    // Path=/ (the default): RPC calls go to /_actions/…, outside /s82. Secure is off because the
    // lab serves plain http://127.0.0.1; HttpOnly is always on for the session cookie.
    cookie: { name: "s82-session", sameSite: "lax", secure: false },
    ttl: 60 * 60,
  },
};
