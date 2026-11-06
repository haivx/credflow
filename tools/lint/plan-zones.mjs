#!/usr/bin/env node
// Guardrail A8 (plan 23): PR chạm file vùng kiến trúc (docs/agent/architecture-zones.txt) thì file đó
// phải được khai ở mục "## Vùng kiến trúc bị chạm" của plan có thay đổi trong PR (docs/plans/*.md),
// hoặc ở mục cùng tên trong mô tả PR (biến môi trường PR_BODY). Khai = đường dẫn/glob trong backtick.
// Không khai → in ::error từng file + bảng vào job summary, exit 1. Lỗi thật (base/head sai) → exit 2.
//
// Dùng: node tools/lint/plan-zones.mjs <base> <head>
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

const SECTION = "## Vùng kiến trúc bị chạm";
const ZONES_FILE = "docs/agent/architecture-zones.txt";

const [base, head] = process.argv.slice(2);
if (base === undefined || head === undefined) {
  console.error("Dùng: node tools/lint/plan-zones.mjs <base> <head>");
  process.exit(2);
}

function git(...args) {
  return execFileSync("git", ["-c", "core.quotepath=off", ...args], {
    encoding: "utf8",
  });
}

for (const ref of [base, head]) {
  try {
    git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
  } catch {
    console.error(`Không tìm thấy commit: ${ref}`);
    process.exit(2);
  }
}

/** Glob → RegExp: `**` khớp mọi thứ kể cả `/`, `*` không qua `/`, còn lại so đúng. */
export function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      // `**/` ở đầu hoặc giữa: khớp 0 hoặc nhiều thư mục.
      if (glob[i + 2] === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i += 1;
      }
    } else if (ch === "*") {
      source += "[^/]*";
    } else {
      source += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

/** Mọi đoạn `...` trong mục "Vùng kiến trúc bị chạm" (tới tiêu đề `## ` kế tiếp). */
export function declaredIn(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === SECTION);
  if (start === -1) return [];
  const end = lines.findIndex((line, i) => i > start && /^##\s/.test(line));
  const body = lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
  return [...body.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim());
}

const zonePatterns = readFileSync(ZONES_FILE, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));
const zoneRegexps = zonePatterns.map((p) => ({ p, re: globToRegExp(p) }));

const changed = git("diff", "--name-only", "--no-renames", `${base}...${head}`)
  .split("\n")
  .filter(Boolean);
const touched = changed
  .map((file) => ({
    file,
    zone: zoneRegexps.find(({ re }) => re.test(file))?.p,
  }))
  .filter(({ zone }) => zone !== undefined);

const plans = git(
  "diff",
  "--name-only",
  "--no-renames",
  "--diff-filter=AM",
  `${base}...${head}`,
  "--",
  "docs/plans/*.md",
)
  .split("\n")
  .filter((file) => file !== "" && file !== "docs/plans/README.md");
const declared = [
  ...plans.flatMap((file) => declaredIn(git("show", `${head}:${file}`))),
  ...declaredIn(process.env.PR_BODY ?? ""),
];
const declaredRegexps = declared.map(globToRegExp);

const undeclared = touched.filter(
  ({ file }) => !declaredRegexps.some((re) => re.test(file)),
);

const summary = process.env.GITHUB_STEP_SUMMARY;
const out = [
  "## Vùng kiến trúc: đã khai chưa (A8, plan 23)",
  "",
  `Nguồn khai: ${plans.length > 0 ? plans.map((p) => `\`${p}\``).join(", ") : "không có plan trong PR"}${process.env.PR_BODY ? " + mô tả PR" : ""}.`,
  "",
];
if (touched.length === 0) {
  out.push("Không chạm vùng kiến trúc.");
} else if (undeclared.length === 0) {
  out.push(`Chạm ${touched.length} file vùng, tất cả đã khai.`);
} else {
  out.push("| File chưa khai | Vùng |", "| --- | --- |");
  for (const { file, zone } of undeclared) {
    out.push(`| \`${file}\` | \`${zone}\` |`);
  }
  out.push(
    "",
    `Thêm vào mục \`${SECTION}\` của plan (hoặc của mô tả PR), mỗi đường dẫn trong backtick, rồi chạy lại job.`,
  );
}
if (summary) appendFileSync(summary, `${out.join("\n")}\n`);

if (undeclared.length > 0) {
  for (const { file, zone } of undeclared) {
    console.log(
      `::error file=${file}::Chạm vùng kiến trúc (${zone}) mà plan/mô tả PR không khai ở mục "${SECTION}".`,
    );
  }
  process.exit(1);
}
console.log(
  touched.length === 0
    ? "plan-zones: không chạm vùng kiến trúc"
    : `plan-zones: ${touched.length} file vùng, đã khai đủ`,
);
