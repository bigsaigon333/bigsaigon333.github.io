// 현장 Web Vitals(PF1): 방문자의 브라우저에서 잰 LCP, INP, CLS, FCP, TTFB 를 GA 이벤트로 보낸다.
//
// web-vitals 의 attribution 빌드를 쓴다. 값과 함께 "무엇 때문인지"(LCP 요소, 가장 크게 밀린 요소, 느린 상호작용의
// 대상)를 CSS 선택자로 알려 준다. Analytics.astro 의 스크립트가 gtag.js 를 늦게 넣고(idle 이나 첫 상호작용) 그것이
// 실린 뒤에 아래 reportWebVitals 를 부르고, 그때 web-vitals 를 동적으로 import 한다. 첫 화면에 필요한 JS 가 아니어서다.
// 늦게 붙어도 값은 맞다: PerformanceObserver 를 buffered 로 등록해 이미 지나간 항목(LCP 후보, FCP, layout-shift)도 받는다.
//
// ClientRouter(S6.2)로 옮겨 가면 문서가 다시 로드되지 않아 web-vitals 는 처음 문서의 지표를 계속 잰다(소프트
// 내비게이션을 따로 세지 않는다). LCP·CLS·INP 는 페이지를 떠날 때 보내므로, 그대로 두면 GA 는 그때의 주소(마지막 페이지)에
// 싣는다(WB-review). 그래서 모든 지표 이벤트에 처음 페이지의 page_location·page_title 을 적고, 보낼 때 이미 옮겨 갔으면
// after_navigation: true 를 단다(CLS·INP 에 뒤 페이지의 이동·상호작용이 섞였다는 뜻이다. 분석할 때 걸러 낸다).
//
// 이벤트 모양은 web-vitals 가 GA4 에 권하는 것을 따른다. 이벤트 이름은 지표 이름("LCP"…), value 는 이번에 늘어난 값(delta,
// CLS 는 1000 배)이라 GA 에서 합계를 내면 페이지마다 최종 값이 된다. 같은 페이지의 보고는 metric_id 로 묶는다.
import type { MetricWithAttribution } from "web-vitals/attribution";

export type Gtag = (
  command: "event",
  name: string,
  params: Record<string, string | number | boolean>,
) => void;

/** 지표가 속한 페이지: 이 문서가 처음 열린 페이지. Analytics.astro 의 모듈이 처음 돌 때 잡는다. */
export type Landing = {
  location: string;
  title: string;
  /** 그 뒤로 ClientRouter 로 다른 페이지로 옮겨 갔는가 */
  navigated: () => boolean;
};

/** 지표 하나 → GA 이벤트의 매개변수. 순수 함수(시험한다). */
export function toGaEvent(
  metric: MetricWithAttribution,
  landing: Landing,
): {
  name: string;
  params: Record<string, string | number | boolean>;
} {
  const params: Record<string, string | number | boolean> = {
    // GA 의 value 는 정수로 합산된다. CLS 는 0.05 같은 작은 소수라 1000 배 한다.
    value: Math.round(
      metric.name === "CLS" ? metric.delta * 1000 : metric.delta,
    ),
    metric_id: metric.id,
    metric_value: metric.value,
    metric_delta: metric.delta,
    metric_rating: metric.rating,
    navigation_type: metric.navigationType,
    // 방문으로 세지 않는다(이탈률·참여 시간에 끼지 않는다).
    non_interaction: true,
    // 지표는 처음 페이지의 것이다. 보내는 때의 주소(옮겨 간 뒤의 페이지)가 아니라 그 페이지에 싣는다.
    page_location: landing.location,
    page_title: landing.title,
    after_navigation: landing.navigated(),
  };
  const target = debugTarget(metric);
  if (target) params.debug_target = target;
  return { name: metric.name, params };
}

/** 지표가 가리키는 요소의 선택자. 없으면 빈 문자열. GA 의 매개변수 값은 100자까지라 자른다. */
function debugTarget(metric: MetricWithAttribution): string {
  let target: string | undefined;
  switch (metric.name) {
    case "LCP":
      target = metric.attribution.target;
      break;
    case "CLS":
      target = metric.attribution.largestShiftTarget;
      break;
    case "INP":
      target = metric.attribution.interactionTarget;
      break;
    default:
      target = undefined;
  }
  return (target ?? "").slice(0, 100);
}

/** 다섯 지표를 관찰하고 값이 정해질 때마다 gtag 로 보낸다. */
export async function reportWebVitals(
  gtag: Gtag,
  landing: Landing,
): Promise<void> {
  const { onCLS, onFCP, onINP, onLCP, onTTFB } =
    await import("web-vitals/attribution");
  const send = (metric: MetricWithAttribution) => {
    const { name, params } = toGaEvent(metric, landing);
    gtag("event", name, params);
  };
  onLCP(send);
  onINP(send);
  onCLS(send);
  onFCP(send);
  onTTFB(send);
}
