// 본문에 HTML 로 쓴 `<img width="…" alt="…" src="../src/assets/posts/…">` 를 Markdown 이미지 노드로 바꾸는 Sätteri mdast 플러그인.
//
// Astro 는 Markdown 이미지(`![]()`)만 astro:assets 로 넘긴다. @astrojs/markdown-satteri 의 collect-images(mdast,
// 사용자 플러그인 뒤에 돈다)가 image 노드의 url 을 모으고, image-marker(hast)가 `<img>` 요소에 `__ASTRO_IMAGE_` 를
// 단다. 원시 HTML `<img>` 는 hast 에서 raw 노드라 둘 다 지나친다. 그래서 mdast 단계에서 image 노드로 바꿔 둔다.
//   - 상대 경로(`./`, `../`)인 것만 바꾼다. 원격·루트 경로는 그대로 둔다.
//   - `alt` 는 image 노드의 alt 로, 나머지 속성은 data.hProperties 로 옮긴다. image-marker 가 이것을 getImage 의
//     인자로 넘기므로 `width` 는 숫자로 바꾼다(렌더 크기 유지, height 는 Astro 가 비율로 채운다).
//   - `densities: ["1x", "2x"]`: 이 그림들은 2배 해상도 캡처를 width 의 절반으로 보이던 것이라, 1x 만 만들면 흐려진다.
//     문자열로 쓴다: hast 속성 배열은 문자열만 남아서 `[1, 2]` 는 `[]` 가 된다.
//   - 블록 자리의 `<img>`(앞뒤가 빈 줄)는 그대로 블록 자리에 남는다. 문단으로 감싸지 않으므로 상자 위치가 같다.
const IMG = /^<img\s([^<>]*?)\s*\/?>$/i;
const ATTR = /([a-z][a-z0-9-]*)\s*=\s*"([^"]*)"/gi;

export function parseImgTag(html) {
  const match = IMG.exec(html.trim());
  if (!match) return undefined;
  const attrs = {};
  for (const [, key, value] of match[1].matchAll(ATTR)) {
    attrs[key.toLowerCase()] = value;
  }
  return attrs;
}

export const htmlImagesPlugin = {
  name: "html-images",
  html(node, ctx) {
    const attrs = parseImgTag(node.value);
    if (!attrs?.src || !/^\.\.?\//.test(attrs.src)) return;
    const { src, alt = "", ...rest } = attrs;
    const hProperties = { ...rest, densities: ["1x", "2x"] };
    if (rest.width !== undefined) hProperties.width = Number(rest.width);
    if (rest.height !== undefined) hProperties.height = Number(rest.height);
    ctx.replaceNode(node, {
      type: "image",
      url: src,
      alt,
      data: { hProperties },
    });
  },
};
