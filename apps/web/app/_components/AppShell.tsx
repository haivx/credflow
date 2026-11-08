"use client";

import type { AuthUser, UserRole } from "@credflow/contracts";
import { LogOut, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLogout, useMe } from "../_lib/queries";
import { LoginForm } from "./LoginForm";

const ROLE_LABEL: Record<UserRole, string> = {
  staff: "Nhân viên",
  reviewer: "Người duyệt",
  admin: "Quản trị",
};

/**
 * Khung chung của mọi trang (plan 28, giao diện plan 30): hỏi `/auth/me`, hiện form đăng nhập
 * khi chưa đăng nhập, header + đăng xuất. `role` cho trước thì user khác vai trò chỉ thấy thông
 * báo; API vẫn là nơi chặn thật (403), đây chỉ để không hiện màn hỏng.
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
  const me = useMe();
  const logout = useLogout();
  const user = me.data;
  const width = wide ? "max-w-screen-2xl" : "max-w-5xl";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div
          className={cn(
            "mx-auto flex h-14 items-center justify-between gap-3 px-4",
            width,
          )}
        >
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            CredFlow
          </Link>
          {user && (
            <div
              data-testid="current-user"
              className="flex min-w-0 items-center gap-2 text-sm"
            >
              <span className="hidden truncate text-muted-foreground sm:inline">
                {user.email}
              </span>
              <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
              {user.role === "admin" && (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  data-testid="nav-settings"
                >
                  <Link href="/settings">
                    <Settings aria-hidden />
                    <span className="hidden sm:inline">Cài đặt</span>
                    <span className="sr-only sm:hidden">Cài đặt</span>
                  </Link>
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                data-testid="logout"
              >
                <LogOut aria-hidden />
                <span className="hidden sm:inline">Đăng xuất</span>
                <span className="sr-only sm:hidden">Đăng xuất</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className={cn("mx-auto px-4 py-6", width)}>
        {me.isPending ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
            <p className="sr-only">Đang tải…</p>
          </div>
        ) : me.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              Không tải được phiên đăng nhập: {me.error.message}
            </AlertDescription>
          </Alert>
        ) : user === null || user === undefined ? (
          <LoginForm />
        ) : role !== undefined && user.role !== role ? (
          <Alert data-testid="wrong-role">
            <AlertDescription>
              Trang này dành cho vai trò {ROLE_LABEL[role]}; bạn đang đăng nhập
              với vai trò {ROLE_LABEL[user.role]}.
            </AlertDescription>
          </Alert>
        ) : (
          children(user)
        )}
      </main>
    </div>
  );
}
