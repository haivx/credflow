import * as z from "zod";
import { Id } from "./common.js";

// BẢN NHÁP: Liam chốt ở P0. Hồ sơ nhân viên là dữ liệu giả lập.

export const StaffProfile = z
  .object({
    id: Id,
    legalName: z.string().min(1),
    /** Tên khác hợp lệ: tên trước khi đổi họ, tên thường gọi. */
    aliases: z.array(z.string().min(1)).default([]),
    role: z.string().min(1),
    clientIds: z.array(Id).default([]),
    /** Mã bang/khu vực áp rule, ví dụ "CA". */
    region: z.string().min(1),
  })
  .meta({ id: "StaffProfile" });
export type StaffProfile = z.infer<typeof StaffProfile>;
