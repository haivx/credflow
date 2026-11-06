"use client";

import { AuthUser, type UserRole } from "@credflow/contracts";
import { type ReactNode, useEffect, useState } from "react";
import { apiFetch, apiSend } from "../_lib/api";
import { LoginForm } from "./LoginForm";

/**
 * Khung chung của mọi trang (plan 28): hỏi `/auth/me`, hiện form đăng nhập khi chưa đăng nhập,
 * header + đăng xuất. `role` cho trước thì user khác vai trò chỉ thấy thông báo; API vẫn là nơi
 * chặn thật (403), đây chỉ để không hiện màn hỏng.
 */
export function AppShell({
  role,
  wide = false,
  children,
}: {
  role?: UserRole;
  wide?: boolean;
  children: (user: AuthUser) => ReactNode;
}) {
  // undefined = đang hỏi /auth/me, null = chưa đăng nhập.
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    void apiFetch("/auth/me", AuthUser).then((res) => {
      setUser(res.ok ? res.data : null);
    });
  }, []);

  async function logout() {
    await apiSend("/auth/logout", { method: "POST" });
    setUser(null);
  }

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        maxWidth: wide ? 1600 : 1100,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0 }}>
          <a href="/" style={{ color: "inherit", textDecoration: "none" }}>
            CredFlow
          </a>
        </h1>
        {user && (
          <div data-testid="current-user">
            {user.email} ({user.role}){" "}
            <button
              type="button"
              onClick={() => void logout()}
              data-testid="logout"
            >
              Đăng xuất
            </button>
          </div>
        )}
      </header>

      {user === undefined ? (
        <p>Đang tải…</p>
      ) : user === null ? (
        <LoginForm onLogin={setUser} />
      ) : role !== undefined && user.role !== role ? (
        <p data-testid="wrong-role" role="alert">
          Trang này dành cho vai trò {role}; bạn đang đăng nhập với vai trò{" "}
          {user.role}.
        </p>
      ) : (
        children(user)
      )}
    </main>
  );
}
