import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withTenantContext } from "@/db/context";
import { tenants, users, tenantMemberships, documents, documentVersions } from "@/db/schema";
import {
  testAdminDb,
  testAppDb,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";
import {
  assertActiveMembership,
  assertWorkspaceAdmin,
  canManageMembers,
  assertCanManageMembers,
  canManageGovernance,
  assertCanManageGovernance,
  canManageGroups,
  assertCanManageGroups,
  canCreateDocument,
  assertCanCreateDocument,
  canPublishDocument,
  assertCanPublishDocument,
  canRetireDocument,
  assertCanRetireDocument,
  canViewAuditLogs,
  assertCanViewAuditLogs,
  canExportAuditPacket,
  assertCanExportAuditPacket,
  canViewCompletionDashboard,
  assertCanViewCompletionDashboard,
  canApproveDocumentVersion,
  assertCanApproveDocumentVersion,
  canSubmitWorkflowApprovers,
  assertCanSubmitWorkflowApprovers,
  canAdminOverrideApprover,
  assertCanAdminOverrideApprover,
  canViewDocumentVersion,
  assertCanViewDocumentVersion,
  canEditDocumentVersion,
  assertCanEditDocumentVersion,
} from "@/server/policies";
import type { ActiveMembership } from "@/server/policies/rbac.types";

describe("5-Role RBAC Capability Matrix & Security Policies", () => {
  let tenantId: string;
  let adminUserId: string;
  let qmUserId: string;
  let authorUserId: string;
  let approverUserId: string;
  let readerUserId: string;
  let deactivatedUserId: string;

  let adminMembership: ActiveMembership;
  let qmMembership: ActiveMembership;
  let authorMembership: ActiveMembership;
  let approverMembership: ActiveMembership;
  let readerMembership: ActiveMembership;

  const userIds: string[] = [];

  beforeAll(async () => {
    // 1. Seed Tenant
    const [t] = await testAdminDb
      .insert(tenants)
      .values({
        name: "RBAC Matrix Workspace",
        slug: `rbac-matrix-${Date.now()}`,
        creatorSeatLimit: 10,
        readerPackLimit: 100,
        allowSingleAuthorOverride: false,
      })
      .returning();
    tenantId = t.id;

    // 2. Helper to create user + membership
    const createUser = async (name: string, email: string) => {
      const [u] = await testAdminDb
        .insert(users)
        .values({ name, email })
        .returning();
      userIds.push(u.id);
      return u.id;
    };

    adminUserId = await createUser("Admin User", `admin-${Date.now()}@veridoc.test`);
    qmUserId = await createUser("Quality Manager", `qm-${Date.now()}@veridoc.test`);
    authorUserId = await createUser("Document Author", `author-${Date.now()}@veridoc.test`);
    approverUserId = await createUser("Approver Reviewer", `approver-${Date.now()}@veridoc.test`);
    readerUserId = await createUser("Frontline Reader", `reader-${Date.now()}@veridoc.test`);
    deactivatedUserId = await createUser("Deactivated Member", `deactivated-${Date.now()}@veridoc.test`);

    // 3. Seed Memberships
    const seedMembership = async (
      userId: string,
      role: "WORKSPACE_ADMIN" | "QUALITY_MANAGER" | "DOCUMENT_AUTHOR" | "APPROVER_REVIEWER" | "READER",
      status: "ACTIVE" | "DEACTIVATED" = "ACTIVE"
    ) => {
      const [m] = await testAdminDb
        .insert(tenantMemberships)
        .values({
          tenantId,
          userId,
          role,
          status,
        })
        .returning();
      return m;
    };

    const mAdmin = await seedMembership(adminUserId, "WORKSPACE_ADMIN");
    const mQm = await seedMembership(qmUserId, "QUALITY_MANAGER");
    const mAuthor = await seedMembership(authorUserId, "DOCUMENT_AUTHOR");
    const mApprover = await seedMembership(approverUserId, "APPROVER_REVIEWER");
    const mReader = await seedMembership(readerUserId, "READER");
    await seedMembership(deactivatedUserId, "DOCUMENT_AUTHOR", "DEACTIVATED");

    adminMembership = { ...mAdmin, status: "ACTIVE" };
    qmMembership = { ...mQm, status: "ACTIVE" };
    authorMembership = { ...mAuthor, status: "ACTIVE" };
    approverMembership = { ...mApprover, status: "ACTIVE" };
    readerMembership = { ...mReader, status: "ACTIVE" };
  });

  afterAll(async () => {
    await cleanupTestTenants([tenantId]);
    await cleanupTestUsers(userIds);
  });

  describe("1. Live Membership Resolution & Fail-Closed Assertions", () => {
    it("resolves active memberships correctly in tenant context", async () => {
      await withTenantContext(
        tenantId,
        async (tx) => {
          const m = await assertActiveMembership(tx, tenantId, adminUserId);
          expect(m.role).toBe("WORKSPACE_ADMIN");
          expect(m.status).toBe("ACTIVE");
        },
        testAppDb
      );
    });

    it("fails closed (throws 403) for DEACTIVATED membership", async () => {
      await withTenantContext(
        tenantId,
        async (tx) => {
          await expect(
            assertActiveMembership(tx, tenantId, deactivatedUserId)
          ).rejects.toThrow("User does not have an active membership in this workspace");
        },
        testAppDb
      );
    });

    it("fails closed (throws 403) for non-member user ID", async () => {
      const randomUserId = "00000000-0000-0000-0000-000000000000";
      await withTenantContext(
        tenantId,
        async (tx) => {
          await expect(
            assertActiveMembership(tx, tenantId, randomUserId)
          ).rejects.toThrow();
        },
        testAppDb
      );
    });

    it("enforces assertWorkspaceAdmin strictly", async () => {
      await withTenantContext(
        tenantId,
        async (tx) => {
          await expect(assertWorkspaceAdmin(tx, tenantId, adminUserId)).resolves.toBeDefined();
          await expect(assertWorkspaceAdmin(tx, tenantId, qmUserId)).rejects.toThrow(
            "Action requires WORKSPACE_ADMIN role"
          );
          await expect(assertWorkspaceAdmin(tx, tenantId, authorUserId)).rejects.toThrow();
          await expect(assertWorkspaceAdmin(tx, tenantId, readerUserId)).rejects.toThrow();
        },
        testAppDb
      );
    });
  });

  describe("2. Workspace Administrative Capabilities Matrix", () => {
    it("canManageMembers: only WORKSPACE_ADMIN has permission", () => {
      expect(canManageMembers(adminMembership)).toBe(true);
      expect(canManageMembers(qmMembership)).toBe(false);
      expect(canManageMembers(authorMembership)).toBe(false);
      expect(canManageMembers(approverMembership)).toBe(false);
      expect(canManageMembers(readerMembership)).toBe(false);

      expect(() => assertCanManageMembers(adminMembership)).not.toThrow();
      expect(() => assertCanManageMembers(qmMembership)).toThrow();
    });

    it("canManageGovernance: only WORKSPACE_ADMIN has permission", () => {
      expect(canManageGovernance(adminMembership)).toBe(true);
      expect(canManageGovernance(qmMembership)).toBe(false);
      expect(canManageGovernance(authorMembership)).toBe(false);
      expect(canManageGovernance(approverMembership)).toBe(false);
      expect(canManageGovernance(readerMembership)).toBe(false);

      expect(() => assertCanManageGovernance(adminMembership)).not.toThrow();
      expect(() => assertCanManageGovernance(authorMembership)).toThrow();
    });

    it("canManageGroups: only WORKSPACE_ADMIN has permission", () => {
      expect(canManageGroups(adminMembership)).toBe(true);
      expect(canManageGroups(qmMembership)).toBe(false);
      expect(canManageGroups(authorMembership)).toBe(false);
      expect(canManageGroups(approverMembership)).toBe(false);
      expect(canManageGroups(readerMembership)).toBe(false);

      expect(() => assertCanManageGroups(adminMembership)).not.toThrow();
      expect(() => assertCanManageGroups(qmMembership)).toThrow();
    });
  });

  describe("3. Document Authoring, Publishing & Audit Matrix", () => {
    it("canCreateDocument: ADMIN, QM, and AUTHOR", () => {
      expect(canCreateDocument(adminMembership)).toBe(true);
      expect(canCreateDocument(qmMembership)).toBe(true);
      expect(canCreateDocument(authorMembership)).toBe(true);
      expect(canCreateDocument(approverMembership)).toBe(false);
      expect(canCreateDocument(readerMembership)).toBe(false);

      expect(() => assertCanCreateDocument(authorMembership)).not.toThrow();
      expect(() => assertCanCreateDocument(readerMembership)).toThrow();
    });

    it("canPublishDocument: only ADMIN and QM", () => {
      expect(canPublishDocument(adminMembership)).toBe(true);
      expect(canPublishDocument(qmMembership)).toBe(true);
      expect(canPublishDocument(authorMembership)).toBe(false);
      expect(canPublishDocument(approverMembership)).toBe(false);
      expect(canPublishDocument(readerMembership)).toBe(false);

      expect(() => assertCanPublishDocument(qmMembership)).not.toThrow();
      expect(() => assertCanPublishDocument(authorMembership)).toThrow();
    });

    it("canRetireDocument: only ADMIN and QM", () => {
      expect(canRetireDocument(adminMembership)).toBe(true);
      expect(canRetireDocument(qmMembership)).toBe(true);
      expect(canRetireDocument(authorMembership)).toBe(false);
      expect(canRetireDocument(approverMembership)).toBe(false);
      expect(canRetireDocument(readerMembership)).toBe(false);
    });

    it("canViewAuditLogs & canExportAuditPacket: ADMIN and QM", () => {
      expect(canViewAuditLogs(adminMembership)).toBe(true);
      expect(canViewAuditLogs(qmMembership)).toBe(true);
      expect(canViewAuditLogs(authorMembership)).toBe(false);
      expect(canViewAuditLogs(approverMembership)).toBe(false);
      expect(canViewAuditLogs(readerMembership)).toBe(false);

      expect(canExportAuditPacket(adminMembership)).toBe(true);
      expect(canExportAuditPacket(qmMembership)).toBe(true);
      expect(canExportAuditPacket(authorMembership)).toBe(false);
    });

    it("canViewCompletionDashboard: ADMIN and QM", () => {
      expect(canViewCompletionDashboard(adminMembership)).toBe(true);
      expect(canViewCompletionDashboard(qmMembership)).toBe(true);
      expect(canViewCompletionDashboard(authorMembership)).toBe(false);
      expect(canViewCompletionDashboard(approverMembership)).toBe(false);
      expect(canViewCompletionDashboard(readerMembership)).toBe(false);
    });
  });

  describe("4. Separation of Duties & Self-Approval Prevention (DEC-03, BR-APP-01)", () => {
    it("prohibits document author from approving their own document version by default", () => {
      // Author attempting to approve version they authored
      const res = canApproveDocumentVersion(authorMembership, authorUserId, {
        allowSingleAuthorOverride: false,
      });
      expect(res.allowed).toBe(false);
      expect(res.errorCode).toBe("SELF_APPROVAL_PROHIBITED");

      expect(() =>
        assertCanApproveDocumentVersion(authorMembership, authorUserId, {
          allowSingleAuthorOverride: false,
        })
      ).toThrow("Self-approval is prohibited: author cannot approve their own document version");
    });

    it("prohibits WORKSPACE_ADMIN from approving a version they authored when override is disabled", () => {
      // Admin authored the version
      const res = canApproveDocumentVersion(adminMembership, adminUserId, {
        allowSingleAuthorOverride: false,
      });
      expect(res.allowed).toBe(false);
      expect(res.errorCode).toBe("SELF_APPROVAL_PROHIBITED");
    });

    it("permits approval if actor is not the author", () => {
      const res = canApproveDocumentVersion(approverMembership, authorUserId, {
        allowSingleAuthorOverride: false,
      });
      expect(res.allowed).toBe(true);

      const resAdmin = canApproveDocumentVersion(adminMembership, authorUserId, {
        allowSingleAuthorOverride: false,
      });
      expect(resAdmin.allowed).toBe(true);
    });

    it("permits self-approval when allowSingleAuthorOverride is true", () => {
      const res = canApproveDocumentVersion(authorMembership, authorUserId, {
        allowSingleAuthorOverride: true,
      });
      expect(res.allowed).toBe(true);
    });

    it("validates workflow submission approver list (cannot contain author without override)", () => {
      const invalidSubmission = canSubmitWorkflowApprovers(
        authorUserId,
        [approverUserId, authorUserId],
        { allowSingleAuthorOverride: false }
      );
      expect(invalidSubmission.allowed).toBe(false);
      expect(invalidSubmission.errorCode).toBe("SELF_APPROVAL_PROHIBITED");

      const validSubmission = canSubmitWorkflowApprovers(
        authorUserId,
        [approverUserId, qmUserId],
        { allowSingleAuthorOverride: false }
      );
      expect(validSubmission.allowed).toBe(true);

      const allowedWithOverride = canSubmitWorkflowApprovers(
        authorUserId,
        [authorUserId],
        { allowSingleAuthorOverride: true }
      );
      expect(allowedWithOverride.allowed).toBe(true);
    });
  });

  describe("5. Workspace Admin Approver Override (BR-APP-04)", () => {
    it("permits WORKSPACE_ADMIN to override a PENDING step when not author", () => {
      const targetStep = { assignedApproverId: approverUserId, status: "PENDING" as const };
      const res = canAdminOverrideApprover(
        adminMembership,
        targetStep,
        { status: "DEACTIVATED" },
        authorUserId,
        { allowSingleAuthorOverride: false }
      );
      expect(res.allowed).toBe(true);
      expect(() =>
        assertCanAdminOverrideApprover(
          adminMembership,
          targetStep,
          { status: "DEACTIVATED" },
          authorUserId,
          { allowSingleAuthorOverride: false }
        )
      ).not.toThrow();
    });

    it("rejects override when step is not in PENDING status (e.g. WAITING or APPROVED)", () => {
      const waitingStep = { assignedApproverId: approverUserId, status: "WAITING" as const };
      const res = canAdminOverrideApprover(
        adminMembership,
        waitingStep,
        { status: "ACTIVE" },
        authorUserId
      );
      expect(res.allowed).toBe(false);
      expect(res.errorCode).toBe("APPROVAL_STEP_NOT_ACTIVE");
    });

    it("rejects override if non-admin attempts it", () => {
      const targetStep = { assignedApproverId: approverUserId, status: "PENDING" as const };
      const res = canAdminOverrideApprover(
        qmMembership,
        targetStep,
        { status: "DEACTIVATED" },
        authorUserId
      );
      expect(res.allowed).toBe(false);
      expect(res.errorCode).toBe("FORBIDDEN");
    });

    it("blocks Admin from overriding to approve a version the Admin authored without override", () => {
      const targetStep = { assignedApproverId: approverUserId, status: "PENDING" as const };
      const res = canAdminOverrideApprover(
        adminMembership,
        targetStep,
        { status: "DEACTIVATED" },
        adminUserId, // Admin is the author!
        { allowSingleAuthorOverride: false }
      );
      expect(res.allowed).toBe(false);
      expect(res.errorCode).toBe("SELF_APPROVAL_PROHIBITED");
    });
  });

  describe("6. Document Lifecycle Visibility & Anti-Enumeration", () => {
    it("permits all active members (including READER) to view PUBLISHED SOPs", () => {
      const publishedVersion = {
        authorId: authorUserId,
        lifecycleState: "PUBLISHED" as const,
      };
      expect(canViewDocumentVersion(readerMembership, publishedVersion)).toBe(true);
      expect(canViewDocumentVersion(authorMembership, publishedVersion)).toBe(true);
      expect(canViewDocumentVersion(approverMembership, publishedVersion)).toBe(true);
      expect(canViewDocumentVersion(qmMembership, publishedVersion)).toBe(true);
      expect(canViewDocumentVersion(adminMembership, publishedVersion)).toBe(true);
    });

    it("enforces anti-enumeration (404 NOT_FOUND) for READER attempting to view unpublished SOPs", () => {
      const draftVersion = {
        authorId: authorUserId,
        lifecycleState: "DRAFT" as const,
      };
      expect(canViewDocumentVersion(readerMembership, draftVersion)).toBe(false);
      expect(() => assertCanViewDocumentVersion(readerMembership, draftVersion)).toThrow(
        "Document not found"
      );

      const pendingVersion = {
        authorId: authorUserId,
        lifecycleState: "PENDING_APPROVAL" as const,
      };
      expect(canViewDocumentVersion(readerMembership, pendingVersion)).toBe(false);
      expect(() => assertCanViewDocumentVersion(readerMembership, pendingVersion)).toThrow(
        "Document not found"
      );
    });

    it("permits author to view own DRAFT, but throws 403 when another author attempts to view", () => {
      const ownDraft = { authorId: authorUserId, lifecycleState: "DRAFT" as const };
      expect(canViewDocumentVersion(authorMembership, ownDraft)).toBe(true);

      const foreignDraft = { authorId: "other-user-uuid", lifecycleState: "DRAFT" as const };
      expect(canViewDocumentVersion(authorMembership, foreignDraft)).toBe(false);
      expect(() => assertCanViewDocumentVersion(authorMembership, foreignDraft)).toThrow(
        "Insufficient permissions to view this document version"
      );
    });

    it("permits approver to view PENDING_APPROVAL only if assigned", () => {
      const assignedPending = {
        authorId: authorUserId,
        lifecycleState: "PENDING_APPROVAL" as const,
        assignedApproverIds: [approverUserId],
      };
      expect(canViewDocumentVersion(approverMembership, assignedPending)).toBe(true);

      const unassignedPending = {
        authorId: authorUserId,
        lifecycleState: "PENDING_APPROVAL" as const,
        assignedApproverIds: ["different-approver-uuid"],
      };
      expect(canViewDocumentVersion(approverMembership, unassignedPending)).toBe(false);
    });

    it("asserts immutability on APPROVED, PUBLISHED, SUPERSEDED, and RETIRED states", () => {
      const published = { authorId: authorUserId, lifecycleState: "PUBLISHED" as const };
      const approved = { authorId: authorUserId, lifecycleState: "APPROVED" as const };
      const draft = { authorId: authorUserId, lifecycleState: "DRAFT" as const };

      expect(canEditDocumentVersion(adminMembership, published).allowed).toBe(false);
      expect(canEditDocumentVersion(adminMembership, published).errorCode).toBe("VERSION_IMMUTABLE");

      expect(canEditDocumentVersion(authorMembership, approved).allowed).toBe(false);
      expect(canEditDocumentVersion(authorMembership, approved).errorCode).toBe("VERSION_IMMUTABLE");

      expect(canEditDocumentVersion(authorMembership, draft).allowed).toBe(true);
      expect(canEditDocumentVersion(readerMembership, draft).allowed).toBe(false);
    });
  });
});
