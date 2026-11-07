"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Toaster } from "sonner";

/**
 * Provider phía client (plan 30). QueryClient tạo một lần cho mỗi lần mở trang (`useState`),
 * không để ở module: tránh dùng chung cache giữa các request khi render ở server.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Lỗi API (403, 404, 409…) là câu trả lời, không phải lỗi mạng: không thử lại.
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
