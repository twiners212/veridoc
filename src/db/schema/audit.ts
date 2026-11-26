import {
  bigint,
  char,
  check,
  index,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { veridoc, workspaceRoleEnum } from "./enums";
import { inet } from "./types";
import { tenants } from "./tenants";
import { users } from "./auth";

export const auditLogs = veridoc.table(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sequenceNumber: bigint("sequence_number", { mode: "number" }).notNull(),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorRole: workspaceRoleEnum("actor_role"),
    actorIp: inet("actor_ip"),
    payloadJson: jsonb("payload_json").notNull(),
    prevHash: char("prev_hash", { length: 64 }).notNull(),
    entryHash: char("entry_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_audit_logs_tenant_seq").on(t.tenantId, t.sequenceNumber),
    index("idx_audit_logs_entity").on(
      t.tenantId,
      t.entityType,
      t.entityId,
      t.sequenceNumber
    ),
    index("idx_audit_logs_time").on(t.tenantId, t.createdAt),
    check("chk_sequence_number", sql`${t.sequenceNumber} >= 1`),
  ]
);
