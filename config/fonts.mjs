// Fonts API 설정. astro.config.mjs 의 fonts 키가 이 배열을 그대로 쓴다.
//
// Source Code Pro 는 예전에 fonts.gstatic.com 에서 받던 v22 파일을 src/fonts/source-code-pro/ 에 두고 local 공급자로
// 싣는다. google 공급자는 빌드하는 날의 최신 파일(다른 버전)을 받아 와서 글자 모양이 배포본과 달라질 수 있기 때문이다.
//
// PF3: 파일은 모두 woff2 다. 예전 woff 를 fontTools 4.60 으로 바꿨다(글리프·메트릭 표는 그대로, 압축만 Brotli).
// - 범위가 있는 7개(latin 등)는 그대로 flavor 만 바꿨다: TTFont(x.woff) → flavor="woff2" → save. latin 12.8KB → 10.0KB.
// - 예전 첫 face "full"(56KB, unicode-range 없음)은 "rest"(20KB)로 줄였다. 전체 파일에서 다른 7개 파일에 없는 글자
//   497자(→ ─ 같은 화살표·상자 그림, 라틴 범위 안이지만 latin 파일에 없는 ‐ ‰ 따위)만 남긴 부분 집합이다:
//   pyftsubset full.woff --unicodes=<그 497자> --flavor=woff2 --layout-features='*' --name-IDs='*' --notdef-outline
//   예전에 full 이 그리던 글자는 rest 가 같은 글리프로 그린다(7개 파일의 글자는 원래부터 그 파일들이 그렸다).
//
// rest 에 unicode-range 를 주지 않는 이유(측정, docs/astro-notes/38): 범위를 497자로 좁히면 코드 주석의 한글처럼 어느
// face 에도 없는 글자는 아무것도 받지 않아 글 하나에 20KB 를 더 아낀다. 그런데 수식 글의 perf(Lighthouse) FCP·LCP 가
// 903 → 1054ms 로 늘었다(세 번 모두, 빌드를 바꿔 다섯 번 재현). 범위 없는 face 가 하나 있으면 Chrome 이 그 글꼴을 첫
// 레이아웃 전에 받기 시작하고, 없으면 레이아웃 중에 latin 을 요청해 수식 글(KaTeX 로 레이아웃이 무겁다)의 첫 화면이
// 늦어진다(관찰된 FCP 77 → 114ms). latin preload, 대체 글꼴 목록 바꾸기, latin 을 범위 없는 face 로 두기는 효과가 없었다.
// 그래서 범위 없는 face 는 rest 하나로 두되 56KB → 20KB 로 줄였다. 한글은 rest 에도 없으므로 받은 뒤 fallbacks 로 간다.
//
// 변형의 순서가 뜻을 가진다(@font-face 도 이 순서로 나온다). 범위가 겹치면 뒤의 규칙이 먼저 쓰이고, 그 파일에 글자가
// 없으면 앞의 규칙으로 간다. 범위는 배포본이 받던 Google CSS 의 값이다.
//
// fallbacks 는 global.css 에 있던 대체 글꼴 목록 그대로다. optimizedFallbacks 를 끄는 이유: 켜면 Astro 가 크기를
// 맞춘 "Source Code Pro fallback" 글꼴을 목록에 끼워 넣어, 한글처럼 Source Code Pro 에 없는 글자의 모양이 바뀐다.
import { fontProviders } from "astro/config";

const dir = "./src/fonts/source-code-pro";

/** [파일 이름, unicode-range | undefined]. 배포본의 @font-face 순서("full" 자리에 "rest"). */
const SUBSETS = [
  ["rest", undefined],
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
    formats: ["woff2"],
    options: {
      variants: SUBSETS.map(([file, range]) => ({
        src: [`${dir}/${file}.woff2`],
        weight: 400,
        style: "normal",
        ...(range && { unicodeRange: range.split(", ") }),
      })),
    },
  },
];
