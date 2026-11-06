import { sql } from "drizzle-orm";
import {
  check,
  date,
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
    // Plan 27: optimistic lock. Chỉ DocumentStatusService tăng (mỗi lần đổi trạng thái).
    version: integer("version").notNull().default(1),
    checksum: text("checksum").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    // Kết quả pipeline: NULL = bước đó chưa chạy (contract để .optional()).
    classification: jsonb("classification").$type<Classification>(),
    extraction: jsonb("extraction").$type<Extraction>(),
    routing: jsonb("routing").$type<RoutingDecision>(),
    versions: jsonb("versions").$type<Versions>(),
    // Ngày lịch dạng chuỗi YYYY-MM-DD, không đổi sang Date (lệch múi giờ).
    asOf: date("as_of", { mode: "string" }),
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
    // Plan 26: danh sách giấy của một staff (GET /documents) và FK.
    index("documents_staff_id_idx").on(t.staffId),
    // Plan 26: staff đã đủ bộ giấy chưa. Partial: chỉ giấy đã duyệt; biểu thức phải khớp đúng
    // câu query trong apps/api/src/staff/compliance.sql.ts thì planner mới dùng.
    index("documents_staff_approved_doctype_idx")
      .on(t.staffId, sql`(${t.classification}->>'docType')`)
      .where(sql`${t.status} IN ('auto_approved', 'approved')`),
    // Plan 27: hàng chờ sắp theo hạn. Biểu thức phải khớp đúng `QUEUE_DUE_KEY` trong
    // apps/api/src/review/review-queue.service.ts thì planner mới dùng.
    index("documents_review_queue_due_idx")
      .on(
        sql`(COALESCE(${t.extraction} -> 'fields' -> 'expirationDate' ->> 'value', '9999-12-31'))`,
        t.id,
      )
      .where(sql`${t.status} = 'needs_review'`),
    check("documents_version_check", sql`${t.version} >= 1`),
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
    // Guardrail (docs/agent/GUARDRAILS.md, plan 12d): trạng thái không thể có thì DB từ chối (23514 → 500).
    // A6: qua processing là phải có versions (worker ghi versions ngay khi vào processing).
    check(
      "documents_versions_after_processing",
      sql`${t.status} IN ('uploaded', 'processing') OR ${t.versions} IS NOT NULL`,
    ),
    // A7: failed phải có error.
    check(
      "documents_failed_has_error",
      sql`${t.status} <> 'failed' OR ${t.error} IS NOT NULL`,
    ),
    // C1 (A4): auto_approved phải có routing auto_approve, không lý do.
    // Đổi RoutingDecision → xem lại CHECK này.
    check(
      "documents_auto_approved_routing",
      // COALESCE: routing NULL hoặc thiếu key thì biểu thức ra NULL, mà CHECK coi NULL là qua.
      sql`${t.status} <> 'auto_approved' OR COALESCE(${t.routing} ->> 'decision' = 'auto_approve' AND jsonb_array_length(${t.routing} -> 'reasons') = 0, false)`,
    ),
    // C2 (A4): auto_approved phải có rule đã chấm và không rule block nào trượt.
    // Đổi RuleResult → xem lại CHECK này.
    check(
      "documents_auto_approved_no_block_fail",
      sql`${t.status} <> 'auto_approved' OR (jsonb_array_length(${t.ruleResults}) > 0 AND NOT jsonb_path_exists(${t.ruleResults}, '$[*] ? (@.severity == "block" && @.passed == false)'))`,
    ),
    // C4: extracted/auto_approved phải có kết quả LLM.
    check(
      "documents_extracted_has_result",
      sql`${t.status} NOT IN ('extracted', 'auto_approved') OR (${t.classification} IS NOT NULL AND ${t.extraction} IS NOT NULL)`,
    ),
    // C6 (plan 16): tự duyệt phải lưu ngày đã dùng để chấm hạn, để tái lập được.
    check(
      "documents_auto_approved_as_of",
      sql`${t.status} <> 'auto_approved' OR ${t.asOf} IS NOT NULL`,
    ),
    // C5: uploaded không mang kết quả cũ. Xử lý lại đi sang processing, không về uploaded.
    check(
      "documents_uploaded_is_clean",
      sql`${t.status} <> 'uploaded' OR (${t.classification} IS NULL AND ${t.extraction} IS NULL AND ${t.routing} IS NULL AND ${t.versions} IS NULL AND ${t.error} IS NULL AND ${t.ruleResults} = '[]'::jsonb)`,
    ),
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
