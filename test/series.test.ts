import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// astro:content 를 가짜로 바꾼다. 컬렉션은 시험마다 아래 변수로 정한다.
interface FakePost {
  id: string;
  collection: "posts";
  data: { draft?: boolean };
}
interface FakeSeries {
  id: string;
  data: { name: string; posts: { id: string }[] };
}

let posts: FakePost[] = [];
let series: FakeSeries[] = [];

vi.mock("astro:content", () => ({
  getCollection: async (name: string) => (name === "series" ? series : posts),
  getEntries: async (refs: { id: string }[]) =>
    refs.map((ref) => posts.find((post) => post.id === ref.id)),
}));

const post = (id: string, draft?: boolean): FakePost => ({
  id,
  collection: "posts",
  data: draft === undefined ? {} : { draft },
});

const seriesOf = (name: string, ids: string[]): FakeSeries => ({
  id: name,
  data: { name, posts: ids.map((id) => ({ id })) },
});

// series.ts 는 운영 빌드에서 결과를 모듈 안에 담아 둔다. 시험마다 새로 읽는다.
const load = async () => (await import("../src/lib/series")).getSeriesPosition;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DEV", false);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSeriesPosition", () => {
  test("순서는 series.json 의 배열 순서다(id 나 날짜 순이 아니다)", async () => {
    posts = ["w1", "w2", "w3"].map((id) => post(id));
    series = [seriesOf("css", ["w3", "w1", "w2"])];
    const position = await load();

    const w1 = await position("w1");
    expect(w1).toMatchObject({ name: "css", index: 1, total: 3 });
    expect(w1?.prev?.id).toBe("w3");
    expect(w1?.next?.id).toBe("w2");

    const first = await position("w3");
    expect(first?.index).toBe(0);
    expect(first?.prev).toBeUndefined();
    expect((await position("w2"))?.next).toBeUndefined();
  });

  test("시리즈에 없는 글은 undefined", async () => {
    posts = [post("a"), post("lonely")];
    series = [seriesOf("s", ["a"])];
    expect(await (await load())("lonely")).toBeUndefined();
  });

  test("운영 빌드에서는 초안을 순서에서 빼고 앞뒤를 잇는다", async () => {
    posts = [post("a"), post("b", true), post("c")];
    series = [seriesOf("s", ["a", "b", "c"])];
    const a = await (await load())("a");
    expect(a).toMatchObject({ index: 0, total: 2 });
    expect(a?.next?.id).toBe("c");
  });

  test("dev 에서는 초안도 순서에 남는다", async () => {
    vi.stubEnv("DEV", true);
    posts = [post("a"), post("b", true), post("c")];
    series = [seriesOf("s", ["a", "b", "c"])];
    expect((await (await load())("a"))?.next?.id).toBe("b");
  });

  test("없는 글을 가리키면 멈춘다", async () => {
    posts = [post("a")];
    series = [seriesOf("s", ["a", "ghost"])];
    await expect((await load())("a")).rejects.toThrow(/ghost/);
  });

  test("한 글이 두 시리즈에 들어 있으면 멈춘다", async () => {
    posts = [post("a"), post("b")];
    series = [seriesOf("s1", ["a"]), seriesOf("s2", ["b", "a"])];
    await expect((await load())("a")).rejects.toThrow(/s1.*s2/);
  });
});
