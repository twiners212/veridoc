import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import {
  tenants,
  users,
  tenantMemberships,
  documents,
  documentVersions,
  approvalCycles,
  approvalSteps,
  readAssignments,
  readAcknowledgments,
  auditLogs,
} from "@/db/schema";
import {
  adminClient,
  testAdminDb,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";
import { withTenantContext } from "@/db/context";
import { appendAuditLog } from "@/server/services/audit.service";
import { GET } from "@/app/api/audit/export/route";

describe("Streaming Audit Packet Export API Integration (GET /api/audit/export)", { timeout: 120000 }, () => {
  let tenantAId: string;
  let tenantBId: string;
  let adminUserId: string;
  let qmUserId: string;
  let authorUserId: string;
  let readerUserId: string;
  let documentAId: string;
  let versionAId: string;
  let documentBId: string;

  const tenantIds: string[] = [];
  const userIds: string[] = [];

  const boundSha256 =
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

  beforeAll(async () => {
    // 1. Create Tenants A and B
    const [tA] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Export Test Tenant A",
        slug: `export-t-a-${Date.now()}`,
      })
      .returning();
    tenantAId = tA.id;
    tenantIds.push(tenantAId);

    const [tB] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Export Test Tenant B",
        slug: `export-t-b-${Date.now()}`,
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

    adminUserId = await createUser("Export Admin", "exp-admin");
    qmUserId = await createUser("Export QM", "exp-qm");
    authorUserId = await createUser("Export Author", "exp-author");
    readerUserId = await createUser("Export Reader", "exp-reader");

    // 3. Memberships
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
        documentCode: "SOP-EXP-001",
        category: "MANUFACTURING",
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
        title: "Cleanroom Disinfection Protocol",
        contentFormat: "MARKDOWN",
        markdownContent: "# Protocol\n1. Disinfect hands\n2. Wear gloves",
        documentSha256: boundSha256,
        authorId: authorUserId,
        lifecycleState: "PUBLISHED",
        publishedAt: new Date(),
        publishedBy: adminUserId,
      })
      .returning();
    versionAId = verA.id;

    // 5. Create Approval Cycle and Step in Tenant A
    const [cycleA] = await testAdminDb
      .insert(approvalCycles)
      .values({
        tenantId: tenantAId,
        documentVersionId: versionAId,
        cycleNumber: 1,
        status: "APPROVED",
        submittedSha256: boundSha256,
        submittedBy: authorUserId,
      })
      .returning();

    await testAdminDb.insert(approvalSteps).values({
      tenantId: tenantAId,
      approvalCycleId: cycleA.id,
      stepOrder: 1,
      status: "APPROVED",
      assignedApproverId: qmUserId,
      actedByUserId: qmUserId,
      actedByFullName: "Export QM",
      actedByRole: "QUALITY_MANAGER",
      actedIpAddress: "192.168.1.55",
      authMethod: "PASSWORD_REAUTH",
      signedDocumentSha256: boundSha256,
      decisionIntent: "Approved cleanroom protocol per SOP guidelines",
      actedAt: new Date(),
    });

    // 6. Create Read Assignment & Acknowledgment in Tenant A
    const [assignA] = await testAdminDb
      .insert(readAssignments)
      .values({
        tenantId: tenantAId,
        documentVersionId: versionAId,
        userId: readerUserId,
        status: "COMPLETED",
        dueAt: new Date(Date.now() + 7 * 86400000),
      })
      .returning();

    await testAdminDb.insert(readAcknowledgments).values({
      tenantId: tenantAId,
      documentVersionId: versionAId,
      readAssignmentId: assignA.id,
      userId: readerUserId,
      documentSha256: boundSha256,
      dwellTimeSeconds: 45,
      maxScrollPercent: 100,
      acknowledgedIp: "10.0.0.12",
      acknowledgedAt: new Date(),
    });

    // 7. Seed audit logs for Tenant A
    await withTenantContext(tenantAId, async (tx) => {
      await appendAuditLog(tx, {
        tenantId: tenantAId,
        eventType: "DOCUMENT_CREATED",
        entityType: "DOCUMENT",
        entityId: documentAId,
        actorUserId: authorUserId,
        payloadJson: { documentCode: "SOP-EXP-001" },
      });
      await appendAuditLog(tx, {
        tenantId: tenantAId,
        eventType: "WORKFLOW_SUBMITTED",
        entityType: "DOCUMENT_VERSION",
        entityId: versionAId,
        actorUserId: authorUserId,
        payloadJson: { documentSha256: boundSha256 },
      });
      await appendAuditLog(tx, {
        tenantId: tenantAId,
        eventType: "APPROVAL_GRANTED",
        entityType: "APPROVAL_STEP",
        entityId: cycleA.id,
        actorUserId: qmUserId,
        payloadJson: { signedDocumentSha256: boundSha256 },
      });
      await appendAuditLog(tx, {
        tenantId: tenantAId,
        eventType: "DOCUMENT_PUBLISHED",
        entityType: "DOCUMENT_VERSION",
        entityId: versionAId,
        actorUserId: adminUserId,
        payloadJson: { documentSha256: boundSha256 },
      });
      await appendAuditLog(tx, {
        tenantId: tenantAId,
        eventType: "READ_ACKNOWLEDGED",
        entityType: "READ_ACKNOWLEDGMENT",
        entityId: assignA.id,
        actorUserId: readerUserId,
        payloadJson: { documentSha256: boundSha256, dwellTimeSeconds: 45 },
      });
    });

    // 8. Create Document in Tenant B (for cross-tenant anti-enumeration test)
    const [docB] = await testAdminDb
      .insert(documents)
      .values({
        tenantId: tenantBId,
        documentCode: "SOP-TENANT-B",
        createdBy: adminUserId,
      })
      .returning();
    documentBId = docB.id;
  });

  afterAll(async () => {
    await cleanupTestTenants(tenantIds);
    await cleanupTestUsers(userIds);
  });

  describe("RBAC & Access Authorization", () => {
    it("should allow WORKSPACE_ADMIN to export audit packet (200 OK)", async () => {
      const req = new NextRequest("http://localhost:3000/api/audit/export?format=json", {
        method: "GET",
        headers: {
          "x-user-id": adminUserId,
          "x-tenant-id": tenantAId,
        },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.exportMetadata).toBeDefined();
      expect(json.verification.chainVerified).toBe(true);
      expect(json.documents.length).toBeGreaterThanOrEqual(1);
    });

    it("should allow QUALITY_MANAGER to export audit packet (200 OK)", async () => {
      const req = new NextRequest("http://localhost:3000/api/audit/export?format=json", {
        method: "GET",
        headers: {
          "x-user-id": qmUserId,
          "x-tenant-id": tenantAId,
        },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it("should reject DOCUMENT_AUTHOR with 403 FORBIDDEN", async () => {
      const req = new NextRequest("http://localhost:3000/api/audit/export?format=json", {
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
      const req = new NextRequest("http://localhost:3000/api/audit/export?format=json", {
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
      const req = new NextRequest("http://localhost:3000/api/audit/export?format=json", {
        method: "GET",
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });
  });

  describe("Anti-Enumeration Guard (AC-05)", () => {
    it("should return 404 NOT_FOUND (never 403) when Tenant A queries Tenant B's documentId", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/audit/export?format=json&documentId=${documentBId}`,
        {
          method: "GET",
          headers: {
            "x-user-id": adminUserId,
            "x-tenant-id": tenantAId,
          },
        }
      );
      const res = await GET(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe("NOT_FOUND");
    });
  });

  describe("JSON Export Structure & Cryptographic Payload Binding (DEC-06)", () => {
    it("should produce canonical JSON audit packet with matching document_sha256 bindings", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/audit/export?format=json&documentId=${documentAId}`,
        {
          method: "GET",
          headers: {
            "x-user-id": qmUserId,
            "x-tenant-id": tenantAId,
          },
        }
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(res.headers.get("content-disposition")).toContain("attachment");

      const packet = await res.json();

      // Verification proof
      expect(packet.verification.chainVerified).toBe(true);
      expect(packet.verification.totalEntriesInChain).toBeGreaterThanOrEqual(5);
      expect(packet.verification.genesisPrevHash).toBe("0".repeat(64));

      // Document details
      const doc = packet.documents[0];
      expect(doc.documentCode).toBe("SOP-EXP-001");
      const ver = doc.versions[0];
      expect(ver.documentSha256).toBe(boundSha256);

      // Sign-off bindings
      const step = ver.approvalCycles[0].steps[0];
      expect(step.signedDocumentSha256).toBe(boundSha256);
      expect(step.actedBy.fullName).toBe("Export QM");

      // Read acknowledgment bindings
      const ack = ver.readAcknowledgments.records[0];
      expect(ack.documentSha256).toBe(boundSha256);
      expect(ack.dwellTimeSeconds).toBe(45);

      // Compliance disclosure
      expect(packet.complianceDisclosure.infrastructureBoundaryNotice).toContain(
        "subject to cloud infrastructure security boundaries"
      );
    });
  });

  describe("Pure TypeScript PDF Export Format (%PDF-1.4)", () => {
    it("should return valid %PDF- binary stream with attachment headers and DEC-08 footers", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/audit/export?format=pdf&documentId=${documentAId}`,
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
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("content-disposition")).toContain("attachment");
      expect(res.headers.get("content-disposition")).toContain(".pdf");

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Verify %PDF- magic bytes
      const headerString = buffer.slice(0, 5).toString("ascii");
      expect(headerString).toBe("%PDF-");
      expect(buffer.length).toBeGreaterThan(1000);

      // Verify trailer and xref
      const tailString = buffer.slice(-200).toString("ascii");
      expect(tailString).toContain("trailer");
      expect(tailString).toContain("startxref");
      expect(tailString).toContain("%%EOF");

      // Verify typographic bullet was converted to ASCII '-' rather than '?'
      const pdfText = buffer.toString("latin1");
      expect(pdfText).toContain("MARKDOWN - Author: Export Author");
    });
  });

  describe("Tamper Detection", () => {
    it("should detect hash chain tampering and set chainVerified: false in export", async () => {
      // Tamper Tenant A audit log via adminClient bypassing trigger via replica role
      await adminClient.begin(async (sql) => {
        await sql`SET LOCAL session_replication_role = 'replica'`;
        await sql`UPDATE veridoc.audit_logs SET prev_hash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' WHERE tenant_id = ${tenantAId} AND sequence_number = 2`;
      });

      const req = new NextRequest("http://localhost:3000/api/audit/export?format=json", {
        method: "GET",
        headers: {
          "x-user-id": adminUserId,
          "x-tenant-id": tenantAId,
        },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);

      const packet = await res.json();
      expect(packet.verification.chainVerified).toBe(false);
      expect(packet.verification.failedSequenceNumber).toBe(2);
    });
  });
});
