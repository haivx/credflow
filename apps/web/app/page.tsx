"use client";

import { AuthUser } from "@credflow/contracts";
import { useEffect, useState } from "react";
import { LoginForm } from "./_components/LoginForm";
import { StaffHome } from "./_components/StaffHome";
import { apiFetch, apiSend } from "./_lib/api";

/**
 * S1 tối giản (plan 17): đăng nhập, upload, danh sách giấy và kết quả thô trên một trang.
 * Màn của reviewer (P4) và admin (P5) chưa làm.
 */
export default function Home() {
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
        maxWidth: 1100,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0 }}>CredFlow</h1>
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
      ) : user.role === "staff" ? (
        <StaffHome />
      ) : (
        <p data-testid="role-not-ready">
          Màn của vai trò {user.role} làm ở{" "}
          {user.role === "reviewer" ? "P4" : "P5"}.
        </p>
      )}
    </main>
  );
}
