// Owned by S8.4. Handlers run first-in, last-out; each S8.4 handler only touches /s84 URLs.
// Append further handlers to the sequence.
import { sequence } from "astro:middleware";

import { koFallback, timing, whoami } from "./s84/middleware";

export const onRequest = sequence(timing, whoami, koFallback);
