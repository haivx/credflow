import type { GoldenCase, StaffProfile } from "@credflow/contracts";
import { addDays, addMonths } from "@credflow/rules";
import {
  COURSES,
  FIRST_NAMES,
  LAST_NAMES,
  UNACCEPTED_ISSUERS,
} from "./names.js";
import {
  expectedDecision,
  SCENARIOS,
  type Scenario,
  type ScenarioKind,
} from "./policy.js";
import { createRng, type Rng } from "./rng.js";

/** "Hôm nay" của mọi ca synth: rule hết hạn tái lập được. */
export const AS_OF = "2026-11-06";
const MONTH_START = "2026-11-01";
const VALIDITY_SENTENCE = "Valid 2 years from the date of completion.";
const VALIDITY_MONTHS = 24;

export type Layout =
  "renewal-bar" | "certificate" | "wallet-validity" | "valid-through";
export type Format = "png" | "jpg" | "pdf";

/** Tham số nhiễu áp bằng CSS lúc render (plan 19). */
export interface Noise {
  rotateDeg: number;
  blurPx: number;
  tiltXDeg: number;
  tiltYDeg: number;
  jpegQuality: number;
}

export interface SynthCard {
  id: string;
  scenario: ScenarioKind;
  layout: Layout;
  format: Format;
  noise: Noise | null;
  split: "dev" | "holdout";
  staff: StaffProfile;
  asOf: string;
  /** Sự thật của thẻ, dạng YYYY-MM-DD. */
  truth: { completionDate: string; expirationDate: string };
  /** Chữ in trên thẻ. */
  printed: {
    holderName: string;
    issuerName: string;
    courseType: string;
    cardNumber: string;
    completionText: string;
    expiryText: string | null;
    validityText: string | null;
  };
}

/** 10 kịch bản có 1 ca holdout; trộn cả hai loại decision. */
const HOLDOUT_KINDS: readonly ScenarioKind[] = [
  "clean",
  "expired",
  "rotated",
  "issuer_not_accepted",
  "name_variant_ok",
  "other_person",
  "validity_text",
  "month_only",
  "blurred",
  "ambiguous_date",
];

const NOISY: readonly ScenarioKind[] = ["rotated", "blurred", "skewed"];

/**
 * Sinh toàn bộ thẻ theo bảng kịch bản. Thứ tự gọi rng cố định: kịch bản theo thứ tự bảng, rồi
 * xáo, rồi đặt id, rồi chọn holdout. Cùng seed → cùng kết quả.
 */
export function buildCards(
  seed: number,
  acceptedIssuers: readonly string[],
): SynthCard[] {
  if (acceptedIssuers.length === 0) {
    throw new Error("Config không có acceptedIssuers cho cpr_card");
  }
  const rng = createRng(seed);
  const drafts = SCENARIOS.flatMap((scenario) =>
    Array.from({ length: scenario.count }, (_, i) =>
      makeCard(scenario, i, rng, acceptedIssuers),
    ),
  );
  const cards = rng.shuffle(drafts).map((card, index) => ({
    ...card,
    id: `synth-cpr-${String(index + 1).padStart(4, "0")}`,
    staff: {
      ...card.staff,
      id: `synth-staff-${String(index + 1).padStart(4, "0")}`,
    },
  }));

  const holdout = new Set(
    HOLDOUT_KINDS.map((kind) => cards.find((c) => c.scenario === kind)?.id),
  );
  return cards.map((card) => ({
    ...card,
    split: holdout.has(card.id) ? "holdout" : "dev",
  }));
}

