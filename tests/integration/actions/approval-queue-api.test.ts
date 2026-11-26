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
} from "@/db/schema";
import {
  testAdminDb,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";
import { GET } from "@/app/api/approvals/queue/route";

describe("Approval Queue API Integration (GET /api/approvals/queue)", { timeout: 120000 }, () => {
  let tenantAId: string;
  let tenantBId: string;
  let adminUserId: string;
  let authorUserId: string;
  let approver1UserId: string;
  let approver2UserId: string;
  let inactiveApproverUserId: string;
  let readerUserId: string;
  let tenantBApproverUserId: string;

  const tenantIds: string[] = [];
  const userIds: string[] = [];

  const dummySha256 =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  beforeAll(async () => {
    // 1. Create Workspace Tenants A & B
    const [tA] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Queue Test Tenant A",
        slug: `queue-t-a-${Date.now()}`,
      })
      .returning();
    tenantAId = tA.id;
    tenantIds.push(tenantAId);

    const [tB] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Queue Test Tenant B",
        slug: `queue-t-b-${Date.now()}`,
      })
      .returning();
    tenantBId = tB.id;
    tenantIds.push(tenantBId);

    // 2. Helper to create user
    async function createUser(name: string, emailPrefix: string) {
      const [u] = await testAdminDb
        .insert(users)
        .values({
          name,
          email: `${emailPrefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@veridoc.test`,
        })
        .returning();
      userIds.push(u.id);
      return u.id;
    }

    adminUserId = await createUser("Workspace Admin A", "admin-a");
    authorUserId = await createUser("Author A", "author-a");
    approver1UserId = await createUser("Approver 1 A", "approver1-a");
    approver2UserId = await createUser("Approver 2 A", "approver2-a");
    inactiveApproverUserId = await createUser("Inactive Approver A", "inactive-a");
    readerUserId = await createUser("Reader A", "reader-a");
    tenantBApproverUserId = await createUser("Approver B", "approver-b");

    // 3. Create memberships in Tenant A
    await testAdminDb.insert(tenantMemberships).values([
      { tenantId: tenantAId, userId: adminUserId, role: "WORKSPACE_ADMIN", status: "ACTIVE" },
      { tenantId: tenantAId, userId: authorUserId, role: "DOCUMENT_AUTHOR", status: "ACTIVE" },
      { tenantId: tenantAId, userId: approver1UserId, role: "APPROVER_REVIEWER", status: "ACTIVE" },
      { tenantId: tenantAId, userId: approver2UserId, role: "APPROVER_REVIEWER", status: "ACTIVE" },
      { tenantId: tenantAId, userId: inactiveApproverUserId, role: "APPROVER_REVIEWER", status: "DEACTIVATED" },
      { tenantId: tenantAId, userId: readerUserId, role: "READER", status: "ACTIVE" },
    ]);

    // Create membership in Tenant B
    await testAdminDb.insert(tenantMemberships).values([
      { tenantId: tenantBId, userId: tenantBApproverUserId, role: "APPROVER_REVIEWER", status: "ACTIVE" },
    ]);

    // 4. Create Controlled Documents and Multi-Step Approval Workflows in Tenant A
    // Doc 1: Active 2-stage sequential workflow (Step 1 PENDING for approver1, Step 2 WAITING for approver2)
    const [doc1] = await testAdminDb
      .insert(documents)
      .values({
        tenantId: tenantAId,
        documentCode: "SOP-SAF-004",
        category: "Safety",
        createdBy: authorUserId,
      })
      .returning();

    const [ver1] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId: tenantAId,
        documentId: doc1.id,
        versionMajor: 1,
        versionMinor: 0,
        title: "Hazardous Chemical Handling & Spill Response",
        contentFormat: "MARKDOWN",
        markdownContent: "# Chemical Spill Response Protocol",
        documentSha256: dummySha256,
        lifecycleState: "PENDING_APPROVAL",
        authorId: authorUserId,
        rowVersion: 1,
      })
      .returning();

    const [cycle1] = await testAdminDb
      .insert(approvalCycles)
      .values({
        tenantId: tenantAId,
        documentVersionId: ver1.id,
        cycleNumber: 1,
        submittedBy: authorUserId,
        submittedSha256: dummySha256,
        status: "IN_PROGRESS",
      })
      .returning();

    await testAdminDb.insert(approvalSteps).values([
      {
        tenantId: tenantAId,
        approvalCycleId: cycle1.id,
        stepOrder: 1,
        assignedApproverId: approver1UserId,
        status: "PENDING",
      },
      {
        tenantId: tenantAId,
        approvalCycleId: cycle1.id,
        stepOrder: 2,
        assignedApproverId: approver2UserId,
        status: "WAITING",
      },
    ]);

    // Doc 2: Workflow blocked on deactivated/inactive approver (BR-APP-04)
    const [doc2] = await testAdminDb
      .insert(documents)
      .values({
        tenantId: tenantAId,
        documentCode: "SOP-BIO-007",
        category: "Biosecurity",
        createdBy: authorUserId,
      })
      .returning();

    const [ver2] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId: tenantAId,
        documentId: doc2.id,
        versionMajor: 2,
        versionMinor: 0,
        title: "Sterile Cleanroom Gowning Protocol",
        contentFormat: "MARKDOWN",
        markdownContent: "# Gowning Protocol",
        documentSha256: dummySha256,
        lifecycleState: "PENDING_APPROVAL",
        authorId: authorUserId,
        rowVersion: 1,
      })
      .returning();

    const [cycle2] = await testAdminDb
      .insert(approvalCycles)
      .values({
        tenantId: tenantAId,
        documentVersionId: ver2.id,
        cycleNumber: 1,
        submittedBy: authorUserId,
        submittedSha256: dummySha256,
        status: "IN_PROGRESS",
      })
      .returning();

    await testAdminDb.insert(approvalSteps).values([
      {
        tenantId: tenantAId,
        approvalCycleId: cycle2.id,
        stepOrder: 1,
        assignedApproverId: inactiveApproverUserId,
        status: "PENDING",
      },
    ]);

    // Doc 3: Tenant B Document & Workflow
    const [docB] = await testAdminDb
      .insert(documents)
      .values({
        tenantId: tenantBId,
        documentCode: "SOP-TENANT-B-001",
        category: "Operations",
        createdBy: tenantBApproverUserId,
      })
      .returning();

    const [verB] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId: tenantBId,
        documentId: docB.id,
        versionMajor: 1,
        versionMinor: 0,
        title: "Tenant B Isolated SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "# Tenant B Protocol",
        documentSha256: dummySha256,
        lifecycleState: "PENDING_APPROVAL",
        authorId: tenantBApproverUserId,
        rowVersion: 1,
      })
      .returning();

    const [cycleB] = await testAdminDb
      .insert(approvalCycles)
      .values({
        tenantId: tenantBId,
        documentVersionId: verB.id,
        cycleNumber: 1,
        submittedBy: tenantBApproverUserId,
        submittedSha256: dummySha256,
        status: "IN_PROGRESS",
      })
      .returning();

    await testAdminDb.insert(approvalSteps).values([
      {
        tenantId: tenantBId,
        approvalCycleId: cycleB.id,
        stepOrder: 1,
        assignedApproverId: tenantBApproverUserId,
        status: "PENDING",
      },
    ]);
  });

  afterAll(async () => {
    await cleanupTestTenants(tenantIds);
    await cleanupTestUsers(userIds);
  });

  it("Test 1: should return 401 UNAUTHORIZED when no authentication session/headers provided", async () => {
    const req = new NextRequest("http://localhost:3000/api/approvals/queue?scope=active", {
      method: "GET",
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error?.code).toBe("UNAUTHORIZED");
  });

  it("Test 2: should return 400 VALIDATION_ERROR on malformed query parameters", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/approvals/queue?scope=invalid_scope&page=0&limit=999`,
      {
        method: "GET",
        headers: {
          "x-user-id": approver1UserId,
          "x-tenant-id": tenantAId,
        },
      }
    );

    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("Test 3: should return 403 FORBIDDEN when requested by unauthorized roles (READER)", async () => {
    const req = new NextRequest(`http://localhost:3000/api/approvals/queue?scope=active`, {
      method: "GET",
      headers: {
        "x-user-id": readerUserId,
        "x-tenant-id": tenantAId,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error?.code).toBe("FORBIDDEN");
  });

  it("Test 4: should enforce strict tenant isolation (AC-05)", async () => {
    // Tenant B approver requesting Tenant B's queue
    const reqB = new NextRequest(`http://localhost:3000/api/approvals/queue?scope=active`, {
      method: "GET",
      headers: {
        "x-user-id": tenantBApproverUserId,
        "x-tenant-id": tenantBId,
      },
    });

    const resB = await GET(reqB);
    expect(resB.status).toBe(200);
    const bodyB = await resB.json();
    expect(bodyB.data.items).toHaveLength(1);
    expect(bodyB.data.items[0].documentCode).toBe("SOP-TENANT-B-001");
    // Ensure none of Tenant A's documents leaked into Tenant B
    expect(bodyB.data.items.some((i: any) => i.documentCode === "SOP-SAF-004")).toBe(false);
  });

  it("Test 5: scope=active should return only PENDING steps assigned to actor, excluding WAITING steps", async () => {
    const req = new NextRequest(`http://localhost:3000/api/approvals/queue?scope=active`, {
      method: "GET",
      headers: {
        "x-user-id": approver1UserId,
        "x-tenant-id": tenantAId,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    const item = body.data.items[0];
    expect(item.documentCode).toBe("SOP-SAF-004");
    expect(item.stepOrder).toBe(1);
    expect(item.stepStatus).toBe("PENDING");
    expect(item.assignedApproverId).toBe(approver1UserId);
  });

  it("Test 6: scope=active should include complete bound metadata (DEC-06, BR-APP-01)", async () => {
    const req = new NextRequest(`http://localhost:3000/api/approvals/queue?scope=active`, {
      method: "GET",
      headers: {
        "x-user-id": approver1UserId,
        "x-tenant-id": tenantAId,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const item = body.data.items[0];

    expect(item.documentCode).toBe("SOP-SAF-004");
    expect(item.documentTitle).toBe("Hazardous Chemical Handling & Spill Response");
    expect(item.versionMajor).toBe(1);
    expect(item.versionMinor).toBe(0);
    expect(item.versionLabel).toBe("v1.0");
    expect(item.documentSha256).toBe(dummySha256);
    expect(item.authorName).toBe("Author A");
    expect(item.stepOrder).toBe(1);
    expect(item.totalSteps).toBe(2);
    expect(item.submittedAt).toBeDefined();
    expect(item.stepsInCycle).toHaveLength(2);
    expect(item.stepsInCycle[0].status).toBe("PENDING");
    expect(item.stepsInCycle[1].status).toBe("WAITING");
  });

  it("Test 7: scope=upcoming should return future sequential steps in WAITING status", async () => {
    const req = new NextRequest(`http://localhost:3000/api/approvals/queue?scope=upcoming`, {
      method: "GET",
      headers: {
        "x-user-id": approver2UserId,
        "x-tenant-id": tenantAId,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    const item = body.data.items[0];
    expect(item.documentCode).toBe("SOP-SAF-004");
    expect(item.stepOrder).toBe(2);
    expect(item.stepStatus).toBe("WAITING");
    expect(item.assignedApproverId).toBe(approver2UserId);
  });

  it("Test 8: should return accurate pagination calculations (page, limit, total, totalPages)", async () => {
    // Admin sees all active steps in Tenant A (2 items: SOP-SAF-004 step 1 and SOP-BIO-007 step 1)
    const req = new NextRequest(
      `http://localhost:3000/api/approvals/queue?scope=active&page=1&limit=1`,
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
    const body = await res.json();
    expect(body.data.pagination.page).toBe(1);
    expect(body.data.pagination.limit).toBe(1);
    expect(body.data.pagination.total).toBe(2);
    expect(body.data.pagination.totalPages).toBe(2);
    expect(body.data.items).toHaveLength(1);
  });

  it("Test 9: should detect BLOCKED_INACTIVE_APPROVER when assigned approver is deactivated (BR-APP-04)", async () => {
    // Admin checks queue and inspects SOP-BIO-007
    const req = new NextRequest(
      `http://localhost:3000/api/approvals/queue?scope=active&search=SOP-BIO-007`,
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
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    const item = body.data.items[0];
    expect(item.documentCode).toBe("SOP-BIO-007");
    expect(item.assignedApproverId).toBe(inactiveApproverUserId);
    expect(item.isBlockedInactiveApprover).toBe(true);
    expect(item.canAdminOverride).toBe(true);
  });
});
