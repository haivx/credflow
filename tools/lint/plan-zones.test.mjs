// Test cho plan-zones.mjs (guardrail A8, plan 23): CI đỏ khi PR chạm vùng kiến trúc mà không khai.
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";

const ROOT = new URL("../..", import.meta.url).pathname;
const SCRIPT = join(ROOT, "tools/lint/plan-zones.mjs");

const plan = (zoneSection) =>
  `# 99 · Thử\n\n## Mục tiêu\n\nx\n\n## Vùng kiến trúc bị chạm\n\n${zoneSection}\n\n## Contract\n\n\`CLAUDE.md\` ở mục khác không tính.\n`;

describe("plan-zones.mjs trên repo git tạm", () => {
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

  /** Commit thay đổi `change` trên nhánh từ base, chạy script, trả kết quả và summary. */
  function run(change, { prBody = "", baseRef = base } = {}) {
    git("switch", "-q", "--detach", base);
    change();
    git("add", "-A");
    git("commit", "-q", "--allow-empty", "-m", "c");
    const head = git("rev-parse", "HEAD");
    const summaryFile = join(repo, "..", "summary.md");
    writeFileSync(summaryFile, "");
    const result = spawnSync("node", [SCRIPT, baseRef, head], {
      cwd: repo,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_STEP_SUMMARY: summaryFile,
        PR_BODY: prBody,
      },
    });
    return { ...result, summary: readFileSync(summaryFile, "utf8") };
  }

  before(() => {
    const parent = mkdtempSync(join(tmpdir(), "plan-zones-"));
    repo = join(parent, "repo");
    mkdirSync(repo);
    git("init", "-q", "-b", "main");
    write(
      "docs/agent/architecture-zones.txt",
      "# vùng\n\npackages/contracts/src/**\nCLAUDE.md\n.claude/skills/verify/**\n**/package.json\n",
    );
    write("CLAUDE.md");
    write("packages/contracts/src/eval.ts");
    write(".claude/skills/verify/FEATURE_MAP.md");
    write("apps/api/package.json");
    write("README.md");
    write("docs/plans/README.md", "## Vùng kiến trúc bị chạm\n\n`CLAUDE.md`\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    base = git("rev-parse", "HEAD");
  });

  after(() => {
    rmSync(dirname(repo), { recursive: true, force: true });
  });

  it("không chạm vùng: qua", () => {
    const r = run(() => write("README.md", "y\n"));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.summary, /Không chạm vùng kiến trúc/);
  });

  it("chạm CLAUDE.md, plan khai đúng tên file: qua", () => {
    const r = run(() => {
      write("CLAUDE.md", "y\n");
      write("docs/plans/99-thu.md", plan("- `CLAUDE.md`"));
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  it("chạm file trong vùng, plan khai bằng glob: qua", () => {
    const r = run(() => {
      write("packages/contracts/src/eval.ts", "y\n");
      write("apps/api/package.json", "{}\n");
      write(
        "docs/plans/99-thu.md",
        plan("- `packages/contracts/src/**`\n- `**/package.json`"),
      );
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  it("khai bằng glob rộng hơn vùng (`**` đi qua nhiều cấp thư mục): qua", () => {
    const r = run(() => {
      write(".claude/skills/verify/FEATURE_MAP.md", "y\n");
      write("docs/plans/99-thu.md", plan("- `.claude/**`"));
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  it('chạm vùng, plan khai "Không": fail, liệt kê file', () => {
    const r = run(() => {
      write(".claude/skills/verify/FEATURE_MAP.md", "y\n");
      write("docs/plans/99-thu.md", plan("Không."));
    });
    assert.equal(r.status, 1);
    assert.match(
      r.stdout,
      /::error file=\.claude\/skills\/verify\/FEATURE_MAP\.md::/,
    );
    assert.match(r.summary, /FEATURE_MAP\.md/);
  });

  it("khai bằng chữ thường (không backtick): không tính, fail", () => {
    const r = run(() => {
      write(".claude/skills/verify/FEATURE_MAP.md", "y\n");
      write(
        "docs/plans/99-thu.md",
        plan("- .claude/skills/verify/FEATURE_MAP.md"),
      );
    });
    assert.equal(r.status, 1);
  });

  it("đường dẫn trong backtick ở mục khác của plan: không tính", () => {
    const r = run(() => {
      write("CLAUDE.md", "y\n");
      write("docs/plans/99-thu.md", plan("Không."));
    });
    assert.equal(r.status, 1);
  });

  it("glob `*` không đi qua `/`: `.claude/*` không khai được file ở thư mục con", () => {
    const r = run(() => {
      write(".claude/skills/verify/FEATURE_MAP.md", "y\n");
      write("docs/plans/99-thu.md", plan("- `.claude/*`"));
    });
    assert.equal(r.status, 1);
  });

  it("không có plan, mô tả PR có mục khai: qua", () => {
    const r = run(() => write(".claude/skills/verify/FEATURE_MAP.md", "y\n"), {
      prBody:
        "Sửa nhỏ.\n\n## Vùng kiến trúc bị chạm\n\n`.claude/skills/verify/**`\n\n## Kiểm\n",
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  it('không có plan, mô tả PR ghi "Vùng kiến trúc:" không đúng tiêu đề: fail', () => {
    const r = run(() => write(".claude/skills/verify/FEATURE_MAP.md", "y\n"), {
      prBody: "Vùng kiến trúc: `.claude/skills/verify/**`.\n",
    });
    assert.equal(r.status, 1);
  });

  it("docs/plans/README.md không được tính là plan", () => {
    const r = run(() => {
      write("CLAUDE.md", "y\n");
      write(
        "docs/plans/README.md",
        "## Vùng kiến trúc bị chạm\n\n`CLAUDE.md`\n\nsửa\n",
      );
    });
    assert.equal(r.status, 1);
  });

  it("base không tồn tại: exit 2", () => {
    const r = run(() => write("README.md", "z\n"), {
      baseRef: "khong-co-nhanh-nay",
    });
    assert.equal(r.status, 2);
  });
});
