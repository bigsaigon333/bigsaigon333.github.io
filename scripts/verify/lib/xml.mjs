// Well-formedness of an XML document, without a dependency.
//
// cheerio's XML mode, like every lenient parser, makes something of whatever it is given: a file that ends in
// the middle of a tag still yields its <loc> elements. A crawler's XML parser stops at the first error instead.
// This is the strict half: enough of the XML 1.0 grammar to say whether a document such as a sitemap is one a
// conforming parser accepts — declaration, one root element, balanced tags, quoted attributes, no bare "&" or "<".
// It does not validate against a schema or resolve entities other than the five predefined ones.

const NAME = "[A-Za-z_:\\u0080-\\uFFFF][-.\\w:\\u0080-\\uFFFF]*";
const DECLARATION = new RegExp(
  "^<\\?xml\\s+version\\s*=\\s*([\"'])1\\.\\d+\\1" +
    "(?:\\s+encoding\\s*=\\s*([\"'])[A-Za-z][-.\\w]*\\2)?" +
    "(?:\\s+standalone\\s*=\\s*([\"'])(?:yes|no)\\3)?\\s*\\?>",
);
const START_TAG = new RegExp(
  `<(${NAME})((?:\\s+${NAME}\\s*=\\s*(?:"[^"<]*"|'[^'<]*'))*)\\s*(/?)>`,
  "y",
);
const END_TAG = new RegExp(`</(${NAME})\\s*>`, "y");
const ATTRIBUTE = new RegExp(`(${NAME})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "g");
const REFERENCE = /&(?:#\d+|#x[0-9A-Fa-f]+|[A-Za-z_:][-.\w:]*);/y;
const PREDEFINED = new Set(["amp", "lt", "gt", "quot", "apos"]);

/** What is wrong with the "&"s of a piece of text or an attribute value, or null. */
function referenceProblem(text) {
  for (let at = text.indexOf("&"); at !== -1; at = text.indexOf("&", at + 1)) {
    REFERENCE.lastIndex = at;
    const match = REFERENCE.exec(text);
    if (!match)
      return `"&" that does not start a reference (write &amp;): ${JSON.stringify(text.slice(at, at + 12))}`;
    const name = match[0].slice(1, -1);
    if (!name.startsWith("#") && !PREDEFINED.has(name))
      return `undefined entity ${match[0]}`;
  }
  return null;
}

/**
 * @param {string} xml
 * @returns {{ problem: string|null, root: { name: string, attributes: Record<string, string> }|null }}
 *          `problem` is the first thing a conforming parser would stop at, with its line, or null.
 */
export function inspectXml(xml) {
  let root = null;
  const text = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  const lineOf = (at) => text.slice(0, at).split("\n").length;
  const fail = (at, message) => ({
    problem: `line ${lineOf(at)}: ${message}`,
    root,
  });

  const declaration = DECLARATION.exec(text);
  if (!declaration)
    return fail(
      0,
      'no XML declaration at the very start (<?xml version="1.0" …?>)',
    );

  const open = []; // names of the elements that are open, outermost first
  let closedRoot = false;
  let at = declaration[0].length;

  while (at < text.length) {
    const next = text.indexOf("<", at);
    const chunk = text.slice(at, next === -1 ? text.length : next);
    if (open.length === 0) {
      if (chunk.trim() !== "")
        return fail(
          at + chunk.search(/\S/),
          `text outside the root element: ${JSON.stringify(chunk.trim().slice(0, 20))}`,
        );
    } else {
      const problem = referenceProblem(chunk);
      if (problem) return fail(at + chunk.indexOf("&"), problem);
      if (chunk.includes("]]>"))
        return fail(at + chunk.indexOf("]]>"), '"]]>" in text');
    }
    if (next === -1) break;
    at = next;

    if (text.startsWith("<!--", at)) {
      const end = text.indexOf("-->", at + 4);
      if (end === -1) return fail(at, "comment is not closed");
      if (text.slice(at + 4, end).includes("--"))
        return fail(at, '"--" inside a comment');
      at = end + 3;
    } else if (text.startsWith("<![CDATA[", at)) {
      if (open.length === 0) return fail(at, "CDATA outside the root element");
      const end = text.indexOf("]]>", at + 9);
      if (end === -1) return fail(at, "CDATA section is not closed");
      at = end + 3;
    } else if (text.startsWith("<?", at)) {
      const end = text.indexOf("?>", at + 2);
      if (end === -1) return fail(at, "processing instruction is not closed");
      if (/^<\?xml[\s?]/i.test(text.slice(at, at + 6)))
        return fail(at, "a second XML declaration");
      at = end + 2;
    } else if (text.startsWith("<!DOCTYPE", at)) {
      if (root) return fail(at, "DOCTYPE after the root element has started");
      let depth = 0;
      let end = at;
      for (; end < text.length; end += 1) {
        if (text[end] === "[") depth += 1;
        else if (text[end] === "]") depth -= 1;
        else if (text[end] === ">" && depth === 0) break;
      }
      if (end === text.length) return fail(at, "DOCTYPE is not closed");
      at = end + 1;
    } else if (text.startsWith("</", at)) {
      END_TAG.lastIndex = at;
      const match = END_TAG.exec(text);
      if (!match)
        return fail(
          at,
          `malformed end tag: ${JSON.stringify(text.slice(at, at + 20))}`,
        );
      const expected = open.pop();
      if (expected === undefined)
        return fail(at, `</${match[1]}> closes nothing`);
      if (expected !== match[1])
        return fail(at, `</${match[1]}> where </${expected}> is expected`);
      if (open.length === 0) closedRoot = true;
      at += match[0].length;
    } else {
      START_TAG.lastIndex = at;
      const match = START_TAG.exec(text);
      if (!match)
        return fail(
          at,
          `malformed tag: ${JSON.stringify(text.slice(at, at + 20))}`,
        );
      const [whole, name, attributeText, selfClosing] = match;
      if (open.length === 0 && closedRoot)
        return fail(at, `<${name}> after the root element: a second root`);

      const attributes = {};
      for (const [, key, double, single] of attributeText.matchAll(ATTRIBUTE)) {
        if (key in attributes)
          return fail(at, `attribute ${key} twice on <${name}>`);
        const value = double ?? single;
        const problem = referenceProblem(value);
        if (problem) return fail(at, `${problem} in attribute ${key}`);
        attributes[key] = value;
      }
      if (root === null) root = { name, attributes };
      if (selfClosing) {
        if (open.length === 0) closedRoot = true;
      } else open.push(name);
      at += whole.length;
    }
  }

  if (open.length) return fail(text.length, `<${open.at(-1)}> is never closed`);
  if (root === null) return fail(text.length, "no root element");
  return { problem: null, root };
}
