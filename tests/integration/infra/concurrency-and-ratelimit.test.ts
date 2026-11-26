import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  tenants,
  users,
  tenantMemberships,
  documents,
  documentVersions,
  rateLimits,
} from "@/db/schema";
import { withTenantContext } from "@/db/context";
import { appendAuditLog } from "@/server/services/audit.service";
import { GET as verifyGet } from "@/app/api/audit/verify/route";
import { GET as exportGet } from "@/app/api/audit/export/route";
import {
  consumeDistributedRateLimit,
  checkDistributedRateLimit,
  clearDistributedRateLimit,
} from "@/server/security/rate-limiter";
import {
  testAdminDb,
  testAppDb,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";

describe(
  "Infrastructure Integration: Concurrency Pool & Distributed Rate Limits (veridoc_app_user)",
  { timeout: 120000 },
  () => {
    let tenantId: string;
    let qm1UserId: string;
    let qm2UserId: string;
    const tenantIds: string[] = [];
    const userIds: string[] = [];
    const rateKeysToClean: string[] = [];

    beforeAll(async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const [t] = await testAdminDb
        .insert(tenants)
        .values({
          name: "Infra Concurrency Tenant",
          slug: `infra-conc-${suffix}`,
        })
        .returning();
      tenantId = t.id;
      tenantIds.push(tenantId);

      const [u1] = await testAdminDb
        .insert(users)
        .values({
          name: "QM One",
          email: `qm1-infra-${suffix}@veridoc.test`,
          emailVerified: true,
        })
        .returning();
      qm1UserId = u1.id;
      userIds.push(qm1UserId);

      const [u2] = await testAdminDb
        .insert(users)
        .values({
          name: "QM Two",
          email: `qm2-infra-${suffix}@veridoc.test`,
          emailVerified: true,
        })
        .returning();
      qm2UserId = u2.id;
      userIds.push(qm2UserId);

      await testAdminDb.insert(tenantMemberships).values([
        {
          tenantId,
          userId: qm1UserId,
          role: "QUALITY_MANAGER",
          status: "ACTIVE",
        },
        {
          tenantId,
          userId: qm2UserId,
          role: "QUALITY_MANAGER",
          status: "ACTIVE",
        },
      ]);

      const [doc] = await testAdminDb
        .insert(documents)
        .values({
          tenantId,
          documentCode: `SOP-INFRA-${suffix}`,
          category: "QA",
          createdBy: qm1UserId,
        })
        .returning();

      await testAdminDb.insert(documentVersions).values({
        tenantId,
        documentId: doc.id,
        versionMajor: 1,
        versionMinor: 0,
        title: "Concurrency Verification SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "# Concurrency Test",
        documentSha256: "a".repeat(64),
        authorId: qm1UserId,
        lifecycleState: "PUBLISHED",
        publishedAt: new Date(),
        publishedBy: qm1UserId,
      });

      await withTenantContext(
        tenantId,
        async (tx) => {
          await appendAuditLog(tx, {
            tenantId,
            eventType: "DOCUMENT_CREATED",
            entityType: "DOCUMENT",
            entityId: doc.id,
            actorUserId: qm1UserId,
            actorRole: "QUALITY_MANAGER",
            payloadJson: { code: doc.documentCode },
          });
        },
        testAppDb
      );

      rateKeysToClean.push(
        `audit-export:${tenantId}:${qm1UserId}`,
        `audit-export:${tenantId}:${qm2UserId}`
      );
    });

    afterAll(async () => {
      for (const key of rateKeysToClean) {
        await clearDistributedRateLimit(key, testAppDb);
      }
      await cleanupTestTenants(tenantIds);
      await cleanupTestUsers(userIds);
    });

    it("executes 15 parallel GET /api/audit/verify requests without pool deadlock", async () => {
      const requests = Array.from({ length: 15 }, () => {
        const req = new NextRequest("http://localhost:3000/api/audit/verify", {
          headers: {
            "x-tenant-id": tenantId,
            "x-user-id": qm1UserId,
          },
        });
        return verifyGet(req);
      });

      const settled = await Promise.allSettled(requests);
      expect(settled).toHaveLength(15);

      for (const item of settled) {
        expect(item.status).toBe("fulfilled");
        if (item.status !== "fulfilled") continue;
        expect(item.value.status).toBe(200);
        const body = (await item.value.json()) as {
          success: boolean;
          data: { verified: boolean; totalEntries: number };
        };
        expect(body.success).toBe(true);
        expect(body.data.verified).toBe(true);
        expect(body.data.totalEntries).toBeGreaterThanOrEqual(1);
      }
    });

    it("executes 15 parallel GET /api/audit/export requests without pool deadlock", async () => {
      // Split across 2 users (8 + 7) so all 15 bypass the 10-per-user rate limit
      // and exercise 15 simultaneous DB-backed export + chain-replay transactions.
      const requests = Array.from({ length: 15 }, (_, idx) => {
        const userId = idx < 8 ? qm1UserId : qm2UserId;
        const req = new NextRequest(
          "http://localhost:3000/api/audit/export?format=json",
          {
            headers: {
              "x-tenant-id": tenantId,
              "x-user-id": userId,
            },
          }
        );
        return exportGet(req);
      });

      const settled = await Promise.allSettled(requests);
      expect(settled).toHaveLength(15);

      for (const item of settled) {
        expect(item.status).toBe("fulfilled");
        if (item.status !== "fulfilled") continue;
        expect(item.value.status).toBe(200);
        const body = (await item.value.json()) as {
          verification: { chainVerified: boolean };
          scope: { totalAuditEntriesInScope: number };
        };
        expect(body.verification.chainVerified).toBe(true);
        expect(body.scope.totalAuditEntriesInScope).toBeGreaterThanOrEqual(1);
      }
    });

    it("persists veridoc.rate_limits across independent calls as veridoc_app_user and cleans up expired rows", async () => {
      const key = `infra-persist:${Date.now()}:${Math.random()}`;
      const expiredDummyKey = `infra-expired-dummy:${Date.now()}:${Math.random()}`;
      rateKeysToClean.push(key, expiredDummyKey);

      await clearDistributedRateLimit(key, testAppDb);

      // Insert an already-expired dummy row as veridoc_app_user
      await testAppDb.insert(rateLimits).values({
        key: expiredDummyKey,
        windowStart: new Date(Date.now() - 120_000),
        count: 3,
        expiresAt: new Date(Date.now() - 60_000),
      });

      const r1 = await consumeDistributedRateLimit(key, 2, 5000, testAppDb);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(1);

      const r2 = await consumeDistributedRateLimit(key, 2, 5000, testAppDb);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(0);

      // Direct DB check verifies persistent count = 2
      const [row] = await testAppDb
        .select()
        .from(rateLimits)
        .where(eq(rateLimits.key, key))
        .limit(1);
      expect(row).toBeDefined();
      expect(row.count).toBe(2);

      const chk = await checkDistributedRateLimit(key, 2, 5000, testAppDb);
      expect(chk.allowed).toBe(false);

      // Force opportunistic cleanup branch (< 0.02) on next write
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.01);
      try {
        const r3 = await consumeDistributedRateLimit(key, 2, 5000, testAppDb);
        expect(r3.allowed).toBe(false);
      } finally {
        randomSpy.mockRestore();
      }

      // Expired dummy row should have been purged by opportunistic cleanup
      const [expiredAfter] = await testAppDb
        .select()
        .from(rateLimits)
        .where(eq(rateLimits.key, expiredDummyKey))
        .limit(1);
      expect(expiredAfter).toBeUndefined();
    });
  }
);
