"use client";

import type { AuthUser } from "@credflow/contracts";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "./_components/AppShell";
import { StaffHome } from "./_components/StaffHome";

/**
 * Trang chủ theo vai trò: staff thấy S1 (plan 17), reviewer chuyển sang hàng chờ `/review`
 * (plan 28). Màn admin làm ở P5.
 */
export default function Home() {
  return <AppShell>{(user) => <HomeFor user={user} />}</AppShell>;
}

function HomeFor({ user }: { user: AuthUser }) {
  const router = useRouter();
  useEffect(() => {
    if (user.role === "reviewer") router.replace("/review");
  }, [user.role, router]);

  if (user.role === "staff") return <StaffHome />;
  if (user.role === "reviewer") return <p>Đang mở hàng chờ…</p>;
  return (
    <p data-testid="role-not-ready">Màn của vai trò {user.role} làm ở P5.</p>
  );
}
