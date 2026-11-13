// S8.2: the cart lives in the visitor's session (one per s82-session cookie), not in a cookie.
// Keys are prefixed with "s82:" because every demo shares the one session per visitor.
import type { AstroSession } from "astro";

export const ITEMS = ["apple", "pear", "plum"] as const;
export type Item = (typeof ITEMS)[number];
export type Cart = Partial<Record<Item, number>>;

export const CART_KEY = "s82:cart";
export const VISITS_KEY = "s82:visits";

export async function readCart(
  session: AstroSession | undefined,
): Promise<Cart> {
  return (await session?.get(CART_KEY)) ?? {};
}

export const encodeCart = (cart: Cart) =>
  encodeURIComponent(JSON.stringify(cart));
