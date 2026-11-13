/** @jsxImportSource preact */
// The same counter in its own module, so its chunk (Later.*.js) shows when client:visible loads it.
import Counter from "./Counter";

export default function Later({ name }: { name: string }) {
  return <Counter name={name} />;
}
