// Types of what src/s84/middleware.ts puts on `context.locals` for /s84 requests.
declare namespace App {
  interface Locals {
    s84?: {
      requestId: string;
      greeting: string;
      /** Set when the ko page was missing and the en page was served instead. */
      requestedLocale?: string;
    };
  }
}
