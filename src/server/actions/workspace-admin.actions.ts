"use server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { isValidUuid, withTenantContext, type TenantTransaction } from "@/db/context";
import {
  tenants,
  tenantMemberships,
  users,
  audienceGroups,
  audienceGroupMembers,
} from "@/db/schema";
import {
  resolveServerActionCaller,
  resolveServerActionDb,
  type ServerActionCallerContext,
} from "@/lib/auth/server";
import { createCorrelationId, logError } from "@/lib/logger";
import {
  assertActiveMembership,
  assertWorkspaceAdmin,
  isCreatorSeatRole,
} from "@/server/policies";
import type { WorkspaceRole } from "@/server/policies/rbac.types";
import { appendAuditLog } from "@/server/services/audit.service";
import {
  getWorkspaceSettingsDataInTx,
  type WorkspaceSettingsData,
} from "@/server/services/workspace.service";
import type { ActionResult } from "@/types/actions";
import { DomainError } from "@/types/errors";

export type ActionCallerContext = ServerActionCallerContext;

async function resolveCallerUserId(context?: ActionCallerContext): Promise<string | null> {
  const caller = await resolveServerActionCaller(context);
  return caller?.userId ?? null;
}

function internalActionError(
  actionName: string,
  err: unknown,
  safeMessage: string,
  userId?: string
): ActionResult<never> {
  const correlationId = createCorrelationId();
  logError(`${actionName} failed`, err, { correlationId, userId });
  return {
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: `${safeMessage} (ref: ${correlationId})`,
      status: 500,
    },
  };
}

// ============================================================================
// Quota Helper (DEC-01)
// ============================================================================

export async function checkSeatQuota(
  tx: TenantTransaction,
  tenantId: string,
  targetRole: WorkspaceRole
): Promise<{ allowed: boolean; currentCount: number; limit: number; tier: "CREATOR" | "READER" }> {
  const [tenant] = await tx
    .select({
      creatorSeatLimit: tenants.creatorSeatLimit,
      readerPackLimit: tenants.readerPackLimit,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw new DomainError("NOT_FOUND", "Workspace tenant not found", 404);
  }

  const isCreator = isCreatorSeatRole(targetRole);
  const tier = isCreator ? "CREATOR" : "READER";
  const limit = isCreator ? tenant.creatorSeatLimit : tenant.readerPackLimit;

  const countResult = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, tenantId),
        inArray(tenantMemberships.status, ["ACTIVE", "INVITED"]),
        isCreator
          ? inArray(tenantMemberships.role, [
              "WORKSPACE_ADMIN",
              "QUALITY_MANAGER",
              "DOCUMENT_AUTHOR",
              "APPROVER_REVIEWER",
            ])
          : eq(tenantMemberships.role, "READER")
      )
    );

  const currentCount = countResult[0]?.count ?? 0;
  return {
    allowed: currentCount < limit,
    currentCount,
    limit,
    tier,
  };
}

// ============================================================================
// Action 1: Invite Workspace Member (DEC-01)
// ============================================================================

const inviteWorkspaceMemberSchema = z.object({
  tenantId: z.string().uuid(),
  email: z
    .string()
    .email()
    .transform((e) => e.trim().toLowerCase()),
  name: z.string().min(1).max(255).optional(),
  role: z.enum([
    "WORKSPACE_ADMIN",
    "QUALITY_MANAGER",
    "DOCUMENT_AUTHOR",
    "APPROVER_REVIEWER",
    "READER",
  ]),
  groupIds: z.array(z.string().uuid()).optional().default([]),
});

export type InviteWorkspaceMemberInput = z.infer<typeof inviteWorkspaceMemberSchema>;

export async function inviteWorkspaceMemberAction(
  rawInput: unknown,
  context?: ActionCallerContext
): Promise<
  ActionResult<{
    membershipId: string;
    userId: string;
    email: string;
    role: WorkspaceRole;
    status: "INVITED";
  }>
