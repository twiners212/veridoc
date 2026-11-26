import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (process.env.NEXT_PHASE !== "phase-production-build") {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  if (process.env.NODE_ENV === "production" && !process.env.AUDIT_HASH_SALT) {
    throw new Error("AUDIT_HASH_SALT environment variable is required in production");
  }
}

const connectionString = process.env.DATABASE_URL || "";

// Transaction pooler connection client (app_user role, NOBYPASSRLS)
export const queryClient = postgres(connectionString, {
  prepare: false, // Critical for Supavisor/PgBouncer transaction mode
  max: Number(process.env.DB_POOL_MAX ?? 5),
  connect_timeout: 10,
  idle_timeout: 20,
  max_lifetime: 1800,
});

export const db = drizzle(queryClient, { schema });

export type DrizzleDb = typeof db;
