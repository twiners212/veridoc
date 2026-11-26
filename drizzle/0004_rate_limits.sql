CREATE UNLOGGED TABLE IF NOT EXISTS "veridoc"."rate_limits" (
  "key" text PRIMARY KEY,
  "window_start" timestamp with time zone NOT NULL,
  "count" integer NOT NULL DEFAULT 1,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rate_limits_expires_at" ON "veridoc"."rate_limits" ("expires_at");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "veridoc"."rate_limits" TO "veridoc_app_user";