> {
  const parsed = inviteWorkspaceMemberSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid invitation data",
        status: 400,
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const input = parsed.data;
  const callerUserId = await resolveCallerUserId(context);
  if (!callerUserId) {
    return {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required to perform this action",
        status: 401,
      },
    };
  }

  const dbClient = resolveServerActionDb(context);

  try {
    return await withTenantContext(
      input.tenantId,
      async (tx) => {
        // Authorize actor: must be active WORKSPACE_ADMIN
        const actor = await assertWorkspaceAdmin(tx, input.tenantId, callerUserId);

        // Check seat quota (DEC-01)
        const quota = await checkSeatQuota(tx, input.tenantId, input.role);
        if (!quota.allowed) {
          return {
            success: false,
            error: {
              code: "SEAT_QUOTA_EXCEEDED",
              message: `Workspace has exceeded its ${
                quota.tier === "CREATOR" ? "Creator Seat" : "Reader Pack"
              } quota (${quota.currentCount}/${quota.limit}). Please upgrade your workspace tier.`,
              status: 402,
            },
          };
        }

        // Lookup or create user by email
        let [user] = await tx
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
          })
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);

        if (!user) {
          const userName = input.name || input.email.split("@")[0];
          const [newUser] = await tx
            .insert(users)
            .values({
              email: input.email,
              name: userName,
              emailVerified: false,
            })
            .returning({
              id: users.id,
              email: users.email,
              name: users.name,
            });
          user = newUser;
        }

        // Check existing membership in tenant
        const [existing] = await tx
          .select({
            id: tenantMemberships.id,
            status: tenantMemberships.status,
            role: tenantMemberships.role,
          })
          .from(tenantMemberships)
          .where(
            and(
              eq(tenantMemberships.tenantId, input.tenantId),
              eq(tenantMemberships.userId, user.id)
            )
          )
          .limit(1);

        let membershipId: string;

        if (existing) {
          if (existing.status === "ACTIVE" || existing.status === "INVITED") {
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message: "User is already an active or invited member of this workspace",
                status: 409,
              },
            };
          }

          // Reactivate deactivated membership as INVITED
          const [updated] = await tx
            .update(tenantMemberships)
            .set({
              role: input.role,
              status: "INVITED",
              updatedAt: new Date(),
            })
            .where(eq(tenantMemberships.id, existing.id))
            .returning({ id: tenantMemberships.id });

          membershipId = updated.id;
        } else {
          // Insert new membership with INVITED status
          const [created] = await tx
            .insert(tenantMemberships)
            .values({
              tenantId: input.tenantId,
              userId: user.id,
              role: input.role,
              status: "INVITED",
            })
            .returning({ id: tenantMemberships.id });

          membershipId = created.id;
        }

        // Assign to audience groups if specified
        if (input.groupIds && input.groupIds.length > 0) {
          for (const gId of input.groupIds) {
            const [grp] = await tx
              .select({ id: audienceGroups.id })
              .from(audienceGroups)
              .where(
                and(
                  eq(audienceGroups.id, gId),
                  eq(audienceGroups.tenantId, input.tenantId)
                )
              )
              .limit(1);

            if (grp) {
              await tx
                .insert(audienceGroupMembers)
                .values({
                  tenantId: input.tenantId,
                  groupId: gId,
                  userId: user.id,
                })
                .onConflictDoNothing();
            }
          }
        }

        // Append audit log (DEC-08)
        await appendAuditLog(tx, {
          tenantId: input.tenantId,
          eventType: "WORKSPACE_MEMBER_INVITED",
          entityType: "TENANT_MEMBERSHIP",
          entityId: membershipId,
          actorUserId: actor.userId,
          actorRole: actor.role,
          payloadJson: {
            email: input.email,
            role: input.role,
            invitedUserId: user.id,
            groupIds: input.groupIds,
          },
        });

        return {
          success: true,
          data: {
            membershipId,
            userId: user.id,
            email: user.email,
            role: input.role,
            status: "INVITED",
          },
        };
      },
      dbClient
    );
  } catch (err) {
    if (err instanceof DomainError) {
      return {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          status: err.httpStatus,
        },
      };
    }
    return internalActionError(
      "inviteWorkspaceMemberAction",
      err,
      "Failed to invite member",
      callerUserId
    );
  }
}

// ============================================================================
// Action 2: Update Member Role or Status (DEC-01)
// ============================================================================

