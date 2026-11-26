import "server-only";
import { cache } from "react";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { verifyPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { isValidUuid } from "@/db/context";
import { users, sessions, accounts, verifications } from "@/db/schema";
import type { MembershipStatus, WorkspaceRole } from "@/types/roles";
import { getDefaultLandingRouteForRole } from "./demo-accounts";

export { getDefaultLandingRouteForRole };

export interface UserWorkspaceSummary {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: WorkspaceRole;
  status: MembershipStatus;
}

interface RawWorkspaceLookupRow {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  role: WorkspaceRole;
  status: MembershipStatus;
}

/**
 * Queries veridoc.fn_get_user_workspaces(uuid) (STABLE SECURITY DEFINER)
 * so veridoc_app_user can discover ACTIVE memberships safely under FORCE RLS.
 */
export async function getUserWorkspaces(
  userId: string,
  dbClient = db
): Promise<UserWorkspaceSummary[]> {
  const trimmed = typeof userId === "string" ? userId.trim() : "";
  if (!isValidUuid(trimmed)) {
    return [];
  }

  const rows = await dbClient.execute(
    sql`SELECT tenant_id, tenant_name, tenant_slug, role, status FROM veridoc.fn_get_user_workspaces(${trimmed}::uuid)`
  );

  return Array.from(rows as unknown as RawWorkspaceLookupRow[]).map((row) => ({
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantSlug: row.tenant_slug,
    role: row.role,
    status: row.status,
  }));
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      users,
      sessions,
      accounts,
      verifications,
    },
  }),
  user: {
    modelName: "users",
  },
  session: {
    modelName: "sessions",
    cookieCache: {
      enabled: true,
      maxAge: 60,
    },
    additionalFields: {
      activeTenantId: {
        type: "string",
        required: false,
      },
    },
  },
  account: {
    modelName: "accounts",
  },
  verification: {
    modelName: "verifications",
  },
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const existingTenantId =
            typeof session.activeTenantId === "string" &&
            session.activeTenantId.trim().length > 0
              ? session.activeTenantId.trim()
              : null;

          if (existingTenantId) {
            return;
          }

          const workspaces = await getUserWorkspaces(session.userId);
          if (workspaces.length > 0) {
            return {
              data: {
                ...session,
                activeTenantId: workspaces[0].tenantId,
              },
            };
          }
        },
      },
    },
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL:
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000",
});

export type Auth = typeof auth;

export interface ServerActionCallerContext {
  userId?: string;
  tenantId?: string;
  callerDb?: typeof db;
  ip?: string;
}

export interface ResolvedServerActionCaller {
  userId: string;
  tenantId?: string;
}

export function isTestCallerOverrideAllowed(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

export const getCachedSession = cache(async () => {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return await auth.api.getSession({ headers: h });
  } catch {
    return null;
  }
});

/**
 * Resolves the caller for `"use server"` actions.
 * Test caller overrides (context.userId/tenantId) are strictly gated to NODE_ENV === "test" || VITEST === "true".
 */
export async function resolveServerActionCaller(
  context?: ServerActionCallerContext
): Promise<ResolvedServerActionCaller | null> {
  if (isTestCallerOverrideAllowed() && context?.userId) {
    return { userId: context.userId, tenantId: context.tenantId };
  }

  const session = await getCachedSession();
  if (!session?.user?.id) {
    return null;
  }
  const activeTenant = (session.session as Record<string, unknown>)
    ?.activeTenantId;
  return {
    userId: session.user.id,
    tenantId:
      typeof activeTenant === "string" && activeTenant.length > 0
        ? activeTenant
        : undefined,
  };
}

export function resolveServerActionDb(
  context?: ServerActionCallerContext
): typeof db {
  if (isTestCallerOverrideAllowed() && context?.callerDb) {
    return context.callerDb;
  }
  return db;
}

export async function resolveServerActionIp(
  context?: ServerActionCallerContext
): Promise<string> {
  if (isTestCallerOverrideAllowed() && context?.ip) {
    return context.ip;
  }
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return (
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      "127.0.0.1"
    );
  } catch {
    return "127.0.0.1";
  }
}

/**
 * Resolves authenticated userId & tenantId for API route handlers.
 * In Vitest/test environments, allows x-user-id / x-tenant-id headers for integration tests.
 */
export async function resolveApiRequestContext(
  request: Request
): Promise<{ userId: string; tenantId: string } | null> {
  let userId: string | null = null;
  let tenantId: string | null = null;

  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user?.id) {
      userId = session.user.id;
      const activeTenant = (session.session as Record<string, unknown>)
        ?.activeTenantId;
      tenantId = typeof activeTenant === "string" && activeTenant ? activeTenant : null;
    }
  } catch {
    // Session retrieval error ignored
  }

  const allowTestHeaders =
    process.env.NODE_ENV === "test" || process.env.VITEST === "true";

  if (allowTestHeaders) {
    if (!userId) {
      userId = request.headers.get("x-user-id");
    }
    if (!tenantId) {
      tenantId = request.headers.get("x-tenant-id");
    }
  }

  if (!userId) {
    return null;
  }

  if (!tenantId) {
    const workspaces = await getUserWorkspaces(userId);
    if (workspaces.length > 0) {
      tenantId = workspaces[0].tenantId;
    }
  }

  if (!tenantId) {
    return null;
  }

  return { userId, tenantId };
}

/**
 * Verifies a user's password for sign-off re-authentication (REQ-FR-401).
 * Directly checks the credential account password hash using Better Auth's password verifier.
 */
export async function verifySignOffPassword(
  userId: string,
  password: string,
  dbClient = db
): Promise<boolean> {
  if (!userId || !password) {
    return false;
  }

  try {
    const [account] = await dbClient
      .select({
        password: accounts.password,
      })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.providerId, "credential")
        )
      )
      .limit(1);

    if (!account || !account.password) {
      return false;
    }

    return await verifyPassword({
      hash: account.password,
      password,
    });
  } catch {
    return false;
  }
}
