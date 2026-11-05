// So khớp không fuzzy (product.md mục 5): không khớp chắc thì không khớp, để người duyệt quyết.

function stripMarks(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function collapse(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** "DOE, JANE Q." → "jane doe". Nhiều hơn một dấu phẩy thì không đoán, giữ nguyên để không khớp. */
function normalizeName(name: string): string {
  const cleaned = collapse(stripMarks(name).replace(/[.'’]/g, ""));
  const parts = cleaned.split(",");
  const ordered =
    parts.length === 2 ? `${parts[1] ?? ""} ${parts[0] ?? ""}` : cleaned;
  const tokens = collapse(ordered).split(" ");
  // Chỉ bỏ tên đệm viết tắt: ký tự đầu và cuối là tên và họ, không được bỏ.
  return tokens
    .filter(
      (token, i) => i === 0 || i === tokens.length - 1 || token.length > 1,
    )
    .join(" ");
}

function normalizeIssuer(issuer: string): string {
  return collapse(stripMarks(issuer).replace(/[^\p{L}\p{N}\s]/gu, ""));
}

/** Tên trên giấy có trùng một trong các tên hợp lệ của nhân viên không. */
export function nameMatches(
  cardName: string,
  knownNames: readonly string[],
): boolean {
  const card = normalizeName(cardName);
  if (card === "") return false;
  return knownNames.some((name) => normalizeName(name) === card);
}

export function issuerMatches(
  issuer: string,
  accepted: readonly string[],
): boolean {
  const normalized = normalizeIssuer(issuer);
  if (normalized === "") return false;
  return accepted.some((name) => normalizeIssuer(name) === normalized);
}
