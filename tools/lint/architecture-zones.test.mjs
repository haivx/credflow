// Test cho guardrail A8 (docs/agent/GUARDRAILS.md, plan 12f).
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";

const ROOT = new URL("../..", import.meta.url).pathname;
const SCRIPT = join(ROOT, "tools/lint/architecture-zones.sh");

const zones = readFileSync(
  join(ROOT, "docs/agent/architecture-zones.txt"),
  "utf8",
)
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

// `ask` chỉ giữ thứ tắt được cổng (plan 12h). Vùng khác dựa vào plan khai trước + CI + owner merge.
const ASK = ["Edit(/.claude/settings.json)", "Edit(/.claude/hooks/**)"];

function checkAsk(ask) {
  assert.deepEqual([...ask].sort(), [...ASK].sort());
}

describe("settings.json và architecture-zones.txt", () => {
  const { permissions } = JSON.parse(
    readFileSync(join(ROOT, ".claude/settings.json"), "utf8"),
  );

  it("ask đúng bằng danh sách cố định, không thừa không thiếu", () => {
    checkAsk(permissions.ask);
  });

  for (const missing of ASK) {
    it(`check đỏ nếu ask thiếu ${missing}`, () => {
      assert.throws(() => checkAsk(ASK.filter((rule) => rule !== missing)));
    });
  }

  it("check đỏ nếu ask bị nới rộng trở lại", () => {
    assert.throws(() => checkAsk([...ASK, "Edit(/eslint.config.mjs)"]));
  });

  it("mỗi đường dẫn trong ask vẫn thuộc danh sách vùng", () => {
    const zoneRules = zones.map((zone) => `Edit(/${zone})`);
    for (const rule of permissions.ask) {
      assert.ok(zoneRules.includes(rule), `không thuộc vùng: ${rule}`);
    }
  });

  it("không có rule Write(path): Claude Code không bao giờ khớp dạng này", () => {
    const all = [...permissions.ask, ...permissions.deny];
    assert.deepEqual(
      all.filter((rule) => rule.startsWith("Write(")),
      [],
    );
  });

  it("deny còn đủ các đường merge, push main, force, xoá nhánh, gỡ ruleset", () => {
    for (const rule of [
      "Bash(gh pr merge)",
      "Bash(gh pr merge *)",
      "Bash(gh api *pulls/*/merge*)",
      "Bash(gh api graphql*)",
      "Bash(git push * main)",
      "Bash(git push * master)",
      "Bash(git push --force*)",
      "Bash(git push * --force*)",
      "Bash(git push * -f*)",
      "Bash(git push * --delete*)",
      "Bash(git push * :*)",
      "Bash(gh api *rulesets*)",
    ]) {
      assert.ok(permissions.deny.includes(rule), `thiếu deny: ${rule}`);
    }
  });
});

describe("architecture-zones.sh trên repo git tạm", () => {
  let repo;
  let base;

  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@example.test", ...args],
      { cwd: repo, encoding: "utf8" },
    ).trim();

  function write(path, content = "x\n") {
    const full = join(repo, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }

  function commitAll() {
    git("add", "-A");
    git("commit", "-q", "-m", "c");
    return git("rev-parse", "HEAD");
  }

  /** Chạy script trên nhánh mới với thay đổi `change`, trả output và summary. */
  function run(change, baseRef = base) {
    git("switch", "-q", "--detach", base);
    change();
    const head = commitAll();
    const summaryFile = join(repo, "..", "summary.md");
    writeFileSync(summaryFile, "");
    const result = spawnSync("bash", [SCRIPT, baseRef, head], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile },
    });
    return { ...result, summary: readFileSync(summaryFile, "utf8") };
  }

  before(() => {
    const parent = mkdtempSync(join(tmpdir(), "zones-"));
    repo = join(parent, "repo");
    mkdirSync(repo);
    git("init", "-q", "-b", "main");
    write(
      "docs/agent/architecture-zones.txt",
      "# comment\n\npackages/contracts/src/**\neslint.config.mjs\n**/package.json\n",
    );
    write("packages/contracts/src/common.ts");
    write("eslint.config.mjs");
    write("README.md");
    write("package.json");
    write("apps/api/package.json");
    base = commitAll();
  });

  after(() => {
    rmSync(dirname(repo), { recursive: true, force: true });
  });

  it("không chạm vùng: thành công, không warning, summary ghi rõ", () => {
    const { status, stdout, summary } = run(() => write("README.md", "y\n"));
    assert.equal(status, 0);
    assert.doesNotMatch(stdout, /::warning/);
    assert.match(summary, /Không chạm vùng kiến trúc/);
  });

  it("chạm vùng: vẫn thành công (không fail), warning từng file, bảng trong summary", () => {
    const { status, stdout, summary } = run(() => {
      write("packages/contracts/src/common.ts", "y\n");
      write("eslint.config.mjs", "y\n");
      write("README.md", "z\n");
    });
    assert.equal(status, 0);
    assert.match(
      stdout,
      /::warning file=packages\/contracts\/src\/common\.ts::/,
    );
    assert.match(stdout, /::warning file=eslint\.config\.mjs::/);
    assert.doesNotMatch(stdout, /README/);
    assert.match(
      summary,
      /\| `packages\/contracts\/src\/common\.ts` \| `packages\/contracts\/src\/\*\*` \|/,
    );
  });

  it("** khớp cả package.json ở gốc lẫn thư mục con", () => {
    const { stdout } = run(() => {
      write("package.json", "y\n");
      write("apps/api/package.json", "y\n");
    });
    assert.match(stdout, /::warning file=package\.json::/);
    assert.match(stdout, /::warning file=apps\/api\/package\.json::/);
  });

  it("chuyển file TỪ packages/contracts/src ra ngoài: cảnh báo đường dẫn cũ", () => {
    const { status, stdout, summary } = run(() => {
      renameSync(
        join(repo, "packages/contracts/src/common.ts"),
        join(repo, "moved.ts"),
      );
    });
    assert.equal(status, 0);
    assert.match(
      stdout,
      /::warning file=packages\/contracts\/src\/common\.ts::/,
    );
    assert.match(summary, /packages\/contracts\/src\/common\.ts/);
    assert.doesNotMatch(stdout, /moved\.ts/);
  });

  it("chuyển file từ ngoài VÀO vùng: cảnh báo đường dẫn mới", () => {
    const { stdout } = run(() => {
      renameSync(
        join(repo, "README.md"),
        join(repo, "packages/contracts/src/from-readme.ts"),
      );
    });
    assert.match(
      stdout,
      /::warning file=packages\/contracts\/src\/from-readme\.ts::/,
    );
  });

  it("tên file có dấu phẩy, hai chấm: được escape theo workflow command", () => {
    const { stdout } = run(() => write("packages/contracts/src/a,b:c.ts"));
    assert.match(
      stdout,
      /::warning file=packages\/contracts\/src\/a%2Cb%3Ac\.ts::/,
    );
  });

  it("base không tồn tại: báo lỗi, không im lặng coi là không chạm vùng", () => {
    const { status, stdout } = run(
      () => write("eslint.config.mjs", "w\n"),
      "0000000000000000000000000000000000000000",
    );
    assert.notEqual(status, 0);
    assert.doesNotMatch(stdout, /Không chạm/);
  });
});
