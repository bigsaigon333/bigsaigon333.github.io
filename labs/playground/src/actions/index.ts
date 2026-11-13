// Owned by S8.2. Actions are public endpoints at /_actions/<name>, so each handler validates its
// own input (zod) and reads only the caller's own session. Namespaced under `s82`, so the names
// are "s82.subscribe" etc.; another demo can add its own key next to it.
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";

import { CART_KEY, ITEMS, readCart } from "../s82/cart";

export const server = {
  s82: {
    // accept: "form" parses FormData into the schema: type=number fields arrive as numbers, an
    // empty field as null (so a required number fails instead of becoming 0).
    subscribe: defineAction({
      accept: "form",
      input: z.object({
        name: z.string().trim().min(2, "name needs at least 2 characters"),
        email: z.email("email is not an e-mail address"),
        age: z
          .number("age is required")
          .int()
          .min(13, "age must be 13 or more"),
      }),
      handler: async ({ name, age }) => ({
        message: `Welcome ${name} (${age})`,
      }),
    }),

    addToCart: defineAction({
      accept: "form",
      input: z.object({
        item: z.enum(ITEMS, "pick one of the listed items"),
        qty: z
          .number()
          .int()
          .min(1, "qty must be 1 to 9")
          .max(9, "qty must be 1 to 9"),
      }),
      handler: async ({ item, qty }, { session }) => {
        const cart = await readCart(session);
        cart[item] = (cart[item] ?? 0) + qty;
        session?.set(CART_KEY, cart);
        return cart;
      },
    }),

    clearCart: defineAction({
      accept: "form",
      handler: async (_form, { session }) => {
        session?.delete(CART_KEY);
        return {};
      },
    }),

    // JSON (the default accept): called by the client or by fetch to /_actions/s82.checkout.
    checkout: defineAction({
      handler: async (_input, { session }) => {
        const cart = await readCart(session);
        const items = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
        if (items === 0)
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "the cart is empty",
          });
        session?.delete(CART_KEY);
        return { items };
      },
    }),
  },
};
