import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Extraction, StaffProfile } from "@credflow/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  configsFor,
  evaluateRules,
  evaluateRulesForConfigs,
  loadRulesConfigSet,
  route,
  rulesVersion,
} from "./index.js";

// Plan 25: config theo khách hàng, chấm theo mọi khách của staff, lấy chặt nhất.

const BASE = `version: 1
minFieldConfidence: 0.85
expiringSoonDays: 30
roles:
  caregiver:
    required: [cpr_card]
defaultValidityMonths:
  cpr_card: 24
`;
const yaml = (
  name: string,
  extra: string,
  issuers = ["Northbridge Safety Council"],
) =>
  `${BASE}name: ${name}\n${extra}acceptedIssuers:\n  cpr_card:\n${issuers.map((i) => `    - ${i}\n`).join("")}`;

const field = (value: string, quote = value) => ({
  value,
  confidence: 0.95,
  evidence: { quote },
});
const empty = { value: null, confidence: 0, evidence: null };
const card = (
  issuer: string,
  completion = field("2026-03-14", "March 14, 2026"),
  expiration = field("2028-03-14", "March 14, 2028"),
): Extraction => ({
  docType: "cpr_card",
  fields: {
    holderName: field("Maren Ostrowe"),
    issuerName: field(issuer),
    courseType: field("Adult CPR"),
    completionDate: completion,
    expirationDate: expiration,
    validityText: empty,
    cardNumber: field("NSC-1"),
  },
});
const STAFF: StaffProfile = {
  id: "s1",
  legalName: "Maren Ostrowe",
  aliases: [],
  role: "caregiver",
  clientIds: [],
  region: "CA",
};
const input = (extraction: Extraction) => ({
  extraction,
  classification: { docType: "cpr_card" as const, confidence: 0.97 },
  staff: STAFF,
  asOf: "2026-11-06",
});

describe("loadRulesConfigSet", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rules-set-"));
    mkdirSync(join(dir, "clients"));
    writeFileSync(
      join(dir, "default.yaml"),
      yaml("default", "dateOrder: strict\n"),
    );
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("đọc default + mọi file trong clients/, khoá theo tên file (clientId)", () => {
    writeFileSync(
      join(dir, "clients", "C1.yaml"),
      yaml("sunrise", "dateOrder: MDY\n"),
    );
    const set = loadRulesConfigSet(dir);
    expect(set.default.name).toBe("default");
    expect(set.byClient.C1?.name).toBe("sunrise");
    expect(set.byClient.C1?.dateOrder).toBe("MDY");
  });

  it("file khách hàng sai schema: lỗi nêu đúng file", () => {
    writeFileSync(join(dir, "clients", "C2.yaml"), "version: 1\nname: x\n");
    expect(() => loadRulesConfigSet(dir)).toThrow("C2.yaml");
  });

  it("file khách hàng thiếu name, hoặc trùng name: lỗi", () => {
    writeFileSync(
      join(dir, "clients", "C3.yaml"),
      BASE + "acceptedIssuers: {}\n",
    );
    expect(() => loadRulesConfigSet(dir)).toThrow("C3.yaml");
    rmSync(join(dir, "clients", "C3.yaml"));
    writeFileSync(join(dir, "clients", "C4.yaml"), yaml("sunrise", ""));
    writeFileSync(join(dir, "clients", "C5.yaml"), yaml("sunrise", ""));
    expect(() => loadRulesConfigSet(dir)).toThrow("sunrise");
  });

  it("không có thư mục clients/: chỉ default", () => {
    rmSync(join(dir, "clients"), { recursive: true });
    expect(loadRulesConfigSet(dir).byClient).toEqual({});
  });
});

describe("configsFor, rulesVersion", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rules-set-"));
    mkdirSync(join(dir, "clients"));
    writeFileSync(join(dir, "default.yaml"), yaml("default", ""));
    writeFileSync(
      join(dir, "clients", "S.yaml"),
      yaml("sunrise", "dateOrder: MDY\n"),
    );
    writeFileSync(join(dir, "clients", "B.yaml"), yaml("bayleaf", ""));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it.each([
    [[], ["default"]],
    [["S"], ["sunrise"]],
    [
      ["S", "B"],
      ["bayleaf", "sunrise"],
    ],
    [
      ["B", "S", "S"],
      ["bayleaf", "sunrise"],
    ],
    [["KHONG-CO"], ["default"]],
    [
      ["S", "KHONG-CO"],
      ["default", "sunrise"],
    ],
  ])("clientIds %j → %j", (ids, names) => {
    const configs = configsFor(loadRulesConfigSet(dir), ids);
    expect(configs.map((c) => c.name)).toEqual(names);
  });

  it("rulesVersion: tên@version, sắp cố định", () => {
    const set = loadRulesConfigSet(dir);
    expect(rulesVersion(configsFor(set, ["S", "B"]))).toBe(
      "bayleaf@1+sunrise@1",
    );
    expect(rulesVersion(configsFor(set, []))).toBe("default@1");
  });
});

