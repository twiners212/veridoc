import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import {
  tenants,
  users,
  tenantMemberships,
  documents,
  documentVersions,
  auditLogs,
} from "@/db/schema";
import {
  adminClient,
  testAdminDb,
  testAppDb,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";
import { withTenantContext } from "@/db/context";
import {
  appendAuditLog,
  type EnrichedAuditLogItem,
} from "@/server/services/audit.service";
import { GET } from "@/app/api/audit/logs/route";
import { POST as verifyPost } from "@/app/api/audit/verify/route";

describe("Audit Logs API Integration (GET /api/audit/logs & POST /api/audit/verify)", { timeout: 120000 }, () => {
  let tenantAId: string;
  let tenantBId: string;
  let adminUserId: string;
  let qmUserId: string;
  let authorUserId: string;
  let readerUserId: string;
  let documentAId: string;
  let versionAId: string;

  const tenantIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    // 1. Create Workspace Tenants A & B
    const [tA] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Audit Test Tenant A",
        slug: `audit-t-a-${Date.now()}`,
      })
      .returning();
    tenantAId = tA.id;
    tenantIds.push(tenantAId);

    const [tB] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Audit Test Tenant B",
        slug: `audit-t-b-${Date.now()}`,
      })
      .returning();
    tenantBId = tB.id;
    tenantIds.push(tenantBId);

    // 2. Create Users
    async function createUser(name: string, emailPrefix: string) {
      const [u] = await testAdminDb
        .insert(users)
        .values({
          name,
          email: `${emailPrefix}-${Date.now()}@example.com`,
          emailVerified: true,
        })
        .returning();
      userIds.push(u.id);
      return u.id;
    }

    adminUserId = await createUser("Alice Admin", "admin");
    qmUserId = await createUser("Quinn QM", "qm");
    authorUserId = await createUser("Arthur Author", "author");
    readerUserId = await createUser("Rita Reader", "reader");

    // 3. Memberships for Tenant A
    await testAdminDb.insert(tenantMemberships).values([
      { tenantId: tenantAId, userId: adminUserId, role: "WORKSPACE_ADMIN", status: "ACTIVE" },
      { tenantId: tenantAId, userId: qmUserId, role: "QUALITY_MANAGER", status: "ACTIVE" },
      { tenantId: tenantAId, userId: authorUserId, role: "DOCUMENT_AUTHOR", status: "ACTIVE" },
      { tenantId: tenantAId, userId: readerUserId, role: "READER", status: "ACTIVE" },
    ]);

    // 4. Create Document & Version in Tenant A
    const [docA] = await testAdminDb
      .insert(documents)
      .values({
        tenantId: tenantAId,
        documentCode: "SOP-AUD-001",
        category: "SAFETY",
        createdBy: authorUserId,
      })
      .returning();
    documentAId = docA.id;

    const [verA] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId: tenantAId,
        documentId: documentAId,
        versionMajor: 1,
        versionMinor: 0,
        title: "Standard Audit Procedure",
        contentFormat: "MARKDOWN",
        markdownContent: "# Standard Audit Procedure\nInitial draft",
        documentSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        authorId: authorUserId,
        lifecycleState: "PUBLISHED",
      })
      .returning();
    versionAId = verA.id;

    // 5. Append 15 sequential audit logs for Tenant A
    await withTenantContext(tenantAId, async (tx) => {
      for (let i = 1; i <= 15; i++) {
        let eventType = "DOCUMENT_UPDATED";
        if (i === 1) eventType = "DOCUMENT_CREATED";
        else if (i === 5) eventType = "WORKFLOW_SUBMITTED";
        else if (i === 10) eventType = "APPROVAL_GRANTED";
        else if (i === 15) eventType = "DOCUMENT_PUBLISHED";

        await appendAuditLog(tx, {
          tenantId: tenantAId,
          eventType,
          entityType: "DOCUMENT_VERSION",
          entityId: versionAId,
          actorUserId: i % 2 === 0 ? qmUserId : adminUserId,
          actorRole: i % 2 === 0 ? "QUALITY_MANAGER" : "WORKSPACE_ADMIN",
          actorIp: `192.168.1.${100 + i}`,
          payloadJson: {
            step: i,
            documentCode: "SOP-AUD-001",
            versionLabel: "v1.0",
          },
        });
      }
    });

    // 6. Append 3 audit logs for Tenant B
    await withTenantContext(tenantBId, async (tx) => {
      for (let i = 1; i <= 3; i++) {
        await appendAuditLog(tx, {
          tenantId: tenantBId,
          eventType: "TENANT_B_EVENT",
          entityType: "TENANT",
          entityId: tenantBId,
          payloadJson: { note: "Tenant B isolation test" },
        });
      }
    });
  });

  afterAll(async () => {
    await cleanupTestTenants(tenantIds);
    await cleanupTestUsers(userIds);
  });

  describe("RBAC & Access Control", () => {
    it("should allow WORKSPACE_ADMIN to access audit logs (200 OK)", async () => {
      const req = new NextRequest("http://localhost:3000/api/audit/logs?limit=10", {
        method: "GET",
        headers: {
          "x-user-id": adminUserId,
          "x-tenant-id": tenantAId,
        },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.items).toBeDefined();
      expect(json.data.stats).toBeDefined();
      expect(json.data.stats.ledgerHead).toBe(15);
    });

    it("should allow QUALITY_MANAGER to access audit logs (200 OK)", async () => {
      const req = new NextRequest("http://localhost:3000/api/audit/logs?limit=5", {
        method: "GET",
        headers: {
          "x-user-id": qmUserId,
          "x-tenant-id": tenantAId,
        },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.items.length).toBe(5);
    });

    it("should reject DOCUMENT_AUTHOR with 403 FORBIDDEN", async () => {
      const req = new NextRequest("http://localhost:3000/api/audit/logs", {
        method: "GET",
        headers: {
          "x-user-id": authorUserId,
          "x-tenant-id": tenantAId,
        },
      });
      const res = await GET(req);
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.error.code).toBe("FORBIDDEN");
    });

    it("should reject READER with 403 FORBIDDEN", async () => {
      const req = new NextRequest("http://localhost:3000/api/audit/logs", {
        method: "GET",
        headers: {
          "x-user-id": readerUserId,
          "x-tenant-id": tenantAId,
        },
      });
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it("should reject unauthenticated request with 401 UNAUTHORIZED", async () => {
      const req = new NextRequest("http://localhost:3000/api/audit/logs", {
        method: "GET",
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });
  });

  describe("Keyset Cursor Pagination (O(1) composite index)", () => {
    it("Page 1 (limit 5): returns sequences 15..11 with hasMore: true and nextCursorSequence: 11", async () => {
      const req = new NextRequest("http://localhost:3000/api/audit/logs?limit=5", {
        method: "GET",
        headers: {
          "x-user-id": adminUserId,
          "x-tenant-id": tenantAId,
        },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.items).toHaveLength(5);
      const seqs = json.data.items.map((i: EnrichedAuditLogItem) => i.sequenceNumber);
      expect(seqs).toEqual([15, 14, 13, 12, 11]);
      expect(json.data.hasMore).toBe(true);
      expect(json.data.nextCursorSequence).toBe(11);
    });

    it("Page 2 (cursor=11, limit 5): returns sequences 10..6 with hasMore: true and nextCursorSequence: 6", async () => {
      const req = new NextRequest("http://localhost:3000/api/audit/logs?cursor=11&limit=5", {
        method: "GET",
        headers: {
          "x-user-id": adminUserId,
          "x-tenant-id": tenantAId,
        },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.items).toHaveLength(5);
      const seqs = json.data.items.map((i: EnrichedAuditLogItem) => i.sequenceNumber);
      expect(seqs).toEqual([10, 9, 8, 7, 6]);
      expect(json.data.hasMore).toBe(true);
      expect(json.data.nextCursorSequence).toBe(6);
    });

    it("Page 3 (cursor=6, limit 10): returns sequences 5..1 with hasMore: false and nextCursorSequence: null", async () => {
      const req = new NextRequest("http://localhost:3000/api/audit/logs?cursor=6&limit=10", {
        method: "GET",
        headers: {
          "x-user-id": adminUserId,
          "x-tenant-id": tenantAId,
        },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.items).toHaveLength(5);
      const seqs = json.data.items.map((i: EnrichedAuditLogItem) => i.sequenceNumber);
      expect(seqs).toEqual([5, 4, 3, 2, 1]);
      expect(json.data.hasMore).toBe(false);
      expect(json.data.nextCursorSequence).toBeNull();
    });

    it("Real-time append resilience: appending seq 16 does not shift cursor=11 window", async () => {
      // Append seq 16 in Tenant A
      await withTenantContext(tenantAId, async (tx) => {
        await appendAuditLog(tx, {
          tenantId: tenantAId,
          eventType: "CONCURRENT_TEST_APPEND",
          entityType: "DOCUMENT_VERSION",
          entityId: versionAId,
          payloadJson: { note: "New concurrent event" },
        });
      });

      // Query page 2 with cursor=11: must STILL return [10, 9, 8, 7, 6]
      const req = new NextRequest("http://localhost:3000/api/audit/logs?cursor=11&limit=5", {
        method: "GET",
        headers: {
          "x-user-id": adminUserId,
          "x-tenant-id": tenantAId,
        },
      });
      const res = await GET(req);
      const json = await res.json();
      const seqs = json.data.items.map((i: EnrichedAuditLogItem) => i.sequenceNumber);
      expect(seqs).toEqual([10, 9, 8, 7, 6]);
    });
  });

  describe("Filters & Multi-Tenant Isolation", () => {
    it("should filter by eventType correctly", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/audit/logs?eventType=APPROVAL_GRANTED",
        {
          method: "GET",
          headers: {
            "x-user-id": adminUserId,
            "x-tenant-id": tenantAId,
          },
        }
      );
      const res = await GET(req);
      const json = await res.json();
      expect(json.data.items.length).toBeGreaterThanOrEqual(1);
      for (const item of json.data.items) {
        expect(item.eventType).toBe("APPROVAL_GRANTED");
      }
    });

    it("should enforce strict multi-tenant isolation (Tenant B logs never returned)", async () => {
      const req = new NextRequest("http://localhost:3000/api/audit/logs?limit=100", {
        method: "GET",
        headers: {
          "x-user-id": adminUserId,
          "x-tenant-id": tenantAId,
        },
      });
      const res = await GET(req);
      const json = await res.json();
      const eventTypes = json.data.items.map((i: EnrichedAuditLogItem) => i.eventType);
      expect(eventTypes).not.toContain("TENANT_B_EVENT");
    });
  });

  describe("Search Queries (?search=...)", () => {
    it("should search by document code without SQL/inet error", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/audit/logs?search=SOP-AUD-001",
        {
          method: "GET",
          headers: {
            "x-user-id": adminUserId,
            "x-tenant-id": tenantAId,
          },
        }
      );
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.items.length).toBeGreaterThan(0);
      for (const item of json.data.items) {
        const matchesCode = item.documentCode === "SOP-AUD-001";
        const matchesPayload = JSON.stringify(item.payloadJson).includes("SOP-AUD-001");
        expect(matchesCode || matchesPayload).toBe(true);
      }
    });

    it("should search by actor IP address without PostgreSQL inet cast error", async () => {
      const targetIp = "192.168.1.105";
      const req = new NextRequest(
        `http://localhost:3000/api/audit/logs?search=${targetIp}`,
        {
          method: "GET",
          headers: {
            "x-user-id": adminUserId,
            "x-tenant-id": tenantAId,
          },
        }
      );
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.items).toHaveLength(1);
      expect(json.data.items[0].actorIp).toBe(targetIp);
    });

    it("should search by actor name", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/audit/logs?search=Quinn",
        {
          method: "GET",
          headers: {
            "x-user-id": adminUserId,
            "x-tenant-id": tenantAId,
          },
        }
      );
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.items.length).toBeGreaterThan(0);
      for (const item of json.data.items) {
        expect(item.actorName).toContain("Quinn");
      }
    });

    it("should return empty list when search term has no match", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/audit/logs?search=NONEXISTENT_TERM_ZZZ",
        {
          method: "GET",
          headers: {
            "x-user-id": adminUserId,
            "x-tenant-id": tenantAId,
          },
        }
      );
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.items).toHaveLength(0);
    });
  });

  describe("Audit Chain Verification Endpoint (POST /api/audit/verify)", () => {
    it("should report verified: true for intact hash chain", async () => {
      const req = new NextRequest("http://localhost:3000/api/audit/verify", {
        method: "POST",
        headers: {
          "x-user-id": qmUserId,
          "x-tenant-id": tenantAId,
        },
      });
      const res = await verifyPost(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.verified).toBe(true);
      expect(json.data.totalEntries).toBeGreaterThanOrEqual(16);
      expect(json.data.headHash).toHaveLength(64);
    });

    it("should detect tampering when payload is modified and return verified: false", async () => {
      // Modify payload of sequence 3 via adminClient bypassing trigger via replica role
      await adminClient.begin(async (sql) => {
        await sql`SET LOCAL session_replication_role = 'replica'`;
        await sql`UPDATE veridoc.audit_logs SET payload_json = '{"tampered": true}'::jsonb WHERE tenant_id = ${tenantAId} AND sequence_number = 3`;
      });

      const req = new NextRequest("http://localhost:3000/api/audit/verify", {
        method: "POST",
        headers: {
          "x-user-id": adminUserId,
          "x-tenant-id": tenantAId,
        },
      });
      const res = await verifyPost(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.verified).toBe(false);
      expect(json.data.failedSequenceNumber).toBe(3);
      expect(json.data.failureReason).toContain("Hash mismatch at sequence 3");
    });
  });
});
