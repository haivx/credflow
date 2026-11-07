"use client";

import {
  type ApiError,
  AuthUser,
  DocumentList,
  type LoginRequest,
  UploadDocumentResponse,
} from "@credflow/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch, apiSend, type ApiResult } from "./api";
import { pollInterval } from "./status";

/**
 * Dữ liệu của web qua TanStack Query (plan 30). Gọi API vẫn đi qua `apiFetch` (parse bằng Zod
 * của contracts); ở đây chỉ đổi kết quả `ok: false` thành lỗi ném ra để Query biết là lỗi.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError,
  ) {
    super(error.message);
    this.name = "ApiRequestError";
  }
}

function unwrap<T>(res: ApiResult<T>): T {
  if (!res.ok) throw new ApiRequestError(res.status, res.error);
  return res.data;
}

/** Query key đặt một chỗ: invalidate đúng key, không gõ tay chuỗi ở nhiều nơi. */
export const queryKeys = {
  me: ["auth", "me"] as const,
  myDocuments: ["documents", "mine"] as const,
};

/** User đang đăng nhập; `null` = chưa đăng nhập (401 không phải lỗi). */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async (): Promise<AuthUser | null> => {
      const res = await apiFetch("/auth/me", AuthUser);
      if (!res.ok && res.status === 401) return null;
      return unwrap(res);
    },
    staleTime: 60_000,
  });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: LoginRequest) =>
      unwrap(
        await apiFetch("/auth/login", AuthUser, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      ),
    onSuccess: (user) => {
      client.setQueryData(queryKeys.me, user);
    },
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(await apiSend("/auth/logout", { method: "POST" })),
    onSettled: () => {
      // Xoá mọi dữ liệu của user cũ trước khi hiện form đăng nhập.
      client.clear();
      client.setQueryData(queryKeys.me, null);
    },
  });
}

/**
 * Giấy của staff. Hỏi lại mỗi 2 giây khi còn giấy đang xử lý, tối đa 2 phút kể từ lần nộp gần
 * nhất (`restartPolling` gọi sau khi nộp).
 */
export function useMyDocuments() {
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const query = useQuery({
    queryKey: queryKeys.myDocuments,
    queryFn: async () =>
      unwrap(await apiFetch("/documents", DocumentList)).items,
    refetchInterval: (q) => pollInterval(q.state.data, startedAt, Date.now()),
  });
  return { ...query, restartPolling: () => setStartedAt(Date.now()) };
}

export function useUpload() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (form: FormData) =>
      unwrap(
        await apiFetch("/documents", UploadDocumentResponse, {
          method: "POST",
          body: form,
        }),
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.myDocuments }),
  });
}
