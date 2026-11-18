import { describe, expect, it } from "vitest";
import type { MetricWithAttribution } from "web-vitals/attribution";

import { toGaEvent } from "./web-vitals";

const metric = (fields: Record<string, unknown>) =>
  ({
    id: "v6-1",
    rating: "good",
    navigationType: "navigate",
    entries: [],
    attribution: {},
    ...fields,
  }) as unknown as MetricWithAttribution;

describe("toGaEvent", () => {
  it("LCP: 이름, 반올림한 delta, 내비게이션 종류, LCP 요소의 선택자", () => {
    expect(
      toGaEvent(
        metric({
          name: "LCP",
          value: 1234.6,
          delta: 1234.6,
          attribution: { target: "main.prose>p:nth-child(2)" },
        }),
      ),
    ).toEqual({
      name: "LCP",
      params: {
        value: 1235,
        metric_id: "v6-1",
        metric_value: 1234.6,
        metric_delta: 1234.6,
        metric_rating: "good",
        navigation_type: "navigate",
        non_interaction: true,
        debug_target: "main.prose>p:nth-child(2)",
      },
    });
  });

  it("CLS 는 value 를 1000 배 하고 가장 크게 밀린 요소를 싣는다", () => {
    const { params } = toGaEvent(
      metric({
        name: "CLS",
        value: 0.0184,
        delta: 0.0184,
        navigationType: "back-forward-cache",
        attribution: { largestShiftTarget: "span.katex" },
      }),
    );
    expect(params.value).toBe(18);
    expect(params.debug_target).toBe("span.katex");
    expect(params.navigation_type).toBe("back-forward-cache");
  });

  it("INP 는 상호작용의 대상을 싣는다", () => {
    expect(
      toGaEvent(
        metric({
          name: "INP",
          value: 80,
          delta: 80,
          attribution: { interactionTarget: "button.theme-toggle" },
        }),
      ).params.debug_target,
    ).toBe("button.theme-toggle");
  });

  it("대상이 없는 지표(FCP, TTFB)에는 debug_target 이 없다", () => {
    for (const name of ["FCP", "TTFB"]) {
      const { params } = toGaEvent(
        metric({ name, value: 900, delta: 900, attribution: {} }),
      );
      expect(params).not.toHaveProperty("debug_target");
    }
  });

  it("선택자는 GA 의 매개변수 길이 한도(100자)로 자른다", () => {
    const { params } = toGaEvent(
      metric({
        name: "LCP",
        value: 1,
        delta: 1,
        attribution: { target: "x".repeat(150) },
      }),
    );
    expect(params.debug_target).toHaveLength(100);
  });
});
