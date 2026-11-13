// Owned by S8.4. A pass-through today: sequence() with no handlers just calls next().
// Add handlers to the sequence so that other middleware can be appended later.
import { sequence } from "astro:middleware";

export const onRequest = sequence();
