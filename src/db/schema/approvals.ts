import {
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
  workspaceRoleEnum,
  approvalCycleStatusEnum,
  approvalStepStatusEnum,
} from "./enums";
import { inet } from "./types";
import { users } from "./auth";
import { documentVersions } from "./documents";

export const approvalCycles = veridoc.table(
  "approval_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    documentVersionId: uuid("document_version_id").notNull(),
    cycleNumber: integer("cycle_number").notNull(),
    submittedBy: uuid("submitted_by")
      .notNull()
      .references(() => users.id),
    submittedSha256: char("submitted_sha256", { length: 64 }).notNull(),
    status: approvalCycleStatusEnum("status").notNull().default("IN_PROGRESS"),
    allowSelfApprovalOverride: boolean("allow_self_approval_override")
      .notNull()
      .default(false),
    invalidatedReason: text("invalidated_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_approval_cycles_tenant_id").on(t.tenantId, t.id),
    unique("uq_approval_cycles_version_cycle").on(
      t.tenantId,
      t.documentVersionId,
      t.cycleNumber
    ),
    uniqueIndex("uq_one_active_cycle_per_version")
      .on(t.tenantId, t.documentVersionId)
      .where(sql`${t.status} = 'IN_PROGRESS'`),
    foreignKey({
      columns: [t.tenantId, t.documentVersionId],
      foreignColumns: [documentVersions.tenantId, documentVersions.id],
    }).onDelete("cascade"),
    check("chk_cycle_number", sql`${t.cycleNumber} >= 1`),
  ]
);

export const approvalSteps = veridoc.table(
  "approval_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    approvalCycleId: uuid("approval_cycle_id").notNull(),
    stepOrder: integer("step_order").notNull(),
    assignedApproverId: uuid("assigned_approver_id")
      .notNull()
      .references(() => users.id),
    status: approvalStepStatusEnum("status").notNull().default("WAITING"),
    actedByUserId: uuid("acted_by_user_id").references(() => users.id),
    actedByFullName: text("acted_by_full_name"),
    actedByRole: workspaceRoleEnum("acted_by_role"),
    actedIpAddress: inet("acted_ip_address"),
    authMethod: text("auth_method"),
    signedDocumentSha256: char("signed_document_sha256", { length: 64 }),
    decisionIntent: text("decision_intent"),
    selfApprovalOverrideUsed: boolean("self_approval_override_used")
      .notNull()
      .default(false),
    overriddenFromApproverId: uuid("overridden_from_approver_id").references(
      () => users.id
    ),
    actedAt: timestamp("acted_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_approval_steps_tenant_id").on(t.tenantId, t.id),
    unique("uq_approval_steps_cycle_order").on(
      t.tenantId,
      t.approvalCycleId,
      t.stepOrder
    ),
    foreignKey({
      columns: [t.tenantId, t.approvalCycleId],
      foreignColumns: [approvalCycles.tenantId, approvalCycles.id],
    }).onDelete("cascade"),
    index("idx_approval_steps_queue").on(
      t.tenantId,
      t.assignedApproverId,
      t.status
    ),
    check("chk_step_order", sql`${t.stepOrder} >= 1`),
    check(
      "chk_sign_off_completeness",
      sql`${t.status} NOT IN ('APPROVED', 'REJECTED') OR (${t.actedByUserId} IS NOT NULL AND ${t.actedByFullName} IS NOT NULL AND length(trim(${t.actedByFullName})) > 0 AND ${t.actedByRole} IS NOT NULL AND ${t.signedDocumentSha256} IS NOT NULL AND ${t.decisionIntent} IS NOT NULL AND length(trim(${t.decisionIntent})) > 0 AND ${t.actedAt} IS NOT NULL)`
    ),
  ]
);