const updateMemberRoleOrStatusSchema = z
  .object({
    tenantId: z.string().uuid(),
    membershipId: z.string().uuid(),
    newRole: z
      .enum([
        "WORKSPACE_ADMIN",
        "QUALITY_MANAGER",
        "DOCUMENT_AUTHOR",
        "APPROVER_REVIEWER",
        "READER",
      ])
      .optional(),
    newStatus: z.enum(["ACTIVE", "DEACTIVATED"]).optional(),
    justification: z.string().max(1000).optional(),
  })
  .refine((data) => data.newRole !== undefined || data.newStatus !== undefined, {
    message: "Either newRole or newStatus must be provided",
  });

export type UpdateMemberRoleOrStatusInput = z.infer<typeof updateMemberRoleOrStatusSchema>;

export async function updateMemberRoleOrStatusAction(
  rawInput: unknown,
  context?: ActionCallerContext
): Promise<
  ActionResult<{
    membershipId: string;
    role: WorkspaceRole;
    status: "ACTIVE" | "INVITED" | "DEACTIVATED";
  }>
> {
  const parsed = updateMemberRoleOrStatusSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid member update parameters",
        status: 400,
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const input = parsed.data;
  const callerUserId = await resolveCallerUserId(context);
  if (!callerUserId) {
    return {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required to perform this action",
        status: 401,
      },
    };
  }

  const dbClient = resolveServerActionDb(context);

  try {
    return await withTenantContext(
      input.tenantId,
      async (tx) => {
        // Authorize actor: must be active WORKSPACE_ADMIN
        const actor = await assertWorkspaceAdmin(tx, input.tenantId, callerUserId);

        // Fetch target membership
        const [target] = await tx
          .select({
            id: tenantMemberships.id,
            tenantId: tenantMemberships.tenantId,
            userId: tenantMemberships.userId,
            role: tenantMemberships.role,
            status: tenantMemberships.status,
          })
          .from(tenantMemberships)
          .where(
            and(
              eq(tenantMemberships.id, input.membershipId),
              eq(tenantMemberships.tenantId, input.tenantId)
            )
          )
          .limit(1);

        if (!target) {
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Workspace membership not found",
              status: 404,
            },
          };
        }

        // Self-deactivation prevention
        if (target.userId === actor.userId && input.newStatus === "DEACTIVATED") {
          return {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Cannot deactivate your own active workspace membership",
              status: 400,
            },
          };
        }

        // Guard against demoting or deactivating the last WORKSPACE_ADMIN
        if (
          target.role === "WORKSPACE_ADMIN" &&
          (input.newStatus === "DEACTIVATED" ||
            (input.newRole && input.newRole !== "WORKSPACE_ADMIN"))
        ) {
          const adminCountResult = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(tenantMemberships)
            .where(
              and(
                eq(tenantMemberships.tenantId, input.tenantId),
                eq(tenantMemberships.role, "WORKSPACE_ADMIN"),
                eq(tenantMemberships.status, "ACTIVE")
              )
            );

          const activeAdminCount = adminCountResult[0]?.count ?? 0;
          if (activeAdminCount <= 1 && target.status === "ACTIVE") {
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message: "Cannot demote or deactivate the last remaining active WORKSPACE_ADMIN",
                status: 400,
              },
            };
          }
        }

        // Quota evaluation (DEC-01)
        const resultingRole = input.newRole ?? target.role;
        const resultingStatus = input.newStatus ?? target.status;

        const isActivating =
          target.status === "DEACTIVATED" && resultingStatus === "ACTIVE";
        const isChangingRoleTier =
          target.status !== "DEACTIVATED" &&
          input.newRole &&
          isCreatorSeatRole(target.role) !== isCreatorSeatRole(resultingRole);

        if (isActivating || isChangingRoleTier) {
          const targetTierRole = resultingRole;
          const quota = await checkSeatQuota(tx, input.tenantId, targetTierRole);

          if (!quota.allowed) {
            return {
              success: false,
              error: {
                code: "SEAT_QUOTA_EXCEEDED",
                message: `Workspace has exceeded its ${
                  quota.tier === "CREATOR" ? "Creator Seat" : "Reader Pack"
                } quota (${quota.currentCount}/${quota.limit}). Please upgrade your workspace tier.`,
                status: 402,
              },
            };
          }
        }

        // Update membership
        const updateValues: {
          role?: WorkspaceRole;
          status?: "ACTIVE" | "INVITED" | "DEACTIVATED";
          updatedAt: Date;
        } = {
          updatedAt: new Date(),
        };

        if (input.newRole) updateValues.role = input.newRole;
        if (input.newStatus) updateValues.status = input.newStatus;

        const [updated] = await tx
          .update(tenantMemberships)
          .set(updateValues)
          .where(eq(tenantMemberships.id, target.id))
          .returning();

        // Append audit log for modifications
        if (input.newStatus && input.newStatus !== target.status) {
          await appendAuditLog(tx, {
            tenantId: input.tenantId,
            eventType:
              input.newStatus === "DEACTIVATED"
                ? "USER_DEACTIVATED"
                : "USER_REACTIVATED",
            entityType: "TENANT_MEMBERSHIP",
            entityId: target.id,
            actorUserId: actor.userId,
            actorRole: actor.role,
            payloadJson: {
              targetUserId: target.userId,
              previousStatus: target.status,
              newStatus: input.newStatus,
              justification: input.justification ?? null,
            },
          });
        }

        if (input.newRole && input.newRole !== target.role) {
          await appendAuditLog(tx, {
            tenantId: input.tenantId,
            eventType: "USER_ROLE_UPDATED",
            entityType: "TENANT_MEMBERSHIP",
            entityId: target.id,
            actorUserId: actor.userId,
            actorRole: actor.role,
            payloadJson: {
              targetUserId: target.userId,
              previousRole: target.role,
              newRole: input.newRole,
            },
          });
        }

        return {
          success: true,
          data: {
            membershipId: updated.id,
            role: updated.role,
            status: updated.status,
          },
        };
      },
      dbClient
    );
  } catch (err) {
    if (err instanceof DomainError) {
      return {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          status: err.httpStatus,
        },
      };
    }
    return internalActionError(
      "updateMemberRoleOrStatusAction",
      err,
      "Failed to update member",
      callerUserId
    );
  }
}

