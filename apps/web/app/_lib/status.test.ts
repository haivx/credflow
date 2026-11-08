import { describe, expect, it } from "vitest";
import { DocumentStatus, RuleCode } from "@credflow/contracts";
import {
  POLL_INTERVAL_MS,
  POLL_MAX_MS,
  pollInterval,
  reasonLabel,
  staffReason,
  statusTone,
  loginErrorText,
  uploadErrorMessage,
} from "./status";

const review = (note?: string) => ({
  action: "reject" as const,
  decidedAt: "2026-11-07T01:00:00.000Z",
  ...(note === undefined ? {} : { note }),
});

describe("staffReason (plan 30)", () => {
  it("giấy đã duyệt không hiện lý do vào hàng chờ, dù routing còn LOW_CONFIDENCE", () => {
    expect(
      staffReason({
        status: "approved",
        routing: { decision: "needs_review", reasons: ["LOW_CONFIDENCE"] },
      }),
    ).toBeNull();
  });

  it("tự duyệt: không có lý do", () => {
    expect(
      staffReason({
        status: "auto_approved",
        routing: { decision: "auto_approve", reasons: [] },
      }),
    ).toBeNull();
  });

  it("chờ duyệt: lý do bằng tiếng Việt, không lộ mã rule", () => {
    const out = staffReason({
      status: "needs_review",
      routing: {
        decision: "needs_review",
        reasons: ["MISSING_FIELD", "EXPIRED"],
      },
    });
    expect(out).toBe(`${reasonLabel.MISSING_FIELD}; ${reasonLabel.EXPIRED}`);
    expect(out).not.toMatch(/[A-Z]{3,}_/);
  });

  it("bị từ chối / phải nộp lại: ghi chú của người duyệt", () => {
    expect(
      staffReason({
        status: "rejected",
        lastReview: review("Thẻ của người khác"),
      }),
    ).toBe("Thẻ của người khác");
    expect(
      staffReason({
        status: "reupload_requested",
        lastReview: { ...review("Ảnh mờ"), action: "request_reupload" },
      }),
    ).toBe("Ảnh mờ");
  });
});

describe("reasonLabel", () => {
  it("có câu cho mọi RuleCode", () => {
    for (const code of RuleCode.options) {
      expect(reasonLabel[code].length).toBeGreaterThan(0);
    }
  });
});

describe("statusTone", () => {
  it("mọi trạng thái có màu; xong tốt = success, chờ = warning, hỏng = destructive", () => {
    for (const s of DocumentStatus.options) expect(statusTone(s)).toBeTruthy();
    expect(statusTone("auto_approved")).toBe("success");
    expect(statusTone("approved")).toBe("success");
    expect(statusTone("needs_review")).toBe("warning");
    expect(statusTone("processing")).toBe("info");
    expect(statusTone("rejected")).toBe("destructive");
    expect(statusTone("reupload_requested")).toBe("destructive");
    expect(statusTone("failed")).toBe("destructive");
  });
});

describe("pollInterval", () => {
  const T0 = 1_000_000;
  const processing = [{ status: "processing" as const }];
  const done = [{ status: "auto_approved" as const }];

  it("còn giấy đang xử lý và chưa quá 2 phút → hỏi lại sau 2 giây", () => {
    expect(pollInterval(processing, T0, T0 + 5_000)).toBe(POLL_INTERVAL_MS);
  });
  it("quá 2 phút → dừng", () => {
    expect(pollInterval(processing, T0, T0 + POLL_MAX_MS + 1)).toBe(false);
  });
  it("không còn giấy đang xử lý hoặc chưa có dữ liệu → dừng", () => {
    expect(pollInterval(done, T0, T0)).toBe(false);
    expect(pollInterval(undefined, T0, T0)).toBe(false);
  });
});

describe("câu báo 429 (plan 34)", () => {
  it("upload vượt giới hạn → câu riêng, không dùng câu của server", () => {
    expect(uploadErrorMessage("TOO_MANY_REQUESTS", "msg server")).toMatch(
      /thử lại/,
    );
    expect(uploadErrorMessage("TOO_MANY_REQUESTS", "msg server")).not.toBe(
      "msg server",
    );
  });

  it("đăng nhập: 401 sai mật khẩu, 429 bị chặn tạm thời, mã khác kèm message", () => {
    expect(loginErrorText(401, "x")).toBe("Sai email hoặc mật khẩu.");
    expect(loginErrorText(429, "x")).toMatch(/quá nhiều lần/);
    expect(loginErrorText(500, "Lỗi máy chủ")).toBe(
      "Không đăng nhập được: Lỗi máy chủ",
    );
  });
});
