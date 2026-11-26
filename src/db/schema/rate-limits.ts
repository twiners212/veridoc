import { index, integer, text, timestamp } from "drizzle-orm/pg-core";
import { veridoc } from "./enums";

export const rateLimits = veridoc.table(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("idx_rate_limits_expires_at").on(t.expiresAt)]
);
