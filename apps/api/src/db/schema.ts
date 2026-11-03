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
import { DocType, DocumentStatus, ReviewAction } from "@credflow/contracts";
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
    // Chưa có FK: chưa có bảng reviewer (đăng nhập thật để sau MVP).
    reviewerId: text("reviewer_id").notNull(),
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