export function toGoldenCase(card: SynthCard): GoldenCase {
  const ambiguous = card.scenario === "ambiguous_date";
  const fields: Record<string, string | null> = {
    holderName: card.printed.holderName,
    issuerName: card.printed.issuerName,
    courseType: card.printed.courseType,
    cardNumber: card.printed.cardNumber,
    // Ngày mơ hồ: prompt để trống, nên đáp án là null.
    completionDate: ambiguous ? null : card.truth.completionDate,
  };
  if (card.layout === "renewal-bar" || card.layout === "certificate") {
    fields.expirationDate = ambiguous ? null : card.truth.expirationDate;
    fields.validityText = null;
  } else if (card.layout === "wallet-validity") {
    fields.expirationDate = null;
    fields.validityText = card.printed.validityText;
  }
  // valid-through: hạn phải suy từ tháng/năm, không so (plan 19 mục duyệt 2).

  const scenario = SCENARIOS.find((s) => s.kind === card.scenario);
  return {
    id: card.id,
    file: `data/synth/cpr/${card.id}.${card.format}`,
    staff: card.staff,
    asOf: card.asOf,
    expected: {
      docType: "cpr_card",
      fields,
      decision: expectedDecision(card.scenario),
    },
    tags: scenario?.tags ?? [],
    split: card.split,
  };
}

function makeCard(
  scenario: Scenario,
  index: number,
  rng: Rng,
  acceptedIssuers: readonly string[],
): SynthCard {
  const kind = scenario.kind;
  const layout = pickLayout(kind, index);
  const noise = NOISY.includes(kind) ? makeNoise(kind, rng) : null;
  const truth = makeDates(kind, rng);
  const { staff, holderName } = makePerson(kind, index, rng);
  const issuerName =
    kind === "issuer_not_accepted"
      ? rng.pick(UNACCEPTED_ISSUERS)
      : rng.pick(acceptedIssuers);
  const initials = issuerName
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z]/g, "").charAt(0))
    .join("")
    .toUpperCase();

  return {
    id: "",
    scenario: kind,
    layout,
    format: noise !== null ? "jpg" : layout === "certificate" ? "pdf" : "png",
    noise,
    split: "dev",
    staff,
    asOf: AS_OF,
    truth,
    printed: {
      holderName,
      issuerName,
      courseType: rng.pick(COURSES),
      cardNumber: `${initials}-${String(rng.int(100000, 999999))}`,
      ...printedDates(layout, truth),
    },
  };
}

function pickLayout(kind: ScenarioKind, index: number): Layout {
  if (kind === "validity_text") return "wallet-validity";
  if (kind === "month_only") return "valid-through";
  if (kind === "ambiguous_date") return "renewal-bar";
  return index % 2 === 0 ? "renewal-bar" : "certificate";
}

function makeNoise(kind: ScenarioKind, rng: Rng): Noise {
  const sign = () => (rng.int(0, 1) === 0 ? -1 : 1);
  if (kind === "rotated") {
    return {
      rotateDeg: sign() * rng.int(4, 12),
      blurPx: 0,
      tiltXDeg: 0,
      tiltYDeg: 0,
      jpegQuality: 65,
    };
  }
  if (kind === "blurred") {
    return {
      rotateDeg: sign() * rng.int(0, 2),
      blurPx: rng.int(10, 18) / 10,
      tiltXDeg: 0,
      tiltYDeg: 0,
      jpegQuality: 55,
    };
  }
  return {
    rotateDeg: sign() * rng.int(1, 4),
    blurPx: 0,
    tiltXDeg: rng.int(8, 16),
    tiltYDeg: sign() * rng.int(10, 22),
    jpegQuality: 60,
  };
}