// ============================================================================
// Action 3: Update Workspace Governance Settings (DEC-03, BR-APP-01)
// ============================================================================

const updateWorkspaceGovernanceSettingsSchema = z.object({
  tenantId: z.string().uuid(),
  allowSingleAuthorOverride: z.boolean(),
});

export type UpdateWorkspaceGovernanceSettingsInput = z.infer<
  typeof updateWorkspaceGovernanceSettingsSchema
>;

export async function updateWorkspaceGovernanceSettingsAction(
  rawInput: unknown,
  context?: ActionCallerContext
): Promise<
  ActionResult<{
    tenantId: string;
    allowSingleAuthorOverride: boolean;
  }>
> {
  const parsed = updateWorkspaceGovernanceSettingsSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid governance settings payload",
        status: 400,
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const input = parsed.data;
  const callerUserId = await resolveCallerUserId(context);
  if (!callerUserId) {
    return {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required to perform this action",
        status: 401,
      },
    };
  }

  const dbClient = resolveServerActionDb(context);

  try {
    return await withTenantContext(
      input.tenantId,
      async (tx) => {
        // Authorize actor: must be active WORKSPACE_ADMIN
        const actor = await assertWorkspaceAdmin(tx, input.tenantId, callerUserId);

        const [tenant] = await tx
          .select({
            id: tenants.id,
            allowSingleAuthorOverride: tenants.allowSingleAuthorOverride,
          })
          .from(tenants)
          .where(eq(tenants.id, input.tenantId))
          .limit(1);

        if (!tenant) {
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Tenant not found",
              status: 404,
            },
          };
        }

        const previousValue = tenant.allowSingleAuthorOverride;

        await tx
          .update(tenants)
          .set({
            allowSingleAuthorOverride: input.allowSingleAuthorOverride,
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, input.tenantId));

        // Append audit log
        await appendAuditLog(tx, {
          tenantId: input.tenantId,
          eventType: "WORKSPACE_SETTING_UPDATED",
          entityType: "TENANT",
          entityId: input.tenantId,
          actorUserId: actor.userId,
          actorRole: actor.role,
          payloadJson: {
            setting: "allow_single_author_override",
            previousValue,
            newValue: input.allowSingleAuthorOverride,
          },
        });

        return {
          success: true,
          data: {
            tenantId: input.tenantId,
            allowSingleAuthorOverride: input.allowSingleAuthorOverride,
          },
        };
      },
      dbClient
    );
  } catch (err) {
    if (err instanceof DomainError) {
      return {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          status: err.httpStatus,
        },
      };
    }
    return internalActionError(
      "updateWorkspaceGovernanceSettingsAction",
      err,
      "Failed to update governance settings",
      callerUserId
    );
  }
}

