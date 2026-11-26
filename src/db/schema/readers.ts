import {
  char,
  check,
  foreignKey,
  index,
  integer,
  smallint,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { veridoc, readAssignmentStatusEnum } from "./enums";
import { inet } from "./types";
import { users } from "./auth";
import { documentVersions } from "./documents";
import { audienceGroups } from "./groups";

export const readAssignments = veridoc.table(
  "read_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    documentVersionId: uuid("document_version_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    assignedViaGroupId: uuid("assigned_via_group_id"),
    status: readAssignmentStatusEnum("status").notNull().default("PENDING"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_read_assignments_tenant_id").on(t.tenantId, t.id),
    unique("uq_read_assignments_tenant_version_user").on(
      t.tenantId,
      t.documentVersionId,
      t.userId
    ),
    foreignKey({
      columns: [t.tenantId, t.documentVersionId],
      foreignColumns: [documentVersions.tenantId, documentVersions.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.tenantId, t.assignedViaGroupId],
      foreignColumns: [audienceGroups.tenantId, audienceGroups.id],
    }).onDelete("set null"),
    index("idx_read_assignments_reader").on(
      t.tenantId,
      t.userId,
      t.status,
      t.dueAt
    ),
    index("idx_read_assignments_dashboard").on(
      t.tenantId,
      t.documentVersionId,
      t.status
    ),
  ]
);

export const readAcknowledgments = veridoc.table(
  "read_acknowledgments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    readAssignmentId: uuid("read_assignment_id").notNull(),
    documentVersionId: uuid("document_version_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    documentSha256: char("document_sha256", { length: 64 }).notNull(),
    dwellTimeSeconds: integer("dwell_time_seconds").notNull(),
    maxScrollPercent: smallint("max_scroll_percent").notNull(),
    acknowledgedIp: inet("acknowledged_ip"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_read_acknowledgments_tenant_id").on(t.tenantId, t.id),
    unique("uq_read_ack_tenant_version_user").on(
      t.tenantId,
      t.documentVersionId,
      t.userId
    ),
    unique("uq_read_ack_tenant_assignment").on(
      t.tenantId,
      t.readAssignmentId
    ),
    foreignKey({
      columns: [t.tenantId, t.readAssignmentId],
      foreignColumns: [readAssignments.tenantId, readAssignments.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.tenantId, t.documentVersionId],
      foreignColumns: [documentVersions.tenantId, documentVersions.id],
    }).onDelete("cascade"),
    check("chk_dwell_time_seconds", sql`${t.dwellTimeSeconds} >= 0`),
    check(
      "chk_max_scroll_percent",
      sql`${t.maxScrollPercent} BETWEEN 0 AND 100`
    ),
  ]
);
