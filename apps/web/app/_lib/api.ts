import { ApiError } from "@credflow/contracts";

/** Kết quả gọi API: thành công kèm dữ liệu đã parse, hoặc lỗi theo `ApiError`. */
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiError };

/** Schema bất kỳ của contracts: chỉ cần `safeParse`. */
interface Schema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false };
}

/**
 * Gọi API qua rewrite `/api/*` (cùng site nên cookie session được gửi kèm). Response thành công
 * parse bằng schema của contracts; response lỗi parse bằng `ApiError`. Không bao giờ ném lỗi.
 */
export async function apiFetch<T>(
  path: string,
  schema: Schema<T>,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const sent = await send(path, init);
  if (!sent.ok) return sent;
  const parsed = schema.safeParse(sent.data);
  if (!parsed.success) {
    return {
      ok: false,
      status: sent.status,
      error: { code: "INTERNAL", message: "Response không đúng contract" },
    };
  }
  return { ok: true, status: sent.status, data: parsed.data };
}

/** Như `apiFetch` cho route không trả body (204). */
export async function apiSend(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<null>> {
  const sent = await send(path, init);
  return sent.ok ? { ok: true, status: sent.status, data: null } : sent;
}

async function send(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<unknown>> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { credentials: "same-origin", ...init });
  } catch {
    return {
      ok: false,
      status: 0,
      error: { code: "INTERNAL", message: "Không kết nối được máy chủ" },
    };
  }

  const body: unknown =
    res.status === 204 ? null : await res.json().catch(() => null);
  if (res.ok) return { ok: true, status: res.status, data: body };

  const parsed = ApiError.safeParse(body);
  return {
    ok: false,
    status: res.status,
    error: parsed.success
      ? parsed.data
      : { code: "INTERNAL", message: `Lỗi máy chủ (${res.status})` },
  };
}
