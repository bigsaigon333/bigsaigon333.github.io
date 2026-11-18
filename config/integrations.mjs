// 이 저장소의 로컬 통합(integration). astro.config.mjs 가 integrations 배열 뒤에 펼쳐 넣는다.
//
// site-guard 의 jsBudget: 지금 가장 무거운 페이지는 글 페이지 23197바이트(ClientRouter·page·prefetch 모듈 3개,
// 댓글 로더 + 인라인 스크립트). 여유를 둔 32KiB. 예산을 넘는 변경은 이 값을 올리는 커밋으로 드러난다.
// lazyBudget: 페이지의 스크립트가 동적 import(`import("./x.js")`)로만 부르는 파일들의 바이트(정적으로 이미 실린 것은 빼고).
// 지금은 글 페이지의 댓글 UI 조각(src/scripts/comments/ui.ts) 하나로 11490바이트다. 16KiB.
import siteGuard from "../integrations/site-guard.mjs";

export default [siteGuard({ jsBudget: 32 * 1024, lazyBudget: 16 * 1024 })];