// ============================================================================
// Action 4: Manage Audience Groups
// ============================================================================

const manageAudienceGroupSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("CREATE_GROUP"),
    tenantId: z.string().uuid(),
    name: z.string().min(1).max(100),
    groupType: z.enum(["DEPARTMENT", "SITE_LOCATION", "JOB_ROLE", "CUSTOM"]),
  }),
  z.object({
    operation: z.literal("UPDATE_GROUP"),
    tenantId: z.string().uuid(),
    groupId: z.string().uuid(),
    name: z.string().min(1).max(100),
  }),
  z.object({
    operation: z.literal("DELETE_GROUP"),
    tenantId: z.string().uuid(),
    groupId: z.string().uuid(),
  }),
  z.object({
    operation: z.literal("ASSIGN_MEMBERS"),
    tenantId: z.string().uuid(),
    groupId: z.string().uuid(),
    userIds: z.array(z.string().uuid()),
  }),
]);

export type ManageAudienceGroupInput = z.infer<typeof manageAudienceGroupSchema>;

export async function manageAudienceGroupAction(
  rawInput: unknown,
  context?: ActionCallerContext
): Promise<ActionResult<{ operation: string; groupId?: string; memberCount?: number }>> {
  const parsed = manageAudienceGroupSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid audience group operation payload",
        status: 400,
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const input = parsed.data;
  const callerUserId = await resolveCallerUserId(context);
  if (!callerUserId) {
    return {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required to perform this action",
        status: 401,
      },
    };
  }

  const dbClient = resolveServerActionDb(context);

  try {
    return await withTenantContext(
      input.tenantId,
      async (tx) => {
        // Authorize actor: must be active WORKSPACE_ADMIN
        const actor = await assertWorkspaceAdmin(tx, input.tenantId, callerUserId);

        switch (input.operation) {
          case "CREATE_GROUP": {
            const [created] = await tx
              .insert(audienceGroups)
              .values({
                tenantId: input.tenantId,
                name: input.name,
                groupType: input.groupType,
              })
              .returning({ id: audienceGroups.id });

            await appendAuditLog(tx, {
              tenantId: input.tenantId,
              eventType: "AUDIENCE_GROUP_CREATED",
              entityType: "AUDIENCE_GROUP",
              entityId: created.id,
              actorUserId: actor.userId,
              actorRole: actor.role,
              payloadJson: {
                name: input.name,
                groupType: input.groupType,
              },
            });

            return {
              success: true,
              data: {
                operation: "CREATE_GROUP",
                groupId: created.id,
              },
            };
          }

          case "UPDATE_GROUP": {
            const [updated] = await tx
              .update(audienceGroups)
              .set({
                name: input.name,
              })
              .where(
                and(
                  eq(audienceGroups.id, input.groupId),
                  eq(audienceGroups.tenantId, input.tenantId)
                )
              )
              .returning({ id: audienceGroups.id });

            if (!updated) {
              return {
                success: false,
                error: {
                  code: "NOT_FOUND",
                  message: "Audience group not found",
                  status: 404,
                },
              };
            }

            await appendAuditLog(tx, {
              tenantId: input.tenantId,
              eventType: "AUDIENCE_GROUP_UPDATED",
              entityType: "AUDIENCE_GROUP",
              entityId: updated.id,
              actorUserId: actor.userId,
              actorRole: actor.role,
              payloadJson: {
                name: input.name,
              },
            });

            return {
              success: true,
              data: {
                operation: "UPDATE_GROUP",
                groupId: updated.id,
              },
            };
          }

          case "DELETE_GROUP": {
            const [deleted] = await tx
              .delete(audienceGroups)
              .where(
                and(
                  eq(audienceGroups.id, input.groupId),
                  eq(audienceGroups.tenantId, input.tenantId)
                )
              )
              .returning({ id: audienceGroups.id });

            if (!deleted) {
              return {
                success: false,
                error: {
                  code: "NOT_FOUND",
                  message: "Audience group not found",
                  status: 404,
                },
              };
            }

            await appendAuditLog(tx, {
              tenantId: input.tenantId,
              eventType: "AUDIENCE_GROUP_DELETED",
              entityType: "AUDIENCE_GROUP",
              entityId: deleted.id,
              actorUserId: actor.userId,
              actorRole: actor.role,
              payloadJson: {
                groupId: input.groupId,
              },
            });

            return {
              success: true,
              data: {
                operation: "DELETE_GROUP",
                groupId: deleted.id,
              },
            };
          }

          case "ASSIGN_MEMBERS": {
            // Verify group belongs to tenant
            const [grp] = await tx
              .select({ id: audienceGroups.id })
              .from(audienceGroups)
              .where(
                and(
                  eq(audienceGroups.id, input.groupId),
                  eq(audienceGroups.tenantId, input.tenantId)
                )
              )
              .limit(1);

            if (!grp) {
              return {
                success: false,
                error: {
                  code: "NOT_FOUND",
                  message: "Audience group not found",
                  status: 404,
                },
              };
            }

            // Remove existing member assignments for this group
            await tx
              .delete(audienceGroupMembers)
              .where(
                and(
                  eq(audienceGroupMembers.tenantId, input.tenantId),
                  eq(audienceGroupMembers.groupId, input.groupId)
                )
              );

            // Assign new members (only those who have active membership in tenant)
            let assignedCount = 0;
            for (const uid of input.userIds) {
              const mem = await assertActiveMembership(tx, input.tenantId, uid).catch(
                () => null
              );
              if (mem) {
                await tx
                  .insert(audienceGroupMembers)
                  .values({
                    tenantId: input.tenantId,
                    groupId: input.groupId,
                    userId: uid,
                  })
                  .onConflictDoNothing();
                assignedCount++;
              }
            }

            await appendAuditLog(tx, {
              tenantId: input.tenantId,
              eventType: "AUDIENCE_GROUP_MEMBERS_ASSIGNED",
              entityType: "AUDIENCE_GROUP",
              entityId: input.groupId,
              actorUserId: actor.userId,
              actorRole: actor.role,
              payloadJson: {
                groupId: input.groupId,
                assignedMemberCount: assignedCount,
                assignedUserIds: input.userIds,
              },
            });

            return {
              success: true,
              data: {
                operation: "ASSIGN_MEMBERS",
                groupId: input.groupId,
                memberCount: assignedCount,
              },
            };
          }
        }
      },
      dbClient
    );
  } catch (err) {
    if (err instanceof DomainError) {
      return {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          status: err.httpStatus,
        },
      };
    }
    return internalActionError(
      "manageAudienceGroupAction",
      err,
      "Failed to execute audience group operation",
      callerUserId
    );
  }
}

