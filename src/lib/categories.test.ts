import { describe, expect, test } from "vitest";

import {
  CATEGORIES,
  CATEGORY_NAMES,
  categoryByName,
  categoryPath,
  groupByCategory,
} from "./categories";

describe("CATEGORIES", () => {
  test("처음 정한 세 카테고리와 그 주소", () => {
    expect(
      CATEGORIES.map((category) => [category.name, categoryPath(category)]),
    ).toEqual([
      ["개발", "/categories/dev"],
      ["부동산", "/categories/real-estate"],
      ["일상", "/categories/life"],
    ]);
  });

  test("id·name·slug 가 겹치지 않고 slug 는 ASCII 소문자와 '-' 뿐이다", () => {
    for (const key of ["id", "name", "slug"] as const)
      expect(new Set(CATEGORIES.map((c) => c[key])).size).toBe(
        CATEGORIES.length,
      );
    for (const { slug } of CATEGORIES) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  test("description 이 비지 않는다", () => {
    for (const { description } of CATEGORIES)
      expect(description.trim()).not.toBe("");
  });

  test("CATEGORY_NAMES 는 스키마가 받는 이름들", () => {
    expect(CATEGORY_NAMES).toEqual(["개발", "부동산", "일상"]);
  });
});

describe("categoryByName", () => {
  test("이름으로 찾는다", () => {
    expect(categoryByName("부동산").slug).toBe("real-estate");
  });

  test("없는 이름이면 멈춘다", () => {
    expect(() => categoryByName("재테크")).toThrow(/재테크/);
  });
});

describe("groupByCategory", () => {
  const post = (id: string, category: string) => ({ id, data: { category } });

  test("카테고리 순서대로, 글이 없는 카테고리도 빈 목록으로, 글은 받은 순서대로", () => {
    const groups = groupByCategory([
      post("c", "개발"),
      post("b", "일상"),
      post("a", "개발"),
    ]);
    expect(
      groups.map((group) => [
        group.category.slug,
        group.posts.map((p) => p.id),
      ]),
    ).toEqual([
      ["dev", ["c", "a"]],
      ["real-estate", []],
      ["life", ["b"]],
    ]);
  });

  test("목록에 없는 카테고리의 글이 있으면 멈춘다", () => {
    expect(() => groupByCategory([post("a", "재테크")])).toThrow(/재테크/);
  });
});
