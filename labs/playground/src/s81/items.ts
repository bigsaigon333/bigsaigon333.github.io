// An in-memory item store for the S8.1 API demo. It lives as long as the server process.
export interface Item {
  id: string;
  name: string;
  createdAt: string;
}

const items = new Map<string, Item>();

export const listItems = (): Item[] => [...items.values()];

export const findItem = (id: string): Item | undefined => items.get(id);

// Returns the item, or the reason the input is not one.
export function createItem(input: unknown): Item | { error: string } {
  const name =
    typeof input === "object" && input !== null && "name" in input
      ? input.name
      : undefined;
  if (typeof name !== "string" || name.trim() === "" || name.trim().length > 40)
    return {
      error: "name must be a non-empty string of at most 40 characters",
    };
  const item = {
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  items.set(item.id, item);
  return item;
}

export const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
