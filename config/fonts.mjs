// Fonts API 설정. astro.config.mjs 의 fonts 키가 이 배열을 그대로 쓴다.
//
// Source Code Pro 는 예전에 fonts.gstatic.com 에서 받던 v22 woff 파일 8개를 src/fonts/source-code-pro/ 에 그대로 두고
// local 공급자로 싣는다. google 공급자는 빌드하는 날의 최신 파일(다른 버전의 woff2)을 받아 와서 글자 모양이
// 배포본과 달라질 수 있기 때문이다. 같은 바이트의 파일을 쓰면 화면도 같다.
//
// 변형의 순서가 뜻을 가진다(@font-face 도 이 순서로 나온다). 범위가 겹치면 뒤의 규칙이 이기고, unicode-range 가
// 없는 첫 규칙(글꼴 전체)은 어느 범위에도 없는 글자가 나올 때만 받는다. 범위는 배포본이 받던 Google CSS 의 값이다.
//
// fallbacks 는 global.css 에 있던 대체 글꼴 목록 그대로다. optimizedFallbacks 를 끄는 이유: 켜면 Astro 가 크기를
// 맞춘 "Source Code Pro fallback" 글꼴을 목록에 끼워 넣어, 한글처럼 Source Code Pro 에 없는 글자의 모양이 바뀐다.
import { fontProviders } from "astro/config";

const dir = "./src/fonts/source-code-pro";

/** [파일 이름, unicode-range | undefined]. 배포본의 @font-face 순서. */
const SUBSETS = [
  ["full", undefined],
  [
    "cyrillic-ext",
    "U+0460-052F, U+1C80-1C88, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
  ],
  ["cyrillic", "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116"],
  ["greek-ext", "U+1F00-1FFF"],
  ["greek", "U+0370-03FF"],
  [
    "vietnamese",
    "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
  ],
  [
    "latin-ext",
    "U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF",
  ],
  [
    "latin",
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  ],
];

export default [
  {
    provider: fontProviders.local(),
    name: "Source Code Pro",
    cssVariable: "--font-source-code-pro",
    fallbacks: ["Consolas", "Menlo", "Monaco", "Courier New", "monospace"],
    optimizedFallbacks: false,
    display: "swap",
    formats: ["woff"],
    options: {
      variants: SUBSETS.map(([file, range]) => ({
        src: [`${dir}/${file}.woff`],
        weight: 400,
        style: "normal",
        ...(range && { unicodeRange: range.split(", ") }),
      })),
    },
  },
];
