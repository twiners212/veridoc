"use server";

import { cache } from "react";
import { isValidUuid, withTenantContext } from "@/db/context";
import { isDemoLoginEnabled } from "@/lib/auth/demo-accounts";
import {
  getCachedSession,
  getUserWorkspaces,
  type UserWorkspaceSummary,
} from "@/lib/auth/server";
import { getWorkspaceContextSnapshot } from "@/server/services/workspace.service";
import type { WorkspaceRole } from "@/types/roles";

export interface AuthenticatedWorkspaceContext {
  userId: string;
  userName: string;
  userEmail: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: WorkspaceRole;
  allowSingleAuthorOverride: boolean;
  creatorCount: number;
  creatorLimit: number;
  readerCount: number;
  readerLimit: number;
  pendingApprovalsCount: number;
  pendingToReadCount: number;
  demoLoginEnabled: boolean;
  workspaces: UserWorkspaceSummary[];
}

const getAuthenticatedWorkspaceContextCached = cache(
  async (): Promise<AuthenticatedWorkspaceContext | null> => {
    const session = await getCachedSession();
    if (!session?.user?.id) {
      return null;
    }

    const userId = session.user.id;
    const rawActiveTenantId = (session.session as Record<string, unknown>)
      ?.activeTenantId;
    const preferredTenantId =
      typeof rawActiveTenantId === "string" &&
      isValidUuid(rawActiveTenantId.trim())
        ? rawActiveTenantId.trim()
        : null;

    const loadForTenant = async (
      targetTenantId: string,
      workspacesList?: UserWorkspaceSummary[]
    ): Promise<AuthenticatedWorkspaceContext | null> => {
      try {
        return await withTenantContext(
          targetTenantId,
          async (tx, tenantId) => {
            const snapshot = await getWorkspaceContextSnapshot(
              tx,
              tenantId,
              userId
            );
            if (!snapshot) {
              return null;
            }

            return {
              userId,
              userName: session.user.name || session.user.email,
              userEmail: session.user.email,
              tenantId: snapshot.tenantId,
              tenantName: snapshot.tenantName,
              tenantSlug: snapshot.tenantSlug,
              role: snapshot.role,
              allowSingleAuthorOverride: snapshot.allowSingleAuthorOverride,
              creatorCount: snapshot.creatorCount,
              creatorLimit: snapshot.creatorSeatLimit,
              readerCount: snapshot.readerCount,
              readerLimit: snapshot.readerPackLimit,
              pendingApprovalsCount: snapshot.pendingApprovalsCount,
              pendingToReadCount: snapshot.pendingToReadCount,
              demoLoginEnabled: isDemoLoginEnabled(),
              workspaces: workspacesList ?? [
                {
                  tenantId: snapshot.tenantId,
                  tenantName: snapshot.tenantName,
                  tenantSlug: snapshot.tenantSlug,
                  role: snapshot.role,
                  status: "ACTIVE",
                },
              ],
            };
          }
        );
      } catch {
        return null;
      }
    };

    if (preferredTenantId) {
      const direct = await loadForTenant(preferredTenantId);
      if (direct) {
        return direct;
      }
    }

    const workspaces = await getUserWorkspaces(userId);
    if (workspaces.length === 0) {
      return null;
    }

    const fallbackWorkspace = workspaces[0];
    if (fallbackWorkspace.tenantId === preferredTenantId) {
      return null;
    }

    return await loadForTenant(fallbackWorkspace.tenantId, workspaces);
  }
);

export async function getAuthenticatedWorkspaceContext(): Promise<AuthenticatedWorkspaceContext | null> {
  return await getAuthenticatedWorkspaceContextCached();
}