describe("evaluateRulesForConfigs", () => {
  const parseYaml = (text: string) => {
    const dir = mkdtempSync(join(tmpdir(), "rules-one-"));
    writeFileSync(join(dir, "default.yaml"), text);
    const config = loadRulesConfigSet(dir).default;
    rmSync(dir, { recursive: true, force: true });
    return config;
  };
  const A = parseYaml(yaml("alpha", ""));
  const B = parseYaml(
    yaml("bravo", "", [
      "Northbridge Safety Council",
      "Harrowgate First Aid Academy",
    ]),
  );

  it("một config: giống hệt evaluateRules", () => {
    const one = evaluateRulesForConfigs(
      input(card("Northbridge Safety Council")),
      [A],
    );
    expect(one).toEqual(
      evaluateRules({
        ...input(card("Northbridge Safety Council")),
        config: A,
      }),
    );
  });

  it("tổ chức chỉ config B chấp nhận: chấm theo [A, B] thì không qua, message có tên config trượt", () => {
    const results = evaluateRulesForConfigs(
      input(card("Harrowgate First Aid Academy")),
      [A, B],
    );
    const issuer = results.find((r) => r.code === "ISSUER_NOT_ACCEPTED");
    expect(issuer?.passed).toBe(false);
    expect(issuer?.message.startsWith("[alpha] ")).toBe(true);
    expect(route(results).decision).toBe("needs_review");
  });

  it("chỉ config B: qua, tự duyệt", () => {
    const results = evaluateRulesForConfigs(
      input(card("Harrowgate First Aid Academy")),
      [B],
    );
    expect(route(results).decision).toBe("auto_approve");
  });

  it("danh sách config rỗng: lỗi (không bao giờ chấm mà không có config)", () => {
    expect(() => evaluateRulesForConfigs(input(card("x")), [])).toThrow();
  });
});

describe("dateOrder", () => {
  const withOrder = (order: string) => {
    const dir = mkdtempSync(join(tmpdir(), "rules-order-"));
    writeFileSync(
      join(dir, "default.yaml"),
      yaml("x", `dateOrder: ${order}\n`),
    );
    const config = loadRulesConfigSet(dir).default;
    rmSync(dir, { recursive: true, force: true });
    return config;
  };
  const ambiguous = (completion: string) =>
    card(
      "Northbridge Safety Council",
      field(completion, "Completed 3/9/2026"),
      field(
        completion.replace("2026", "2028"),
        completion.startsWith("2026-03")
          ? "Expires 3/9/2028"
          : "Expires 3/9/2028",
      ),
    );
  const dateRule = (order: string, completion: string) =>
    evaluateRules({
      ...input(ambiguous(completion)),
      config: withOrder(order),
    }).find((r) => r.code === "DATE_INCONSISTENT");

  it("strict: 3/9/2026 mơ hồ, không qua", () => {
    expect(dateRule("strict", "2026-03-09")?.passed).toBe(false);
  });

  it("MDY: 3/9/2026 = 9 tháng 3; LLM điền 2026-03-09 thì qua", () => {
    expect(dateRule("MDY", "2026-03-09")?.passed).toBe(true);
  });

  it("MDY mà LLM điền ngược 2026-09-03: không qua, message nói thứ tự của khách hàng", () => {
    const rule = dateRule("MDY", "2026-09-03");
    expect(rule?.passed).toBe(false);
    expect(rule?.message).toContain("thứ tự");
  });

  it("DMY: 3/9/2026 = 3 tháng 9; LLM điền 2026-09-03 thì qua", () => {
    expect(dateRule("DMY", "2026-09-03")?.passed).toBe(true);
  });

  it("config không ghi dateOrder: mặc định strict", () => {
    const dir = mkdtempSync(join(tmpdir(), "rules-def-"));
    writeFileSync(join(dir, "default.yaml"), yaml("x", ""));
    expect(loadRulesConfigSet(dir).default.dateOrder).toBe("strict");
    rmSync(dir, { recursive: true, force: true });
  });
});
