import { describe, expect, it } from "vitest";
import { issuerMatches, nameMatches } from "./names.js";

describe("nameMatches", () => {
  it.each([
    // Cùng một người.
    ["Maren Ostrowe", "Maren Ostrowe"],
    ["MAREN OSTROWE", "Maren Ostrowe"],
    ["  Maren   Ostrowe ", "Maren Ostrowe"],
    ["OSTROWE, MAREN", "Maren Ostrowe"],
    ["Ostrowe,Maren", "Maren Ostrowe"],
    ["Mârén Östrowe", "Maren Ostrowe"],
    ["Maren Ostrowe", "Mârén Östrowe"],
    ["Maren Q. Ostrowe", "Maren Ostrowe"],
    ["OSTROWE, MAREN Q", "Maren Ostrowe"],
    ["DELACROIX JR., MARCUS", "Marcus Delacroix Jr."],
    ["Marcus Delacroix Jr", "Marcus Delacroix Jr."],
    ["Priya Venkataraman-Holt", "Priya Venkataraman-Holt"],
    ["Liam O'Brien", "Liam OBrien"],
  ])("%s khớp %s", (card, legal) => {
    expect(nameMatches(card, [legal])).toBe(true);
  });

  it.each([
    // Không chắc thì không khớp, để người duyệt quyết.
    ["Maren Ostrow", "Maren Ostrowe"],
    ["Karen Ostrowe", "Maren Ostrowe"],
    ["M. Ostrowe", "Maren Ostrowe"],
    ["Maren", "Maren Ostrowe"],
    ["Ostrowe Maren", "Maren Ostrowe"],
    ["DELACROIX, MARCUS", "Marcus Delacroix Jr."],
    ["Jonathan E. Pike", "Jonathan Elsworth Pike"],
    ["Priya Venkataraman Holt", "Priya Venkataraman-Holt"],
    ["DOE, JANE, JR", "Jane Doe"],
    ["", "Maren Ostrowe"],
    ["   ", "Maren Ostrowe"],
  ])("%s không khớp %s", (card, legal) => {
    expect(nameMatches(card, [legal])).toBe(false);
  });

  it("khớp alias", () => {
    expect(
      nameMatches("Jonathan E. Pike", [
        "Jonathan Elsworth Pike",
        "Jonathan Pike",
      ]),
    ).toBe(true);
  });

  it("danh sách tên rỗng thì không khớp", () => {
    expect(nameMatches("Maren Ostrowe", [])).toBe(false);
  });
});

describe("issuerMatches", () => {
  const accepted = [
    "Lifeline Response Institute",
    "Northbridge Safety Council",
  ];

  it.each([
    "Lifeline Response Institute",
    "LIFELINE RESPONSE INSTITUTE",
    "  lifeline   response  institute ",
    "Lifeline Response Institute.",
  ])("%s được chấp nhận", (issuer) => {
    expect(issuerMatches(issuer, accepted)).toBe(true);
  });

  it.each([
    "Lifeline Response Institute, Inc.",
    "Lifeline Response",
    "Harrowgate First Aid Academy",
    "",
    "   ",
  ])("%s không được chấp nhận", (issuer) => {
    expect(issuerMatches(issuer, accepted)).toBe(false);
  });

  it("danh sách rỗng thì không chấp nhận", () => {
    expect(issuerMatches("Lifeline Response Institute", [])).toBe(false);
  });
});
