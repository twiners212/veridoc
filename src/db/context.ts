import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./index";

export type TenantContextInput =
  | string
  | { session: { activeTenantId?: string | null; [key: string]: unknown }; [key: string]: unknown }
  | { activeTenantId?: string | null; [key: string]: unknown }
  | { tenantId?: string | null; [key: string]: unknown };

export type TenantTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

export function resolveTenantId(context: TenantContextInput): string | null {
  if (typeof context === "string") {
    const trimmed = context.trim();
    return isValidUuid(trimmed) ? trimmed : null;
  }
  if (context && typeof context === "object") {
    if ("session" in context && context.session && typeof context.session === "object") {
      const s = context.session as Record<string, unknown>;
      if (typeof s.activeTenantId === "string") {
        const trimmed = s.activeTenantId.trim();
        if (isValidUuid(trimmed)) return trimmed;
      }
    }
    if ("activeTenantId" in context && typeof context.activeTenantId === "string") {
      const trimmed = context.activeTenantId.trim();
      if (isValidUuid(trimmed)) return trimmed;
    }
    if ("tenantId" in context && typeof context.tenantId === "string") {
      const trimmed = context.tenantId.trim();
      if (isValidUuid(trimmed)) return trimmed;
    }
  }
  return null;
}

export async function withTenantContext<T>(
  context: TenantContextInput,
  fn: (tx: TenantTransaction, tenantId: string) => Promise<T>,
  dbClient = db
): Promise<T> {
  const tenantId = resolveTenantId(context);
  if (!tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED: withTenantContext requires a valid UUID tenant ID");
  }

  return await dbClient.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
    return await fn(tx, tenantId);
  });
}
