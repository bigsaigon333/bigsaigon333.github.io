/** @jsxImportSource preact */
// A counter that reports whether it has hydrated: the server renders data-hydrated="no" and only
// an effect (which runs in the browser after hydration) flips it to "yes".
import { useEffect, useState } from "preact/hooks";

export default function Counter({ name }: { name: string }) {
  const [count, setCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return (
    <div data-s83-counter={name} data-hydrated={hydrated ? "yes" : "no"}>
      <span>{name}</span>{" "}
      <button type="button" onClick={() => setCount(count + 1)}>
        {count}
      </button>
    </div>
  );
}