// ============================================================================
// Query Action: Get Workspace Settings Data
// ============================================================================

export type { WorkspaceSettingsData };

export async function getWorkspaceSettingsDataAction(
  tenantId: string,
  context?: ActionCallerContext
): Promise<ActionResult<WorkspaceSettingsData>> {
  if (!tenantId || !isValidUuid(tenantId)) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Valid workspace tenant ID is required",
        status: 400,
      },
    };
  }

  const callerUserId = await resolveCallerUserId(context);
  if (!callerUserId) {
    return {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required to view workspace settings",
        status: 401,
      },
    };
  }

  const dbClient = resolveServerActionDb(context);

  try {
    return await withTenantContext(
      tenantId,
      async (tx) => {
        // Authorize actor: must be active WORKSPACE_ADMIN
        await assertWorkspaceAdmin(tx, tenantId, callerUserId);

        const data = await getWorkspaceSettingsDataInTx(tx, tenantId);
        if (!data) {
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Workspace tenant not found",
              status: 404,
            },
          };
        }

        return {
          success: true,
          data,
        };
      },
      dbClient
    );
  } catch (err) {
    if (err instanceof DomainError) {
      return {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          status: err.httpStatus,
        },
      };
    }
    return internalActionError(
      "getWorkspaceSettingsDataAction",
      err,
      "Failed to load workspace settings data",
      callerUserId
    );
  }
}
