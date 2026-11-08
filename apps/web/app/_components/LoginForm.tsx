"use client";

import { Bot, FileUp, UserCheck } from "lucide-react";
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
import { loginErrorText } from "../_lib/status";

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
      : error instanceof ApiRequestError
        ? loginErrorText(error.status, error.message)
        : `Không đăng nhập được: ${error.message}`;

  return (
    <div className="flex flex-col items-center gap-8 pt-6 sm:pt-12">
      <SiteIntro />
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

const STEPS = [
  {
    icon: FileUp,
    title: "Nhân viên nộp giấy",
    text: "Thẻ CPR, giấy phép hành nghề, xét nghiệm TB… dạng PDF hoặc ảnh chụp.",
  },
  {
    icon: Bot,
    title: "AI đọc và trích xuất",
    text: "Nhận loại giấy, đọc tên, ngày hết hạn, tổ chức cấp, kèm đúng đoạn chữ trên giấy làm bằng chứng.",
  },
  {
    icon: UserCheck,
    title: "Quy tắc kiểm, người quyết",
    text: "Đủ mọi điều kiện thì tự duyệt; còn chỗ chưa chắc thì chuyển người duyệt. Hệ thống không bao giờ tự từ chối.",
  },
] as const;

/** Giới thiệu ngắn trên màn đăng nhập (nội dung theo docs/product.md mục 1). */
function SiteIntro() {
  return (
    <section data-testid="site-intro" className="w-full max-w-3xl text-center">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Duyệt giấy tờ chứng chỉ của nhân viên, nhanh mà không sót
      </h1>
      <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
        CredFlow giúp công ty chăm sóc sức khoẻ tại nhà thu và kiểm giấy tờ bắt
        buộc của nhân viên. AI đọc giấy thay cho việc gõ tay; quyết định duyệt
        luôn do quy tắc rõ ràng và con người đưa ra.
      </p>
      <ul className="mt-6 grid gap-3 text-left sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-lg border bg-background p-4">
            <Icon className="size-5 text-primary" aria-hidden />
            <p className="mt-2 font-medium">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">
        Bản demo: chỉ dùng giấy tờ giả lập có chữ SAMPLE, tên người và tổ chức
        hư cấu.
      </p>
    </section>
  );
}
