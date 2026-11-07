"use client";

import { type FormEvent, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiRequestError, useLogin } from "../_lib/queries";

/** Đăng nhập (plan 17, giao diện plan 30). Thành công thì `useLogin` cập nhật `useMe`. */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate({ email, password });
  }

  const error = login.error;
  const errorText =
    error === null
      ? null
      : error instanceof ApiRequestError && error.status === 401
        ? "Sai email hoặc mật khẩu."
        : `Không đăng nhập được: ${error.message}`;

  return (
    <div className="flex justify-center pt-8 sm:pt-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Đăng nhập</CardTitle>
          <CardDescription>
            Dùng email công việc để nộp hoặc duyệt giấy tờ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={submit}
            data-testid="login-form"
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="login-email"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="login-password">Mật khẩu</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="login-password"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={login.isPending}
              data-testid="login-submit"
            >
              {login.isPending ? "Đang đăng nhập…" : "Đăng nhập"}
            </Button>
            {errorText !== null && (
              <Alert variant="destructive" data-testid="login-error">
                <AlertDescription>{errorText}</AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
