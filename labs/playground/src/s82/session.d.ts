// S8.2: types for Astro.session.get/set. Compile-time only; devalue serializes the values.
declare namespace App {
  interface SessionData {
    "s82:cart": import("./cart").Cart;
    "s82:visits": number;
  }
}
