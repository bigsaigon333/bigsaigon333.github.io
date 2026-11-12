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
  ogImage: `${url}/main-og-image.jpg`,
  email: "likepepperint@gmail.com",
  github: "https://github.com/bigsaigon333",
  gaId: "G-Y270VJN1Y2",
  googleSiteVerification: "EgEIEyHCMFeuXMkD5WkIL8nUqAu88egS-aNgSua3tjI",
} as const;
