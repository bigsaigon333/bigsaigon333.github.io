import fs from "node:fs";
import path from "node:path";

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/**
 * Resolve a URL pathname the way GitHub Pages does.
 *
 *   /p  →  p (file)  →  p.html  →  p/index.html (301 to /p/ first)  →  404.html (status 404)
 *
 * Returns { status, file?, location? }.
 */
export function resolve(root, pathname) {
  root = path.resolve(root);

  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return { status: 400 };
  }

  const abs = path.join(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return { status: 403 };

  if (isFile(abs)) return { status: 200, file: abs };
  if (!rel.endsWith("/") && isFile(`${abs}.html`)) return { status: 200, file: `${abs}.html` };

  if (isDir(abs)) {
    const index = path.join(abs, "index.html");
    if (isFile(index)) {
      return rel.endsWith("/") ? { status: 200, file: index } : { status: 301, location: `${pathname}/` };
    }
  }

  const notFound = path.join(root, "404.html");
  return isFile(notFound) ? { status: 404, file: notFound } : { status: 404 };
}

/** HTML routes of a built site: index.html → "/", posts/a.html → "/posts/a". Skips _next and _astro. */
export function listRoutes(root) {
  root = path.resolve(root);
  const routes = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.endsWith(".html")) {
        const rel = path.relative(root, abs).split(path.sep).join("/").replace(/\.html$/, "");
        if (rel === "index") routes.push("/");
        else if (rel.endsWith("/index")) routes.push(`/${rel.slice(0, -"/index".length)}/`);
        else routes.push(`/${rel}`);
      }
    }
  };

  walk(root);
  return routes.sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)));
}
