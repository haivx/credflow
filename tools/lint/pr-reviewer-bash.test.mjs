// Test cho hook giới hạn Bash của subagent pr-reviewer (plan 12i).
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isAllowedCommand } from "../../.claude/hooks/pr-reviewer-bash.mjs";

const ROOT = new URL("../..", import.meta.url).pathname;
const HOOK = join(ROOT, ".claude/hooks/pr-reviewer-bash.mjs");

describe("isAllowedCommand", () => {
  for (const command of [
    "git diff origin/main...HEAD",
    "git diff --stat origin/main...HEAD",
    "git log --oneline -5",
    "git show HEAD:docs/STATUS.md",
    "git status --short",
    "git merge-base origin/main HEAD",
    "git rev-parse HEAD",
    "git ls-files",
    "make test",
    "make test-int",
    "make lint",
    "make typecheck",
    "node --test tools/lint/guardrails.test.mjs",
    "node --test tools/lint/*.test.mjs",
  ]) {
    it(`cho phép: ${command}`, () => {
      assert.equal(isAllowedCommand(command), true);
    });
  }

  for (const command of [
    // Nối lệnh, chuyển hướng, thay thế lệnh.
    "git diff; rm x",
    // `diff;` tự rớt khỏi danh sách cho phép; ca này mới thử được dấu `;`.
    "git diff HEAD; rm x",
    "git diff && rm x",
    "git diff | tee x",
    "git diff > f",
    "git diff < f",
    "git diff `rm x`",
    "git diff $(rm x)",
    "git diff\nrm x",
    "git diff &",
    // Option của git ghi file hoặc chạy chương trình ngoài, kể cả viết tắt.
    "git diff --output=f",
    "git diff --output f",
    "git diff --outp=f",
    "git log --output=f",
    "git show --output=f",
    "git diff --ext-diff",
    "git diff --textconv",
    // Git đổi trạng thái hoặc đổi config.
    "git -c core.pager=x diff",
    "git -C /tmp diff",
    "git push",
    "git push origin main",
    "git checkout main",
    "git switch main",
    "git commit -m x",
    "git add .",
    "git reset --hard",
    "git stash",
    "git fetch origin",
    // Make: chỉ đúng 4 target, không nhận tham số.
    "make db-migrate",
    "make db-seed",
    "make setup",
    "make test SHELL=/tmp/x",
    "make -f /tmp/x test",
    "make",
    // Lệnh khác.
    "sed -i s/a/b/ f",
    "rm -rf x",
    "cat f",
    "gh pr merge 1",
    "FOO=1 git diff",
    "node x.js",
    "node --test ../x.test.mjs",
    "node --test tools/lint/../../x.test.mjs",
    "node -e 1",
    "",
  ]) {
    it(`chặn: ${JSON.stringify(command)}`, () => {
      assert.equal(isAllowedCommand(command), false);
    });
  }

  it("chặn giá trị không phải chuỗi", () => {
    assert.equal(isAllowedCommand(undefined), false);
  });
});

describe("hook chạy thật qua stdin", () => {
  const run = (input) => spawnSync("node", [HOOK], { input, encoding: "utf8" });
  const payload = (command) =>
    JSON.stringify({ tool_name: "Bash", tool_input: { command } });

  it("lệnh được phép: exit 0", () => {
    assert.equal(run(payload("git diff")).status, 0);
  });

  it("lệnh bị chặn: exit 2, stderr nêu lý do", () => {
    const { status, stderr } = run(payload("git push"));
    assert.equal(status, 2);
    assert.match(stderr, /pr-reviewer/);
  });

  it("input hỏng: exit 2, không cho qua", () => {
    assert.equal(run("không phải json").status, 2);
  });
});
