// Chụp một màn của web đang chạy (plan 20) và báo lỗi console, request lỗi.
// Dùng: pnpm exec tsx .claude/skills/verify/scripts/ui.mts --path / --shot .verify/shots/x.png
//         [--login <email>] [--wait-text "<chữ>"] [--base http://localhost:3000]
//         [--step <bước>]...   (plan 28, chạy theo thứ tự sau --wait-text)
// Bước: click:<testid> · fill:<testid>=<giá trị> · select:<testid>=<giá trị> · blur:<testid>
//       wait:<chữ> · gone:<chữ> · url:<chuỗi con của URL> · goto:<path> · shot:<file.png>
//       sleep:<ms> (chờ để một lệnh khác chen vào giữa, vd đổi dữ liệu qua api.sh để thử 409)
//       mark:<nhãn> (plan 29: ghi ms kể từ lúc mở trang vào `marks`, để bấm giờ từng ca)
//       upload:<testid>=<file> (plan 30: gán file cho <input type=file>, đường dẫn tính từ thư mục chạy lệnh)
// --viewport <rộng>x<cao> (plan 30, mặc định 1200x900; điện thoại: 390x844).
// In JSON: url, status, title, viewport, scrollWidth (bề rộng trang thật, > rộng viewport = cuộn ngang),
// consoleErrors, failedRequests, shot, steps, marks. Exit 1 khi đăng nhập lỗi,
// không thấy --wait-text trong 60 giây, hoặc một bước lỗi (dừng ở bước đó; vẫn chụp ảnh để xem).
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "playwright";

const { values: args } = parseArgs({
  options: {
    path: { type: "string", default: "/" },
    shot: { type: "string" },
    login: { type: "string" },
    "wait-text": { type: "string" },
    base: { type: "string", default: "http://localhost:3000" },
    step: { type: "string", multiple: true, default: [] },
    viewport: { type: "string", default: "1200x900" },
  },
});
const STEP_TIMEOUT_MS = 30_000;
const viewportMatch = /^(\d+)x(\d+)$/.exec(args.viewport);
if (viewportMatch === null) {
  console.error("ui.mts: --viewport phải có dạng <rộng>x<cao>, vd 390x844");
  process.exit(2);
}
const viewport = {
  width: Number(viewportMatch[1]),
  height: Number(viewportMatch[2]),
};
if (args.shot === undefined) {
  console.error("ui.mts: thiếu --shot <file.png>");
  process.exit(2);
}
const password = process.env.SEED_PASSWORD ?? "credflow-dev";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport });
let exitCode = 0;
const consoleErrors: string[] = [];
const failedRequests: string[] = [];
// mark:<nhãn> → ms kể từ trước page.goto (plan 29). Trùng nhãn thì báo lỗi bước.
const marks: Record<string, number> = {};
let startedAt = 0;
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
    // Lý do (vd net::ERR_ABORTED) để phân biệt request bị huỷ với lỗi mạng thật (plan 28).
    failedRequests.push(
      `failed ${req.url()} (${req.failure()?.errorText ?? "?"})`,
    );
  });

  startedAt = performance.now();
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
  const steps: string[] = [];
  if (waitError === undefined) {
    for (const step of args.step) {
      try {
        await runStep(page, step);
        steps.push(`ok ${step}`);
      } catch (err) {
        steps.push(
          `FAIL ${step}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
        );
        exitCode = 1;
        break;
      }
    }
  }
  mkdirSync(dirname(args.shot), { recursive: true });
  await page.screenshot({ path: args.shot, fullPage: true });
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  console.log(
    JSON.stringify(
      {
        url: page.url(),
        status: response?.status() ?? null,
        title: await page.title(),
        viewport: args.viewport,
        scrollWidth,
        consoleErrors,
        failedRequests,
        shot: args.shot,
        ...(args.step.length === 0 ? {} : { steps }),
        ...(Object.keys(marks).length === 0 ? {} : { marks }),
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

/** Một bước thao tác. Ném lỗi khi không làm được (không thấy phần tử, quá giờ). */
async function runStep(page: Page, step: string): Promise<void> {
  const colon = step.indexOf(":");
  if (colon < 0) throw new Error("bước phải có dạng <loại>:<tham số>");
  const kind = step.slice(0, colon);
  const arg = step.slice(colon + 1);
  const byTestId = (id: string) => page.getByTestId(id).first();
  const splitValue = () => {
    const eq = arg.indexOf("=");
    if (eq < 0) throw new Error("thiếu =<giá trị>");
    return [arg.slice(0, eq), arg.slice(eq + 1)] as const;
  };
  const opts = { timeout: STEP_TIMEOUT_MS };
  switch (kind) {
    case "click":
      await byTestId(arg).click(opts);
      return;
    case "fill": {
      const [id, value] = splitValue();
      await byTestId(id).fill(value, opts);
      return;
    }
    case "select": {
      const [id, value] = splitValue();
      await byTestId(id).selectOption(value, opts);
      return;
    }
    case "blur":
      await byTestId(arg).blur(opts);
      return;
    case "wait":
      await page.getByText(arg).first().waitFor(opts);
      return;
    case "gone":
      await page
        .getByText(arg)
        .first()
        .waitFor({ ...opts, state: "hidden" });
      return;
    case "url":
      await page.waitForURL((u) => u.toString().includes(arg), opts);
      return;
    case "goto":
      await page.goto(`${args.base}${arg}`);
      return;
    case "sleep":
      await page.waitForTimeout(Number(arg));
      return;
    case "upload": {
      const [id, file] = splitValue();
      await byTestId(id).setInputFiles(file, opts);
      return;
    }
    case "mark":
      if (arg === "") throw new Error("mark cần nhãn");
      if (arg in marks) throw new Error(`nhãn "${arg}" đã dùng`);
      marks[arg] = Math.round(performance.now() - startedAt);
      return;
    case "shot":
      mkdirSync(dirname(arg), { recursive: true });
      await page.screenshot({ path: arg, fullPage: true });
      return;
    default:
      throw new Error(`không biết bước "${kind}"`);
  }
}
