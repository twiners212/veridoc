import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import {
  tenants,
  users,
  accounts,
  sessions,
  tenantMemberships,
} from "@/db/schema";
import { auth, getUserWorkspaces, resolveServerActionCaller } from "@/lib/auth/server";
import { getAuditLogsAction } from "@/server/actions/audit.actions";
import { POST as demoLoginPost } from "@/app/api/auth/demo-login/route";
import { POST as switchWorkspacePost } from "@/app/api/workspace/switch/route";
import {
  clearDistributedRateLimit,
  rateLimiter,
} from "@/server/security/rate-limiter";
import {
  testAdminDb,
  testAppDb,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";

const TEST_RATE_LIMIT_IP = "198.51.100.77";

describe(
  "Workspace Lookup, Demo Login Guards & Workspace Switch Integration (PostgreSQL veridoc_app_user)",
  { timeout: 60000 },
  () => {
    let tenantAId: string;
    let tenantBId: string;
    let user1Id: string;
    let user2Id: string;
    let user1Email: string;
    const testPassword = "WorkspaceSwitch!2026";

    const originalNodeEnv = process.env.NODE_ENV;
    const originalVitest = process.env.VITEST;
    const originalEnableDemoLogin = process.env.ENABLE_DEMO_LOGIN;

    beforeAll(async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const [tA] = await testAdminDb
        .insert(tenants)
        .values({
          name: "Lookup Tenant A",
          slug: `lookup-a-${suffix}`,
        })
        .returning();
      tenantAId = tA.id;

      const [tB] = await testAdminDb
        .insert(tenants)
        .values({
          name: "Lookup Tenant B",
          slug: `lookup-b-${suffix}`,
        })
        .returning();
      tenantBId = tB.id;

      user1Email = `lookup-user1-${suffix}@veridoc.test`;
      const [u1] = await testAdminDb
        .insert(users)
        .values({
          name: "Lookup User One",
          email: user1Email,
          emailVerified: true,
        })
        .returning();
      user1Id = u1.id;

      const [u2] = await testAdminDb
        .insert(users)
        .values({
          name: "Lookup User Two",
          email: `lookup-user2-${suffix}@veridoc.test`,
          emailVerified: true,
        })
        .returning();
      user2Id = u2.id;

      const hashedPassword = await hashPassword(testPassword);
      await testAdminDb.insert(accounts).values({
        userId: user1Id,
        accountId: user1Id,
        providerId: "credential",
        password: hashedPassword,
      });

      await testAdminDb.insert(tenantMemberships).values([
        {
          tenantId: tenantAId,
          userId: user1Id,
          role: "DOCUMENT_AUTHOR",
          status: "ACTIVE",
        },
        {
          tenantId: tenantBId,
          userId: user1Id,
          role: "READER",
          status: "DEACTIVATED",
        },
        {
          tenantId: tenantBId,
          userId: user2Id,
          role: "WORKSPACE_ADMIN",
          status: "ACTIVE",
        },
      ]);
    });

    beforeEach(async () => {
      await clearDistributedRateLimit(`demo-login:${TEST_RATE_LIMIT_IP}`);
    });

    afterEach(async () => {
      if (originalNodeEnv === undefined) {
        Reflect.deleteProperty(process.env, "NODE_ENV");
      } else {
        Reflect.set(process.env, "NODE_ENV", originalNodeEnv);
      }

      if (originalVitest === undefined) {
        Reflect.deleteProperty(process.env, "VITEST");
      } else {
        Reflect.set(process.env, "VITEST", originalVitest);
      }

      if (originalEnableDemoLogin === undefined) {
        Reflect.deleteProperty(process.env, "ENABLE_DEMO_LOGIN");
      } else {
        Reflect.set(process.env, "ENABLE_DEMO_LOGIN", originalEnableDemoLogin);
      }

      rateLimiter.clearKey(`demo-login:${TEST_RATE_LIMIT_IP}`);
      await clearDistributedRateLimit(`demo-login:${TEST_RATE_LIMIT_IP}`);
    });

    afterAll(async () => {
      await cleanupTestTenants([tenantAId, tenantBId]);
      await cleanupTestUsers([user1Id, user2Id]);
    });

    it("getUserWorkspaces returns only the target user's ACTIVE memberships as veridoc_app_user", async () => {
      const workspaces = await getUserWorkspaces(user1Id, testAppDb);

      expect(workspaces).toHaveLength(1);
      expect(workspaces[0]).toMatchObject({
        tenantId: tenantAId,
        tenantName: "Lookup Tenant A",
        role: "DOCUMENT_AUTHOR",
        status: "ACTIVE",
      });

      expect(workspaces.some((w) => w.tenantId === tenantBId)).toBe(false);
    });

    it("getUserWorkspaces safely returns [] for non-UUID inputs", async () => {
      const invalid = await getUserWorkspaces("not-a-valid-uuid", testAppDb);
      expect(invalid).toEqual([]);
    });

    it("FORCE ROW LEVEL SECURITY on veridoc.tenant_memberships still returns 0 rows outside withTenantContext", async () => {
      const directRows = await testAppDb
        .select()
        .from(tenantMemberships)
        .where(eq(tenantMemberships.userId, user1Id));

      expect(directRows).toHaveLength(0);
    });

    it("POST /api/auth/demo-login returns 403 FORBIDDEN in production when ENABLE_DEMO_LOGIN is unset", async () => {
      Reflect.set(process.env, "NODE_ENV", "production");
      Reflect.deleteProperty(process.env, "ENABLE_DEMO_LOGIN");

      const req = new NextRequest("http://localhost:3000/api/auth/demo-login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": TEST_RATE_LIMIT_IP,
        },
        body: JSON.stringify({ role: "READER" }),
      });

      const res = await demoLoginPost(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error?.code).toBe("FORBIDDEN");
    });

    it("POST /api/auth/demo-login enforces sliding-window rate limit (429 RATE_LIMIT_EXCEEDED) on dedicated test IP", async () => {
      Reflect.set(process.env, "NODE_ENV", "test");

      for (let i = 0; i < 20; i++) {
        const req = new NextRequest("http://localhost:3000/api/auth/demo-login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": TEST_RATE_LIMIT_IP,
          },
          body: JSON.stringify({ role: "INVALID_ROLE" }),
        });
        const res = await demoLoginPost(req);
        expect(res.status).toBe(400);
      }

      const blockedReq = new NextRequest(
        "http://localhost:3000/api/auth/demo-login",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": TEST_RATE_LIMIT_IP,
          },
          body: JSON.stringify({ role: "READER" }),
        }
      );

      const blockedRes = await demoLoginPost(blockedReq);
      expect(blockedRes.status).toBe(429);
      const body = await blockedRes.json();
      expect(body.error?.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(blockedRes.headers.get("Retry-After")).toBeDefined();
      expect(blockedRes.headers.get("X-RateLimit-Remaining")).toBe("0");
    });

    it("POST /api/workspace/switch enforces 401 unauthenticated, 404 anti-enumeration, and 200 session update", async () => {
      // 1. Unauthenticated -> 401 UNAUTHORIZED
      const unauthReq = new NextRequest(
        "http://localhost:3000/api/workspace/switch",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tenantId: tenantAId }),
        }
      );
      const unauthRes = await switchWorkspacePost(unauthReq);
      expect(unauthRes.status).toBe(401);
      const unauthBody = await unauthRes.json();
      expect(unauthBody.error?.code).toBe("UNAUTHORIZED");

      // 2. Sign in User 1 via Better Auth to obtain a genuine session cookie
      const signInRes = await auth.api.signInEmail({
        body: {
          email: user1Email,
          password: testPassword,
        },
        headers: new Headers({
          origin: "http://localhost:3000",
        }),
        asResponse: true,
      });
      expect(signInRes.ok).toBe(true);

      const setCookies =
        typeof signInRes.headers.getSetCookie === "function"
          ? signInRes.headers.getSetCookie()
          : [signInRes.headers.get("set-cookie") || ""].filter(Boolean);

      const cookieHeader = setCookies
        .map((c) => c.split(";")[0])
        .filter(Boolean)
        .join("; ");
      expect(cookieHeader).toContain("better-auth.session_token");

      // Verify Better Auth session hook auto-populated activeTenantId = tenantAId
      const [createdSession] = await testAdminDb
        .select()
        .from(sessions)
        .where(eq(sessions.userId, user1Id))
        .limit(1);
      expect(createdSession).toBeDefined();
      expect(createdSession.activeTenantId).toBe(tenantAId);

      // 3. Targeting Tenant B (where User 1 is DEACTIVATED) -> 404 NOT_FOUND (anti-enumeration)
      const forbiddenSwitchReq = new NextRequest(
        "http://localhost:3000/api/workspace/switch",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: cookieHeader,
          },
          body: JSON.stringify({ tenantId: tenantBId }),
        }
      );
      const forbiddenSwitchRes = await switchWorkspacePost(forbiddenSwitchReq);
      expect(forbiddenSwitchRes.status).toBe(404);
      const forbiddenBody = await forbiddenSwitchRes.json();
      expect(forbiddenBody.error?.code).toBe("NOT_FOUND");

      // 4. Clear activeTenantId on session, then switch to Tenant A -> 200 and DB updated
      await testAdminDb
        .update(sessions)
        .set({ activeTenantId: null })
        .where(eq(sessions.id, createdSession.id));

      const validSwitchReq = new NextRequest(
        "http://localhost:3000/api/workspace/switch",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: cookieHeader,
          },
          body: JSON.stringify({ tenantId: tenantAId }),
        }
      );
      const validSwitchRes = await switchWorkspacePost(validSwitchReq);
      expect(validSwitchRes.status).toBe(200);
      const validBody = await validSwitchRes.json();
      expect(validBody.data).toEqual({
        activeTenantId: tenantAId,
        role: "DOCUMENT_AUTHOR",
        redirectTo: "/documents",
      });

      const [updatedSession] = await testAdminDb
        .select()
        .from(sessions)
        .where(eq(sessions.id, createdSession.id))
        .limit(1);
      expect(updatedSession.activeTenantId).toBe(tenantAId);
    });

    it("rejects context.userId caller impersonation in Server Actions outside test environments", async () => {
      Reflect.set(process.env, "NODE_ENV", "production");
      Reflect.deleteProperty(process.env, "VITEST");

      const caller = await resolveServerActionCaller({
        userId: user1Id,
        tenantId: tenantAId,
      });
      expect(caller).toBeNull();

      const actionResult = await getAuditLogsAction(
        { limit: 5 },
        { userId: user1Id, tenantId: tenantAId, callerDb: testAppDb }
      );
      expect(actionResult.success).toBe(false);
      if (!actionResult.success) {
        expect(actionResult.error.code).toBe("UNAUTHORIZED");
        expect(actionResult.error.status).toBe(401);
      }
    });
  }
);