/** Ngày trong tháng 13–28 để M/D không mơ hồ và không vướng cuối tháng. */
function withDay(monthStart: string, day: number): string {
  return `${monthStart.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

function makeDates(
  kind: ScenarioKind,
  rng: Rng,
): { completionDate: string; expirationDate: string } {
  if (kind === "expiring_soon") {
    const expirationDate = addDays(AS_OF, rng.int(7, 23));
    return {
      completionDate: addMonths(expirationDate, -VALIDITY_MONTHS),
      expirationDate,
    };
  }
  if (kind === "expired") {
    const expirationDate = withDay(
      addMonths(MONTH_START, -rng.int(1, 10)),
      rng.int(13, 28),
    );
    return {
      completionDate: addMonths(expirationDate, -VALIDITY_MONTHS),
      expirationDate,
    };
  }
  if (kind === "ambiguous_date") {
    const month = rng.int(1, 12);
    let day = rng.int(1, 12);
    if (day === month) day = (day % 12) + 1;
    const year = month <= 9 ? 2026 : 2025;
    const completionDate = `${String(year)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return {
      completionDate,
      expirationDate: addMonths(completionDate, VALIDITY_MONTHS),
    };
  }
  const completionDate = withDay(
    addMonths(MONTH_START, -rng.int(2, 18)),
    rng.int(13, 28),
  );
  return {
    completionDate,
    expirationDate: addMonths(completionDate, VALIDITY_MONTHS),
  };
}

function makePerson(
  kind: ScenarioKind,
  index: number,
  rng: Rng,
): { staff: StaffProfile; holderName: string } {
  const first = rng.pick(FIRST_NAMES);
  const last = rng.pick(LAST_NAMES);
  const legalName = `${first} ${last}`;
  const staff: StaffProfile = {
    id: "",
    legalName,
    aliases: [],
    role: "caregiver",
    clientIds: [],
    region: "CA",
  };

  if (kind === "name_variant_ok") {
    const variant = index % 3;
    if (variant === 0) {
      return {
        staff,
        holderName: `${last.toUpperCase()}, ${first.toUpperCase()}`,
      };
    }
    if (variant === 1) {
      const alias = `${first} ${otherThan(LAST_NAMES, last, rng)}`;
      return { staff: { ...staff, aliases: [alias] }, holderName: alias };
    }
    const initial = String.fromCharCode(65 + rng.int(0, 25));
    return { staff, holderName: `${first} ${initial}. ${last}` };
  }
  if (kind === "name_variant_bad") {
    if (index % 2 === 0) {
      return { staff, holderName: `${first.charAt(0)}. ${last}` };
    }
    return {
      staff: { ...staff, legalName: `${legalName} Jr.` },
      holderName: legalName,
    };
  }
  if (kind === "other_person") {
    return {
      staff,
      holderName: `${otherThan(FIRST_NAMES, first, rng)} ${otherThan(LAST_NAMES, last, rng)}`,
    };
  }
  return { staff, holderName: legalName };
}

function otherThan<T>(items: readonly T[], not: T, rng: Rng): T {
  return rng.pick(items.filter((item) => item !== not));
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parts(date: string): { y: string; m: number; d: number } {
  return {
    y: date.slice(0, 4),
    m: Number(date.slice(5, 7)),
    d: Number(date.slice(8, 10)),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

function printedDates(
  layout: Layout,
  truth: { completionDate: string; expirationDate: string },
): Pick<
  SynthCard["printed"],
  "completionText" | "expiryText" | "validityText"
> {
  const c = parts(truth.completionDate);
  const e = parts(truth.expirationDate);
  if (layout === "renewal-bar") {
    return {
      completionText: `${String(c.m)}/${String(c.d)}/${c.y}`,
      expiryText: `${String(e.m)}/${String(e.d)}/${e.y}`,
      validityText: null,
    };
  }
  if (layout === "certificate") {
    return {
      completionText: `${MONTH_NAMES[c.m - 1] ?? ""} ${String(c.d)}, ${c.y}`,
      expiryText: `${MONTH_NAMES[e.m - 1] ?? ""} ${String(e.d)}, ${e.y}`,
      validityText: null,
    };
  }
  if (layout === "wallet-validity") {
    return {
      completionText: truth.completionDate,
      expiryText: null,
      validityText: VALIDITY_SENTENCE,
    };
  }
  return {
    completionText: `${pad(c.m)}/${pad(c.d)}/${c.y}`,
    expiryText: `${pad(e.m)}/${e.y}`,
    validityText: null,
  };
}
