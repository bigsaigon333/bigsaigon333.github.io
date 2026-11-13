// 배포 환경마다 바뀔 수 있는 세 값은 astro:env(config/env.mjs 의 스키마, 값은 config/.env.<mode>)에서 읽는다.
// 이 모듈을 가져오는 순간 스키마 전체가 검사되므로 값이 빠지면 빌드가 그 변수 이름을 대며 멈춘다.
import {
  GA_MEASUREMENT_ID,
  GOOGLE_SITE_VERIFICATION,
  UTTERANCES_REPO,
} from "astro:env/server";

const url = "https://bigsaigon333.github.io";

// `as const` 안에서도 string[] 로 남도록 따로 선언한다(Seo 의 keywords: string[] 에 그대로 넘긴다).
const keywords: string[] = [
  "김동희",
  "프론트엔드",
  "개발",
  "자바스크립트",
  "타입스크립트",
  "JS",
  "javascript",
  "typescript",
  "TS",
  "react",
];

export const SITE = {
  url,
  title: "김동희의 개발블로그",
  description: "프론트엔드 개발과 관련된 이야기를 다룹니다.",
  author: "김동희",
  keywords,
  // 같은 "한국어"를 JSON-LD 의 inLanguage 는 BCP 47("ko", <html lang> 과 같은 값)로, og:locale 은 언어_지역("ko_KR")으로 적는다.
  lang: "ko",
  locale: "ko_KR",
  ogImage: `${url}/main-og-image.jpg`,
  // public/main-og-image.jpg 의 실제 크기와 형식(파일 헤더에 적힌 값). 이미지를 바꾸면 이 값도 함께 고친다.
  ogImageWidth: 380,
  ogImageHeight: 240,
  ogImageType: "image/jpeg",
  ogImageAlt:
    "화면에 BLOG 라고 적힌 노트북 주위에 사진, 동영상, 문서 아이콘이 떠 있는 일러스트",
  email: "likepepperint@gmail.com",
  github: "https://github.com/bigsaigon333",
  gaId: GA_MEASUREMENT_ID,
  googleSiteVerification: GOOGLE_SITE_VERIFICATION,
  utterancesRepo: UTTERANCES_REPO,
} as const;
