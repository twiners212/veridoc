import {
  boolean,
  check,
  index,
  integer,
  timestamp,
  unique,
  uuid,
  text,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  veridoc,
  workspaceRoleEnum,
  membershipStatusEnum,
} from "./enums";
import { users } from "./auth";

export const tenants = veridoc.table(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    creatorSeatLimit: integer("creator_seat_limit").notNull().default(10),
    readerPackLimit: integer("reader_pack_limit").notNull().default(100),
    allowSingleAuthorOverride: boolean("allow_single_author_override")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("chk_creator_seat_limit", sql`${t.creatorSeatLimit} > 0`),
    check("chk_reader_pack_limit", sql`${t.readerPackLimit} > 0`),
  ]
);

export const tenantMemberships = veridoc.table(
  "tenant_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull(),
    status: membershipStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_tenant_memberships_tenant_user").on(t.tenantId, t.userId),
    unique("uq_tenant_memberships_tenant_id").on(t.tenantId, t.id),
    index("idx_memberships_tenant_role").on(t.tenantId, t.role, t.status),
  ]
);
