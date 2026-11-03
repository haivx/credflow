import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  DocType,
  DocumentStatus,
  ReviewAction,
  UserRole,
} from "@credflow/contracts";
import type {
  Classification,
  Extraction,
  RoutingDecision,
  RuleResult,
  Versions,
} from "@credflow/contracts";

/**
 * Biến danh sách enum của contracts thành `'a', 'b', 'c'` để nhúng vào CHECK.
 * Dùng sql.raw vì DDL không nhận tham số ($1); chỉ nhận hằng số từ contracts,
 * không bao giờ nhận dữ liệu người dùng.
 */
function sqlList(values: readonly string[]) {
  return sql.raw(values.map((v) => `'${v}'`).join(", "));
}

export const staff = pgTable("staff", {
  id: text("id").primaryKey(),
  legalName: text("legal_name").notNull(),
  role: text("role").notNull(),
  aliases: text("aliases").array().notNull().default([]),
  clientIds: text("client_ids").array().notNull().default([]),
  region: text("region").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Tài khoản đăng nhập (ADR 0004). User vai trò `staff` gắn đúng một hồ sơ staff. */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    // Dạng `scrypt$N$r$p$<salt>$<hash>` (apps/api/src/auth/password.ts), không bao giờ là mật khẩu thô.
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<UserRole>().notNull(),
    staffId: text("staff_id").references(() => staff.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    // API chuẩn hoá email về chữ thường; CHECK để unique index không bị lách bằng chữ hoa.
    check("users_email_lower_check", sql`${t.email} = lower(${t.email})`),
    check("users_role_check", sql`${t.role} IN (${sqlList(UserRole.options)})`),
    // Staff phải có hồ sơ staff; reviewer và admin thì không.
    check(
      "users_staff_id_check",
      sql`(${t.role} = 'staff') = (${t.staffId} IS NOT NULL)`,
    ),
  ],
);

/** Session đăng nhập. Chỉ lưu sha256 của token: DB lộ ra thì token cũng không dùng được. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
    check("sessions_token_hash_check", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id")
      .references(() => staff.id, { onDelete: "restrict" })
      .notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    storageKey: text("storage_key").notNull(),
    status: text("status")
      .$type<DocumentStatus>()
      .notNull()
      .default("uploaded"),
    declaredDocType: text("declared_doc_type").$type<DocType>(),
    checksum: text("checksum").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    // Kết quả pipeline: NULL = bước đó chưa chạy (contract để .optional()).
    classification: jsonb("classification").$type<Classification>(),
    extraction: jsonb("extraction").$type<Extraction>(),
    routing: jsonb("routing").$type<RoutingDecision>(),
    versions: jsonb("versions").$type<Versions>(),
    error: jsonb("error").$type<{ step: string; message: string }>(),
    // Rỗng là giá trị hợp lệ (contract để .default()), nên NOT NULL + default.
    ruleResults: jsonb("rule_results")
      .$type<RuleResult[]>()
      .notNull()
      .default([]),
    timingMs: jsonb("timing_ms")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("documents_checksum_unique").on(t.checksum),
    check(
      "documents_status_check",
      sql`${t.status} IN (${sqlList(DocumentStatus.options)})`,
    ),
    // NULL IN (...) cho ra NULL, CHECK coi NULL là qua: cột vẫn được để trống.
    check(
      "documents_declared_doc_type_check",
      sql`${t.declaredDocType} IN (${sqlList(DocType.options)})`,
    ),
    check("documents_size_bytes_check", sql`${t.sizeBytes} > 0`),
    check("documents_checksum_check", sql`${t.checksum} ~ '^[0-9a-f]{64}$'`),
  ],
);

/** Hành động của người duyệt. Chỉ insert: lịch sử duyệt là dữ liệu audit và eval. */
export const reviewActions = pgTable(
  "review_actions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .references(() => documents.id, { onDelete: "restrict" })
      .notNull(),
    reviewerId: text("reviewer_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    action: text("action").$type<ReviewAction["action"]>().notNull(),
    corrections: jsonb("corrections")
      .$type<ReviewAction["corrections"]>()
      .notNull()
      .default([]),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // Postgres không tự tạo index cho FK; P4 cần lấy lịch sử duyệt theo document.
    index("review_actions_document_id_idx").on(t.documentId),
    check(
      "review_actions_action_check",
      sql`${t.action} IN (${sqlList(ReviewAction.shape.action.options)})`,
    ),
  ],
);
