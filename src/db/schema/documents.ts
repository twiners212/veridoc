import {
  bigint,
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  veridoc,
  contentFormatEnum,
  documentLifecycleStateEnum,
} from "./enums";
import { tenants } from "./tenants";
import { users } from "./auth";

export const documents = veridoc.table(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    documentCode: text("document_code").notNull(),
    category: text("category"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_documents_tenant_code").on(t.tenantId, t.documentCode),
    unique("uq_documents_tenant_id").on(t.tenantId, t.id),
    index("idx_documents_tenant_code").on(t.tenantId, t.documentCode),
  ]
);

export const documentVersions = veridoc.table(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    documentId: uuid("document_id").notNull(),
    parentVersionId: uuid("parent_version_id"),
    versionMajor: integer("version_major").notNull().default(0),
    versionMinor: integer("version_minor").notNull().default(1),
    versionLabel: text("version_label").generatedAlwaysAs(
      sql`'v' || version_major || '.' || version_minor`
    ),
    title: text("title").notNull(),
    contentFormat: contentFormatEnum("content_format").notNull(),
    markdownContent: text("markdown_content"),
    fileStorageKey: text("file_storage_key"),
    fileMimeType: text("file_mime_type"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    fileSha256: char("file_sha256", { length: 64 }),
    documentSha256: char("document_sha256", { length: 64 }),
    lifecycleState: documentLifecycleStateEnum("lifecycle_state")
      .notNull()
      .default("DRAFT"),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    effectiveDate: timestamp("effective_date", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => users.id),
    isMinorAdminEdit: boolean("is_minor_admin_edit").notNull().default(false),
    minorEditJustification: text("minor_edit_justification"),
    rowVersion: integer("row_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_document_versions_tenant_id").on(t.tenantId, t.id),
    unique("uq_document_versions_num").on(
      t.tenantId,
      t.documentId,
      t.versionMajor,
      t.versionMinor
    ),
    uniqueIndex("uq_one_published_version_per_doc")
      .on(t.tenantId, t.documentId)
      .where(sql`${t.lifecycleState} = 'PUBLISHED'`),
    foreignKey({
      columns: [t.tenantId, t.documentId],
      foreignColumns: [documents.tenantId, documents.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.tenantId, t.parentVersionId],
      foreignColumns: [t.tenantId, t.id],
    }).onDelete("set null"),
    index("idx_doc_versions_tenant_state").on(
      t.tenantId,
      t.lifecycleState,
      t.updatedAt
    ),
    check("chk_version_major", sql`${t.versionMajor} >= 0`),
    check("chk_version_minor", sql`${t.versionMinor} >= 0`),
    check(
      "chk_file_mime_type",
      sql`${t.fileMimeType} IS NULL OR ${t.fileMimeType} = 'application/pdf'`
    ),
    check(
      "chk_file_size_bytes",
      sql`${t.fileSizeBytes} IS NULL OR (${t.fileSizeBytes} > 0 AND ${t.fileSizeBytes} <= 52428800)`
    ),
    check(
      "chk_lifecycle_state_digest",
      sql`${t.lifecycleState} = 'DRAFT' OR ${t.documentSha256} IS NOT NULL`
    ),
    check(
      "chk_minor_edit_justification",
      sql`NOT ${t.isMinorAdminEdit} OR (${t.minorEditJustification} IS NOT NULL AND length(trim(${t.minorEditJustification})) > 0)`
    ),
  ]
);
