// 이 저장소의 로컬 통합(integration). astro.config.mjs 가 integrations 배열 뒤에 펼쳐 넣는다.
//
// site-guard 의 jsBudget: 지금 가장 무거운 페이지는 글 페이지 21005바이트(ClientRouter·page·prefetch 모듈 3개 +
// 인라인 스크립트), 나머지는 19714바이트다. 여유를 둔 32KiB. 예산을 넘는 변경은 이 값을 올리는 커밋으로 드러난다.
import siteGuard from "../integrations/site-guard.mjs";

export default [siteGuard({ jsBudget: 32 * 1024 })];
