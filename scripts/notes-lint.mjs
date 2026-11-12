// node scripts/notes-lint.mjs
//
// Checks the shape of every learning note docs/astro-notes/NN-<slug>.md.
import fs from "node:fs";
import path from "node:path";

const dir = path.join(import.meta.dirname, "..", "docs", "astro-notes");

export const SECTIONS = [
  "한 줄 요약",
  "개념",
  "Next.js 대응",
  "빌드 결과물에서 확인하기",
  "닫힌 고리가 잡아낸 것",
  "직접 해볼 실험",
  "문서 근거",
];

const MAX_LINES = 80;

function lint(file) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  const problems = [];

  if (!/^# \S/.test(lines[0] ?? "")) problems.push("첫 줄은 `# 제목`이어야 한다");

  const headings = lines.filter((line) => line.startsWith("## ")).map((line) => line.slice(3).trim());
  if (headings.join("|") !== SECTIONS.join("|")) {
    problems.push(`절 구성이 다르다(순서 포함). 기대: ${SECTIONS.join(" / ")}`);
  }

  const section = (name) => {
    const start = lines.findIndex((line) => line.trim() === `## ${name}`);
    if (start === -1) return "";
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => line.startsWith("## "));
    return (end === -1 ? rest : rest.slice(0, end)).join("\n");
  };

  if ((section("직접 해볼 실험").match(/<details>/g) ?? []).length < 2) {
    problems.push("실험이 2개 이상이어야 하고 예상 결과는 <details>로 접는다");
  }
  if (!/https:\/\/\S+/.test(section("문서 근거"))) problems.push("문서 근거에 URL이 없다");
  if (lines.length > MAX_LINES) problems.push(`${lines.length}줄 — ${MAX_LINES}줄 이하여야 한다`);

  return problems;
}

const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((name) => /^\d\d-.+\.md$/.test(name)).sort()
  : [];

let failed = 0;
for (const name of files) {
  const problems = lint(path.join(dir, name));
  if (problems.length) {
    failed += 1;
    console.log(`FAIL  ${name}  ${problems.join(" | ")}`);
  }
}

console.log(`${failed ? "NOTES FAILED" : "NOTES PASS"}  ${files.length - failed}/${files.length} notes`);
process.exit(failed ? 1 : 0);
