import {
  foreignKey,
  primaryKey,
  timestamp,
  unique,
  uuid,
  text,
} from "drizzle-orm/pg-core";
import { veridoc, groupTypeEnum } from "./enums";
import { tenants, tenantMemberships } from "./tenants";

export const audienceGroups = veridoc.table(
  "audience_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    groupType: groupTypeEnum("group_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_audience_groups_tenant_type_name").on(
      t.tenantId,
      t.groupType,
      t.name
    ),
    unique("uq_audience_groups_tenant_id").on(t.tenantId, t.id),
  ]
);

export const audienceGroupMembers = veridoc.table(
  "audience_group_members",
  {
    tenantId: uuid("tenant_id").notNull(),
    groupId: uuid("group_id").notNull(),
    userId: uuid("user_id").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.groupId, t.userId] }),
    foreignKey({
      columns: [t.tenantId, t.groupId],
      foreignColumns: [audienceGroups.tenantId, audienceGroups.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.tenantId, t.userId],
      foreignColumns: [tenantMemberships.tenantId, tenantMemberships.userId],
    }).onDelete("cascade"),
  ]
);
