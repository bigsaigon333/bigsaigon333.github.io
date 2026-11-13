// Config seam of demo S8.3: Preact renders the client islands (src/s83/*.tsx).
// It is the only JSX framework in the lab, so it needs no `include`.
import preact from "@astrojs/preact";

export default {
  integrations: [preact()],
};
