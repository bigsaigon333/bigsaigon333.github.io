// tsc 는 .astro 파일을 읽지 못한다(astro check 의 언어 서버만 읽는다). 시험이 .astro 를 import 할 수 있도록
// Container API 가 받는 컴포넌트 타입으로 선언해 둔다. 실제 모듈은 Vitest 안에서 Astro 의 Vite 플러그인이 컴파일한다.
declare module "*.astro" {
  const component: Parameters<
    import("astro/container").experimental_AstroContainer["renderToString"]
  >[0];
  export default component;
}
