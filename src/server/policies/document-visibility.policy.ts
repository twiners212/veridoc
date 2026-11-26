import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { documentVersions } from "@/db/schema";
import { DomainError } from "@/types/errors";
import type {
  ActiveMembership,
  DocumentLifecycleState,
  PolicyResult,
  WorkspaceRole,
} from "./rbac.types";

/**
 * Evaluates whether an active member can view a specific document version based on its lifecycle state.
 */
export function canViewDocumentVersion(
  actor: ActiveMembership,
  version: {
    authorId: string;
    lifecycleState: DocumentLifecycleState;
    assignedApproverIds?: string[];
  }
): boolean {
  // 1. Published SOPs are globally visible to all active workspace roles
  if (version.lifecycleState === "PUBLISHED") {
    return true;
  }

  // 2. Admins and Quality Managers have unrestricted visibility across all states
  if (actor.role === "WORKSPACE_ADMIN" || actor.role === "QUALITY_MANAGER") {
    return true;
  }

  // 3. Authors can view their own document versions in any pre-published state
  if (actor.role === "DOCUMENT_AUTHOR") {
    if (version.authorId === actor.userId) {
      return version.lifecycleState !== "RETIRED";
    }
    return false;
  }

  // 4. Approvers can view PENDING_APPROVAL and APPROVED if assigned as approvers
  if (actor.role === "APPROVER_REVIEWER") {
    if (
      version.lifecycleState === "PENDING_APPROVAL" ||
      version.lifecycleState === "APPROVED" ||
      version.lifecycleState === "SUPERSEDED"
    ) {
      if (version.assignedApproverIds && version.assignedApproverIds.includes(actor.userId)) {
        return true;
      }
    }
    return false;
  }

  // 5. Readers can ONLY view PUBLISHED documents
  if (actor.role === "READER") {
    return false;
  }

  return false;
}

/**
 * Asserts document version visibility.
 * Implements anti-enumeration: Readers probing unpublished documents receive 404 NOT_FOUND.
 */
export function assertCanViewDocumentVersion(
  actor: ActiveMembership,
  version: {
    authorId: string;
    lifecycleState: DocumentLifecycleState;
    assignedApproverIds?: string[];
  }
): void {
  const allowed = canViewDocumentVersion(actor, version);
  if (!allowed) {
    if (actor.role === "READER") {
      // Anti-enumeration for readers
      throw new DomainError("NOT_FOUND", "Document not found", 404);
    }
    throw new DomainError(
      "FORBIDDEN",
      "Insufficient permissions to view this document version in its current lifecycle state",
      403
    );
  }
}

/**
 * Evaluates whether an actor can edit a document version.
 */
export function canEditDocumentVersion(
  actor: ActiveMembership,
  version: {
    authorId: string;
    lifecycleState: DocumentLifecycleState;
  }
): PolicyResult {
  // Immutable states cannot be edited by any role
  if (
    version.lifecycleState === "APPROVED" ||
    version.lifecycleState === "PUBLISHED" ||
    version.lifecycleState === "SUPERSEDED" ||
    version.lifecycleState === "RETIRED"
  ) {
    return {
      allowed: false,
      reason: `Version is immutable in state '${version.lifecycleState}' (BR-VER-02)`,
      errorCode: "VERSION_IMMUTABLE",
    };
  }

  // Readers and Approvers cannot edit documents
  if (actor.role === "READER" || actor.role === "APPROVER_REVIEWER") {
    return {
      allowed: false,
      reason: "User role is not authorized to edit documents",
      errorCode: "FORBIDDEN",
    };
  }

  // Authors can only edit own documents
  if (actor.role === "DOCUMENT_AUTHOR") {
    if (version.authorId !== actor.userId) {
      return {
        allowed: false,
        reason: "Document Authors can only edit document versions they authored",
        errorCode: "FORBIDDEN",
      };
    }
  }

  return { allowed: true };
}

export function assertCanEditDocumentVersion(
  actor: ActiveMembership,
  version: {
    authorId: string;
    lifecycleState: DocumentLifecycleState;
  }
): void {
  const result = canEditDocumentVersion(actor, version);
  if (!result.allowed) {
    throw new DomainError(
      result.errorCode ?? "FORBIDDEN",
      result.reason ?? "Editing not permitted",
      result.errorCode === "VERSION_IMMUTABLE" ? 409 : 403
    );
  }
}

/**
 * Generates SQL WHERE condition for document version queries based on the user's role.
 * Used by Route Handlers and Server Components for safe list filtering.
 */
export function buildLifecycleFilterForRole(
  role: WorkspaceRole,
  userId: string
): SQL {
  switch (role) {
    case "WORKSPACE_ADMIN":
    case "QUALITY_MANAGER":
      return sql`1 = 1`;

    case "DOCUMENT_AUTHOR":
      return sql`(${documentVersions.lifecycleState} = 'PUBLISHED' OR (${documentVersions.authorId} = ${userId} AND ${documentVersions.lifecycleState} != 'RETIRED'))`;

    case "APPROVER_REVIEWER":
      return sql`(${documentVersions.lifecycleState} = 'PUBLISHED' OR (${documentVersions.lifecycleState} IN ('PENDING_APPROVAL', 'APPROVED') AND EXISTS (
        SELECT 1 FROM veridoc.approval_cycles ac
        JOIN veridoc.approval_steps ast ON ast.approval_cycle_id = ac.id
        WHERE ac.document_version_id = ${documentVersions.id}
        AND ast.assigned_approver_id = ${userId}
      )))`;

    case "READER":
    default:
      return sql`${documentVersions.lifecycleState} = 'PUBLISHED'`;
  }
}
