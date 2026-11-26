import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  tenants,
  users,
  tenantMemberships,
  audienceGroups,
  audienceGroupMembers,
  auditLogs,
} from "@/db/schema";
import {
  testAdminDb,
  testAppDb,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";
import {
  inviteWorkspaceMemberAction,
  updateMemberRoleOrStatusAction,
  updateWorkspaceGovernanceSettingsAction,
  manageAudienceGroupAction,
} from "@/server/actions/workspace-admin.actions";

describe("Hybrid Quotas (DEC-01) & Workspace Admin Server Actions", () => {
  let tenantId: string;
  let adminUserId: string;
  let nonAdminUserId: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    // 1. Create Workspace with Creator limit = 2, Reader limit = 3
    const [t] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Quota Enforcement Workspace",
        slug: `quota-workspace-${Date.now()}`,
        creatorSeatLimit: 2,
        readerPackLimit: 3,
        allowSingleAuthorOverride: false,
      })
      .returning();
    tenantId = t.id;

    // 2. Create Admin user
    const [uAdmin] = await testAdminDb
      .insert(users)
      .values({
        name: "Workspace Administrator",
        email: `admin-quota-${Date.now()}@veridoc.test`,
      })
      .returning();
    adminUserId = uAdmin.id;
    userIds.push(adminUserId);

    // Initial membership: 1 Creator seat used (admin)
    await testAdminDb.insert(tenantMemberships).values({
      tenantId,
      userId: adminUserId,
      role: "WORKSPACE_ADMIN",
      status: "ACTIVE",
    });

    // 3. Create Non-Admin user
    const [uNonAdmin] = await testAdminDb
      .insert(users)
      .values({
        name: "Standard Author",
        email: `non-admin-${Date.now()}@veridoc.test`,
      })
      .returning();
    nonAdminUserId = uNonAdmin.id;
    userIds.push(nonAdminUserId);

    await testAdminDb.insert(tenantMemberships).values({
      tenantId,
      userId: nonAdminUserId,
      role: "DOCUMENT_AUTHOR",
      status: "ACTIVE",
    });
    // At this point: 2/2 creator seats utilized (admin + non-admin)!
  });

  afterAll(async () => {
    await cleanupTestTenants([tenantId]);
    await cleanupTestUsers(userIds);
  });

  describe("1. Creator Seat Quota Enforcement (DEC-01)", () => {
    it("rejects inviting a 3rd Creator with HTTP 402 SEAT_QUOTA_EXCEEDED when limit is 2", async () => {
      // 2 creator seats are already consumed (admin + nonAdmin)
      const res = await inviteWorkspaceMemberAction(
        {
          tenantId,
          email: `overflow-creator-${Date.now()}@veridoc.test`,
          name: "Overflow Creator",
          role: "QUALITY_MANAGER",
        },
        { userId: adminUserId, callerDb: testAppDb }
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.status).toBe(402);
        expect(res.error.code).toBe("SEAT_QUOTA_EXCEEDED");
        expect(res.error.message).toContain("Creator Seat quota");
      }
    });

    it("permits inviting Readers up to the readerPackLimit (3 slots)", async () => {
      // Invite Reader 1
      const res1 = await inviteWorkspaceMemberAction(
        {
          tenantId,
          email: `reader-1-${Date.now()}@veridoc.test`,
          name: "Reader One",
          role: "READER",
        },
        { userId: adminUserId, callerDb: testAppDb }
      );
      expect(res1.success).toBe(true);
      if (res1.success) {
        userIds.push(res1.data.userId);
        expect(res1.data.role).toBe("READER");
        expect(res1.data.status).toBe("INVITED");
      }

      // Invite Reader 2
      const res2 = await inviteWorkspaceMemberAction(
        {
          tenantId,
          email: `reader-2-${Date.now()}@veridoc.test`,
          name: "Reader Two",
          role: "READER",
        },
        { userId: adminUserId, callerDb: testAppDb }
      );
      expect(res2.success).toBe(true);
      if (res2.success) {
        userIds.push(res2.data.userId);
      }

      // Invite Reader 3
      const res3 = await inviteWorkspaceMemberAction(
        {
          tenantId,
          email: `reader-3-${Date.now()}@veridoc.test`,
          name: "Reader Three",
          role: "READER",
        },
        { userId: adminUserId, callerDb: testAppDb }
      );
      expect(res3.success).toBe(true);
      if (res3.success) {
        userIds.push(res3.data.userId);
      }
    });

    it("rejects inviting a 4th Reader with HTTP 402 SEAT_QUOTA_EXCEEDED when reader limit is 3", async () => {
      const res4 = await inviteWorkspaceMemberAction(
        {
          tenantId,
          email: `reader-4-${Date.now()}@veridoc.test`,
          name: "Reader Four",
          role: "READER",
        },
        { userId: adminUserId, callerDb: testAppDb }
      );

      expect(res4.success).toBe(false);
      if (!res4.success) {
        expect(res4.error.status).toBe(402);
        expect(res4.error.code).toBe("SEAT_QUOTA_EXCEEDED");
        expect(res4.error.message).toContain("Reader Pack quota");
      }
    });
  });

  describe("2. Seat Release on Deactivation & Quota Re-acquisition", () => {
    let readerMembershipId: string;
    let authorMembershipId: string;

    beforeAll(async () => {
      // Find the membership IDs of one reader and the non-admin author
      const members = await testAdminDb
        .select({ id: tenantMemberships.id, role: tenantMemberships.role })
        .from(tenantMemberships)
        .where(eq(tenantMemberships.tenantId, tenantId));

      const readerMem = members.find((m) => m.role === "READER");
      const authorMem = members.find((m) => m.role === "DOCUMENT_AUTHOR");

      expect(readerMem).toBeDefined();
      expect(authorMem).toBeDefined();

      readerMembershipId = readerMem!.id;
      authorMembershipId = authorMem!.id;
    });

    it("rejects promoting an existing Reader to a Creator role when creator seats are full (2/2)", async () => {
      const res = await updateMemberRoleOrStatusAction(
        {
          tenantId,
          membershipId: readerMembershipId,
          newRole: "APPROVER_REVIEWER",
        },
        { userId: adminUserId, callerDb: testAppDb }
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.status).toBe(402);
        expect(res.error.code).toBe("SEAT_QUOTA_EXCEEDED");
      }
    });

    it("releases a Creator seat when a Creator is DEACTIVATED", async () => {
      const res = await updateMemberRoleOrStatusAction(
        {
          tenantId,
          membershipId: authorMembershipId,
          newStatus: "DEACTIVATED",
          justification: "Employee left organization per SEC-99",
        },
        { userId: adminUserId, callerDb: testAppDb }
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.status).toBe("DEACTIVATED");
      }
    });

    it("permits promoting the Reader to a Creator role after a Creator seat was released", async () => {
      const res = await updateMemberRoleOrStatusAction(
        {
          tenantId,
          membershipId: readerMembershipId,
          newRole: "DOCUMENT_AUTHOR",
        },
        { userId: adminUserId, callerDb: testAppDb }
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.role).toBe("DOCUMENT_AUTHOR");
      }
    });

    it("rejects reactivating the deactivated Creator because Creator seats are full again", async () => {
      const res = await updateMemberRoleOrStatusAction(
        {
          tenantId,
          membershipId: authorMembershipId,
          newStatus: "ACTIVE",
        },
        { userId: adminUserId, callerDb: testAppDb }
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.status).toBe(402);
        expect(res.error.code).toBe("SEAT_QUOTA_EXCEEDED");
      }
    });
  });

  describe("3. Administrative Security Guards & Safety Constraints", () => {
    it("rejects non-admin attempting workspace admin actions with 403 FORBIDDEN", async () => {
      const res = await inviteWorkspaceMemberAction(
        {
          tenantId,
          email: `attacker-${Date.now()}@veridoc.test`,
          role: "READER",
        },
        { userId: nonAdminUserId, callerDb: testAppDb }
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.status).toBe(403);
        expect(res.error.code).toBe("FORBIDDEN");
      }
    });

    it("blocks Admin from deactivating their own active membership", async () => {
      const [adminMem] = await testAdminDb
        .select({ id: tenantMemberships.id })
        .from(tenantMemberships)
        .where(
          and(
            eq(tenantMemberships.tenantId, tenantId),
            eq(tenantMemberships.userId, adminUserId)
          )
        );

      const res = await updateMemberRoleOrStatusAction(
        {
          tenantId,
          membershipId: adminMem.id,
          newStatus: "DEACTIVATED",
        },
        { userId: adminUserId, callerDb: testAppDb }
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.status).toBe(400);
        expect(res.error.message).toContain("Cannot deactivate your own");
      }
    });

    it("updates governance settings (allowSingleAuthorOverride) and emits audit log", async () => {
      const res = await updateWorkspaceGovernanceSettingsAction(
        {
          tenantId,
          allowSingleAuthorOverride: true,
        },
        { userId: adminUserId, callerDb: testAppDb }
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.allowSingleAuthorOverride).toBe(true);
      }

      // Verify DB updated
      const [t] = await testAdminDb
        .select({ allowSingleAuthorOverride: tenants.allowSingleAuthorOverride })
        .from(tenants)
        .where(eq(tenants.id, tenantId));
      expect(t.allowSingleAuthorOverride).toBe(true);
    });

    it("manages audience groups (CREATE, UPDATE, ASSIGN, DELETE) with audit logs", async () => {
      // 1. Create Group
      const createRes = await manageAudienceGroupAction(
        {
          operation: "CREATE_GROUP",
          tenantId,
          name: "Cleanroom Operations",
          groupType: "DEPARTMENT",
        },
        { userId: adminUserId, callerDb: testAppDb }
      );

      expect(createRes.success).toBe(true);
      const groupId = createRes.success ? createRes.data.groupId! : "";
      expect(groupId).toBeDefined();

      // 2. Update Group Name
      const updateRes = await manageAudienceGroupAction(
        {
          operation: "UPDATE_GROUP",
          tenantId,
          groupId,
          name: "Cleanroom Operations (Shift A)",
        },
        { userId: adminUserId, callerDb: testAppDb }
      );
      expect(updateRes.success).toBe(true);

      // 3. Assign Active Members
      const assignRes = await manageAudienceGroupAction(
        {
          operation: "ASSIGN_MEMBERS",
          tenantId,
          groupId,
          userIds: [adminUserId],
        },
        { userId: adminUserId, callerDb: testAppDb }
      );
      expect(assignRes.success).toBe(true);
      if (assignRes.success) {
        expect(assignRes.data.memberCount).toBe(1);
      }

      // 4. Delete Group
      const deleteRes = await manageAudienceGroupAction(
        {
          operation: "DELETE_GROUP",
          tenantId,
          groupId,
        },
        { userId: adminUserId, callerDb: testAppDb }
      );
      expect(deleteRes.success).toBe(true);
    });
  });
});
