"use client";

import { AuthUser } from "@credflow/contracts";
import { type FormEvent, useState } from "react";
import { apiFetch } from "../_lib/api";

export function LoginForm({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiFetch("/auth/login", AuthUser, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (res.ok) onLogin(res.data);
    else
      setError(
        res.status === 401
          ? "Sai email hoặc mật khẩu."
          : `Không đăng nhập được: ${res.error.message}`,
      );
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      data-testid="login-form"
      style={{ display: "grid", gap: 8, maxWidth: 320 }}
    >
      <h2>Đăng nhập</h2>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="login-email"
          required
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <label>
        Mật khẩu
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="login-password"
          required
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <button type="submit" disabled={busy} data-testid="login-submit">
        {busy ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
      {error !== null && (
        <p role="alert" data-testid="login-error" style={{ color: "#b00020" }}>
          {error}
        </p>
      )}
    </form>
  );
}
