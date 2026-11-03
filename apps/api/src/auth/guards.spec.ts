import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthUser, UserRole } from "@credflow/contracts";
import { describe, expect, it, vi } from "vitest";
import { AuthGuard } from "./auth.guard.js";
import type { AuthService } from "./auth.service.js";
import { type AuthedRequest, Public, Roles } from "./decorators.js";
import { RolesGuard } from "./roles.guard.js";
import { SESSION_COOKIE } from "./session-token.js";

const reviewer: AuthUser = {
  id: "u-reviewer",
  email: "reviewer@example.test",
  role: "reviewer",
  staffId: null,
};

/** Controller giả: metadata gắn bằng đúng decorator thật, Reflector đọc như lúc chạy. */
class FakeController {
  @Public()
  open() {}

  closed() {}

  @Roles("reviewer")
  reviewerOnly() {}
}

function context(
  handler: keyof FakeController,
  req: Partial<AuthedRequest>,
): ExecutionContext {
  return {
    getHandler: () => FakeController.prototype[handler],
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function authGuard(user: AuthUser | undefined) {
  const findUserBySessionToken = vi.fn().mockResolvedValue(user);
  const service = { findUserBySessionToken } as unknown as AuthService;
  return {
    guard: new AuthGuard(new Reflector(), service),
    findUserBySessionToken,
  };
}

describe("AuthGuard", () => {
  it("route @Public cho qua, không tra session", async () => {
    const { guard, findUserBySessionToken } = authGuard(undefined);

    await expect(guard.canActivate(context("open", {}))).resolves.toBe(true);
    expect(findUserBySessionToken).not.toHaveBeenCalled();
  });

  it("không có cookie → 401", async () => {
    const { guard } = authGuard(reviewer);

    await expect(
      guard.canActivate(context("closed", { cookies: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("token không khớp session nào → 401", async () => {
    const { guard } = authGuard(undefined);

    await expect(
      guard.canActivate(
        context("closed", { cookies: { [SESSION_COOKIE]: "sai" } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("session hợp lệ → cho qua và gắn user vào request", async () => {
    const { guard, findUserBySessionToken } = authGuard(reviewer);
    const req: Partial<AuthedRequest> = {
      cookies: { [SESSION_COOKIE]: "tok" },
    };

    await expect(guard.canActivate(context("closed", req))).resolves.toBe(true);
    expect(findUserBySessionToken).toHaveBeenCalledWith("tok");
    expect(req.user).toEqual(reviewer);
  });
});

describe("RolesGuard", () => {
  const guard = new RolesGuard(new Reflector());

  function withRole(role: UserRole): Partial<AuthedRequest> {
    return { user: { ...reviewer, role } };
  }

  it("route không có @Roles: mọi user đã đăng nhập đều qua", () => {
    expect(guard.canActivate(context("closed", withRole("staff")))).toBe(true);
  });

  it("đúng vai trò → qua", () => {
    expect(
      guard.canActivate(context("reviewerOnly", withRole("reviewer"))),
    ).toBe(true);
  });

  it("sai vai trò → 403", () => {
    expect(() =>
      guard.canActivate(context("reviewerOnly", withRole("staff"))),
    ).toThrow(ForbiddenException);
  });

  it("có @Roles mà chưa có user → 401", () => {
    expect(() => guard.canActivate(context("reviewerOnly", {}))).toThrow(
      UnauthorizedException,
    );
  });
});
