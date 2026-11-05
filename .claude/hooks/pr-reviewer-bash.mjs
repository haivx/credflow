// PreToolUse cho subagent pr-reviewer (plan 12i): Bash chỉ được đọc git và chạy test.
// Danh sách cho phép, không phải danh sách cấm: lệnh lạ thì chặn. Exit 2 là chặn.
import { pathToFileURL } from "node:url";

const GIT_READ = new Set([
  "diff",
  "log",
  "show",
  "status",
  "merge-base",
  "rev-parse",
  "ls-files",
]);
const MAKE_TARGETS = new Set(["test", "test-int", "lint", "typecheck"]);
// Ghi file hoặc chạy chương trình ngoài. Git nhận cả tên viết tắt (`--outp=f`).
const GIT_FORBIDDEN_OPTIONS = ["--output", "--ext-diff", "--textconv"];
const SHELL_METACHARACTERS = /[;&|<>`$\r\n]/;
const LINT_TEST = /^tools\/lint\/[\w*-]+(\.[\w*-]+)*\.test\.mjs$/;

function isForbiddenGitOption(token) {
  if (!token.startsWith("--")) return false;
  const name = token.split("=")[0];
  return (
    name.length > 2 &&
    GIT_FORBIDDEN_OPTIONS.some((option) => option.startsWith(name))
  );
}

export function isAllowedCommand(command) {
  if (typeof command !== "string") return false;
  if (SHELL_METACHARACTERS.test(command)) return false;

  const tokens = command.trim().split(/\s+/);
  const [program, first] = tokens;

  if (program === "git") {
    return GIT_READ.has(first) && !tokens.some(isForbiddenGitOption);
  }
  if (program === "make") {
    return tokens.length === 2 && MAKE_TARGETS.has(first);
  }
  if (program === "node") {
    return (
      tokens.length === 3 && first === "--test" && LINT_TEST.test(tokens[2])
    );
  }
  return false;
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;

  let command;
  try {
    command = JSON.parse(input).tool_input?.command;
  } catch {
    command = undefined;
  }

  if (!isAllowedCommand(command)) {
    process.stderr.write(
      "pr-reviewer chỉ đọc: Bash chỉ được chạy git diff/log/show/status/merge-base/rev-parse/ls-files, " +
        "make test/test-int/lint/typecheck, node --test tools/lint/*. Không nối lệnh, không chuyển hướng.\n",
    );
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
