import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withTenantContext } from "@/db/context";
import {
  tenants,
  users,
  tenantMemberships,
  documents,
  documentVersions,
  approvalCycles,
  approvalSteps,
  readAssignments,
  audienceGroups,
} from "@/db/schema";
import { getWorkspaceContextSnapshot } from "@/server/services/workspace.service";
import {
  loadDashboardPageContextAndDataAction,
  loadApprovalsPageBundleAction,
  loadDocumentsPageBundleAction,
  loadDocumentDetailPageBundleAction,
  loadToReadPageBundleAction,
  loadReadDocumentPageBundleAction,
  loadAuditPageBundleAction,
  loadSettingsPageBundleAction,
} from "@/server/actions/dashboard-loaders.actions";
import {
  testAdminDb,
  testAppDb,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";

describe(
  "Navigation Single-TX Loaders & Consolidated Context Snapshot (veridoc_app_user)",
  { timeout: 120000 },
  () => {
    let tenantAId: string;
    let tenantBId: string;
    let adminAId: string;
    let qmAId: string;
    let authorAId: string;
    let approver1AId: string;
    let approver2AId: string;
    let readerAId: string;
    let deactivatedAId: string;
    let adminBId: string;
    let docAId: string;
    let docBId: string;

    const tenantIds: string[] = [];
    const userIds: string[] = [];
    const sha256 =
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

    beforeAll(async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const [tA] = await testAdminDb
        .insert(tenants)
        .values({
          name: "Nav Opt Tenant A",
          slug: `nav-opt-a-${suffix}`,
          creatorSeatLimit: 10,
          readerPackLimit: 50,
          allowSingleAuthorOverride: false,
        })
        .returning();
      tenantAId = tA.id;
      tenantIds.push(tenantAId);

      const [tB] = await testAdminDb
        .insert(tenants)
        .values({
          name: "Nav Opt Tenant B",
          slug: `nav-opt-b-${suffix}`,
        })
        .returning();
      tenantBId = tB.id;
      tenantIds.push(tenantBId);

      async function createUser(name: string, prefix: string) {
        const [u] = await testAdminDb
          .insert(users)
          .values({
            name,
            email: `${prefix}-${suffix}@veridoc.test`,
            emailVerified: true,
          })
          .returning();
        userIds.push(u.id);
        return u.id;
      }

      adminAId = await createUser("Admin A", "nav-admin-a");
      qmAId = await createUser("QM A", "nav-qm-a");
      authorAId = await createUser("Author A", "nav-author-a");
      approver1AId = await createUser("Approver 1 A", "nav-app1-a");
      approver2AId = await createUser("Approver 2 A", "nav-app2-a");
      readerAId = await createUser("Reader A", "nav-reader-a");
      deactivatedAId = await createUser("Deactivated A", "nav-deact-a");
      adminBId = await createUser("Admin B", "nav-admin-b");

      await testAdminDb.insert(tenantMemberships).values([
        { tenantId: tenantAId, userId: adminAId, role: "WORKSPACE_ADMIN", status: "ACTIVE" },
        { tenantId: tenantAId, userId: qmAId, role: "QUALITY_MANAGER", status: "ACTIVE" },
        { tenantId: tenantAId, userId: authorAId, role: "DOCUMENT_AUTHOR", status: "ACTIVE" },
        { tenantId: tenantAId, userId: approver1AId, role: "APPROVER_REVIEWER", status: "ACTIVE" },
        { tenantId: tenantAId, userId: approver2AId, role: "APPROVER_REVIEWER", status: "ACTIVE" },
        { tenantId: tenantAId, userId: readerAId, role: "READER", status: "ACTIVE" },
        { tenantId: tenantAId, userId: deactivatedAId, role: "APPROVER_REVIEWER", status: "DEACTIVATED" },
        { tenantId: tenantBId, userId: adminBId, role: "WORKSPACE_ADMIN", status: "ACTIVE" },
      ]);

      // Group in Tenant A
      const [grp] = await testAdminDb
        .insert(audienceGroups)
        .values({
          tenantId: tenantAId,
          name: "Ops Floor",
          groupType: "DEPARTMENT",
        })
        .returning();

      // Doc A1: PENDING_APPROVAL assigned to approver1 (step 1 PENDING), approver2 (step 2 WAITING)
      const [dA1] = await testAdminDb
        .insert(documents)
        .values({
          tenantId: tenantAId,
          documentCode: "SOP-NAV-001",
          category: "Safety",
          createdBy: authorAId,
        })
        .returning();
      docAId = dA1.id;

      const [vA1] = await testAdminDb
        .insert(documentVersions)
        .values({
          tenantId: tenantAId,
          documentId: dA1.id,
          versionMajor: 1,
          versionMinor: 0,
          title: "Pending Approval Procedure",
          contentFormat: "MARKDOWN",
          markdownContent: "# Pending Approval",
          documentSha256: sha256,
          lifecycleState: "PENDING_APPROVAL",
          authorId: authorAId,
        })
        .returning();

      const [cA1] = await testAdminDb
        .insert(approvalCycles)
        .values({
          tenantId: tenantAId,
          documentVersionId: vA1.id,
          cycleNumber: 1,
          submittedBy: authorAId,
          submittedSha256: sha256,
          status: "IN_PROGRESS",
        })
        .returning();

      await testAdminDb.insert(approvalSteps).values([
        {
          tenantId: tenantAId,
          approvalCycleId: cA1.id,
          stepOrder: 1,
          assignedApproverId: approver1AId,
          status: "PENDING",
        },
        {
          tenantId: tenantAId,
          approvalCycleId: cA1.id,
          stepOrder: 2,
          assignedApproverId: approver2AId,
          status: "WAITING",
        },
      ]);

      // Doc A2: PUBLISHED with PENDING read assignment for readerAId
      const [dA2] = await testAdminDb
        .insert(documents)
        .values({
          tenantId: tenantAId,
          documentCode: "SOP-NAV-002",
          category: "Quality",
          createdBy: authorAId,
        })
        .returning();

      const [vA2] = await testAdminDb
        .insert(documentVersions)
        .values({
          tenantId: tenantAId,
          documentId: dA2.id,
          versionMajor: 1,
          versionMinor: 0,
          title: "Published Active SOP",
          contentFormat: "MARKDOWN",
          markdownContent: "# Active SOP",
          documentSha256: sha256,
          lifecycleState: "PUBLISHED",
          authorId: authorAId,
          publishedAt: new Date(),
          publishedBy: qmAId,
          effectiveDate: new Date(),
        })
        .returning();

      await testAdminDb.insert(readAssignments).values({
        tenantId: tenantAId,
        documentVersionId: vA2.id,
        userId: readerAId,
        assignedViaGroupId: grp.id,
        status: "PENDING",
        dueAt: new Date(Date.now() + 7 * 86400_000),
      });

      // Doc B: isolated in Tenant B
      const [dB] = await testAdminDb
        .insert(documents)
        .values({
          tenantId: tenantBId,
          documentCode: "SOP-NAV-B01",
          category: "Operations",
          createdBy: adminBId,
        })
        .returning();
      docBId = dB.id;

      const [vB] = await testAdminDb
        .insert(documentVersions)
        .values({
          tenantId: tenantBId,
          documentId: dB.id,
          versionMajor: 1,
          versionMinor: 0,
          title: "Tenant B Confidential SOP",
          contentFormat: "MARKDOWN",
          markdownContent: "# Secret B",
          documentSha256: sha256,
          lifecycleState: "PENDING_APPROVAL",
          authorId: adminBId,
        })
        .returning();

      const [cB] = await testAdminDb
        .insert(approvalCycles)
        .values({
          tenantId: tenantBId,
          documentVersionId: vB.id,
          cycleNumber: 1,
          submittedBy: adminBId,
          submittedSha256: sha256,
          status: "IN_PROGRESS",
        })
        .returning();

      await testAdminDb.insert(approvalSteps).values({
        tenantId: tenantBId,
        approvalCycleId: cB.id,
        stepOrder: 1,
        assignedApproverId: adminBId,
        status: "PENDING",
      });
    });

    afterAll(async () => {
      await cleanupTestTenants(tenantIds);
      await cleanupTestUsers(userIds);
    });

    it("getWorkspaceContextSnapshot returns accurate counts and enforces role-scoped badges & RLS as veridoc_app_user", async () => {
      // Admin sees all active creator seats (5 ACTIVE creators; deactivated excluded) and 1 pending approval
      const adminSnap = await withTenantContext(
        tenantAId,
        (tx, tId) => getWorkspaceContextSnapshot(tx, tId, adminAId),
        testAppDb
      );
      expect(adminSnap).toMatchObject({
        tenantId: tenantAId,
        tenantName: "Nav Opt Tenant A",
        role: "WORKSPACE_ADMIN",
        creatorCount: 5,
        creatorSeatLimit: 10,
        readerCount: 1,
        readerPackLimit: 50,
        allowSingleAuthorOverride: false,
        pendingApprovalsCount: 1,
        pendingToReadCount: 0,
      });

      // Approver 1 has 1 PENDING step assigned; Approver 2 only has a WAITING step -> 0
      const app1Snap = await withTenantContext(
        tenantAId,
        (tx, tId) => getWorkspaceContextSnapshot(tx, tId, approver1AId),
        testAppDb
      );
      expect(app1Snap?.pendingApprovalsCount).toBe(1);

      const app2Snap = await withTenantContext(
        tenantAId,
        (tx, tId) => getWorkspaceContextSnapshot(tx, tId, approver2AId),
        testAppDb
      );
      expect(app2Snap?.pendingApprovalsCount).toBe(0);

      // Reader has 0 pendingApprovalsCount and 1 pendingToReadCount
      const readerSnap = await withTenantContext(
        tenantAId,
        (tx, tId) => getWorkspaceContextSnapshot(tx, tId, readerAId),
        testAppDb
      );
      expect(readerSnap?.pendingApprovalsCount).toBe(0);
      expect(readerSnap?.pendingToReadCount).toBe(1);

      // Deactivated user returns null (immediate lockout)
      const deactSnap = await withTenantContext(
        tenantAId,
        (tx, tId) => getWorkspaceContextSnapshot(tx, tId, deactivatedAId),
        testAppDb
      );
      expect(deactSnap).toBeNull();

      // Cross-tenant user returns null under FORCE RLS
      const crossSnap = await withTenantContext(
        tenantAId,
        (tx, tId) => getWorkspaceContextSnapshot(tx, tId, adminBId),
        testAppDb
      );
      expect(crossSnap).toBeNull();

      // Outside withTenantContext, RLS returns 0 rows -> null
      const noContextSnap = await getWorkspaceContextSnapshot(
        testAppDb as unknown as Parameters<typeof getWorkspaceContextSnapshot>[0],
        tenantAId,
        adminAId
      );
      expect(noContextSnap).toBeNull();
    });

    it("loadDashboardPageContextAndDataAction enforces role gating and returns consolidated KPIs in 1 TX", async () => {
      const unauth = await loadDashboardPageContextAndDataAction();
      expect(unauth.status).toBe("UNAUTHENTICATED");

      const readerRes = await loadDashboardPageContextAndDataAction({
        userId: readerAId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      expect(readerRes.status).toBe("REDIRECT_TO_READ");

      const authorRes = await loadDashboardPageContextAndDataAction({
        userId: authorAId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      expect(authorRes.status).toBe("FORBIDDEN");

      const qmRes = await loadDashboardPageContextAndDataAction({
        userId: qmAId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      expect(qmRes.status).toBe("OK");
      if (qmRes.status === "OK") {
        expect(qmRes.authContext.tenantName).toBe("Nav Opt Tenant A");
        expect(qmRes.dashboardData.kpis.activeSops).toBe(1);
        expect(qmRes.dashboardData.kpis.pendingApprovals).toBe(1);
        expect(qmRes.dashboardData.kpis.totalAssignedCount).toBe(1);
      }
    });

    it("loadApprovalsPageBundleAction pre-loads SSR initialItems with strict tenant & role isolation", async () => {
      const readerRes = await loadApprovalsPageBundleAction({
        userId: readerAId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      expect(readerRes.status).toBe("FORBIDDEN");

      const app1Res = await loadApprovalsPageBundleAction({
        userId: approver1AId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      expect(app1Res.status).toBe("OK");
      if (app1Res.status === "OK") {
        expect(app1Res.initialItems).toHaveLength(1);
        expect(app1Res.initialItems[0].documentCode).toBe("SOP-NAV-001");
        expect(app1Res.initialItems[0].canApprove).toBe(true);
      }

      // Approver 2 has no active PENDING step (only WAITING step 2) -> empty initialItems
      const app2Res = await loadApprovalsPageBundleAction({
        userId: approver2AId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      expect(app2Res.status).toBe("OK");
      if (app2Res.status === "OK") {
        expect(app2Res.initialItems).toHaveLength(0);
      }
    });

    it("other single-TX page loaders enforce RBAC, visibility, and cross-tenant isolation", async () => {
      // /documents
      const docsReader = await loadDocumentsPageBundleAction({
        userId: readerAId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      expect(docsReader.status).toBe("OK");
      if (docsReader.status === "OK") {
        // Reader only sees PUBLISHED SOP-NAV-002, not PENDING_APPROVAL SOP-NAV-001 or Tenant B
        expect(docsReader.documents.map((d) => d.documentCode)).toEqual([
          "SOP-NAV-002",
        ]);
      }

      // /documents/[documentId] anti-enumeration across tenants
      const crossDetail = await loadDocumentDetailPageBundleAction(docBId, {
        userId: adminAId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      expect(crossDetail.status).toBe("NOT_FOUND");

      const validDetail = await loadDocumentDetailPageBundleAction(docAId, {
        userId: authorAId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      expect(validDetail.status).toBe("OK");
      if (validDetail.status === "OK") {
        expect(validDetail.detail.document.documentCode).toBe("SOP-NAV-001");
        expect(validDetail.availableApprovers.length).toBeGreaterThan(0);
      }

      // /to-read
      const toReadRes = await loadToReadPageBundleAction({
        userId: readerAId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      expect(toReadRes.status).toBe("OK");
      if (toReadRes.status === "OK") {
        expect(toReadRes.readQueue.items).toHaveLength(1);
        expect(toReadRes.readQueue.items[0].documentCode).toBe("SOP-NAV-002");
      }

      // /read/[documentId]
      const readDocRes = await loadReadDocumentPageBundleAction(docAId, {
        userId: readerAId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      // Reader cannot view PENDING_APPROVAL doc -> 404 anti-enumeration
      expect(readDocRes.status).toBe("NOT_FOUND");

      // /audit
      const auditAuthor = await loadAuditPageBundleAction({
        userId: authorAId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      expect(auditAuthor.status).toBe("FORBIDDEN");

      const auditAdmin = await loadAuditPageBundleAction({
        userId: adminAId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      expect(auditAdmin.status).toBe("OK");

      // /settings
      const settingsBadUuid = await loadSettingsPageBundleAction("bad-id", {
        userId: adminAId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      expect(settingsBadUuid.status).toBe("NOT_FOUND");

      const settingsQm = await loadSettingsPageBundleAction(undefined, {
        userId: qmAId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      expect(settingsQm.status).toBe("FORBIDDEN");

      const settingsAdmin = await loadSettingsPageBundleAction(undefined, {
        userId: adminAId,
        tenantId: tenantAId,
        callerDb: testAppDb,
      });
      expect(settingsAdmin.status).toBe("OK");
      if (settingsAdmin.status === "OK") {
        expect(settingsAdmin.settings.tenant.id).toBe(tenantAId);
        expect(settingsAdmin.settings.capacity.creatorCount).toBe(5);
      }
    });
  }
);
