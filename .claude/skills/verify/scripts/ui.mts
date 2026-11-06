// Chụp một màn của web đang chạy (plan 20) và báo lỗi console, request lỗi.
// Dùng: pnpm exec tsx .claude/skills/verify/scripts/ui.mts --path / --shot .verify/shots/x.png
//         [--login <email>] [--wait-text "<chữ>"] [--base http://localhost:3000]
// In JSON: url, status, title, consoleErrors, failedRequests, shot. Exit 1 khi đăng nhập lỗi hoặc
// không thấy --wait-text trong 60 giây (vẫn chụp ảnh để xem).
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const { values: args } = parseArgs({
  options: {
    path: { type: "string", default: "/" },
    shot: { type: "string" },
    login: { type: "string" },
    "wait-text": { type: "string" },
    base: { type: "string", default: "http://localhost:3000" },
  },
});
if (args.shot === undefined) {
  console.error("ui.mts: thiếu --shot <file.png>");
  process.exit(2);
}
const password = process.env.SEED_PASSWORD ?? "credflow-dev";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1200, height: 900 },
});
let exitCode = 0;
const consoleErrors: string[] = [];
const failedRequests: string[] = [];
try {
  if (args.login !== undefined) {
    // Gọi qua rewrite /api của web: cookie đặt cho đúng site của trang.
    const res = await context.request.post(`${args.base}/api/auth/login`, {
      data: { email: args.login, password },
    });
    if (!res.ok()) {
      console.error(
        `ui.mts: đăng nhập ${args.login} lỗi (${String(res.status())})`,
      );
      process.exit(1);
    }
  }

  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      failedRequests.push(`${String(res.status())} ${res.url()}`);
    }
  });
  page.on("requestfailed", (req) => {
    failedRequests.push(`failed ${req.url()}`);
  });

  const response = await page.goto(`${args.base}${args.path}`);
  let waitError: string | undefined;
  if (args["wait-text"] !== undefined) {
    try {
      await page
        .getByText(args["wait-text"])
        .first()
        .waitFor({ timeout: 60_000 });
    } catch {
      waitError = `không thấy "${args["wait-text"]}" sau 60 giây`;
      exitCode = 1;
    }
  }
  mkdirSync(dirname(args.shot), { recursive: true });
  await page.screenshot({ path: args.shot, fullPage: true });
  console.log(
    JSON.stringify(
      {
        url: page.url(),
        status: response?.status() ?? null,
        title: await page.title(),
        consoleErrors,
        failedRequests,
        shot: args.shot,
        ...(waitError === undefined ? {} : { error: waitError }),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
process.exit(exitCode);
