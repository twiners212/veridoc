import "server-only";
import { DomainError } from "@/types/errors";
import type {
  ActiveMembership,
  ApprovalStepStatus,
  MembershipStatus,
  PolicyResult,
} from "./rbac.types";

/**
 * Validates whether an actor can approve a specific document version.
 * Enforces Separation of Duties (DEC-03, BR-APP-01).
 */
export function canApproveDocumentVersion(
  actor: ActiveMembership,
  versionAuthorId: string,
  options?: { allowSingleAuthorOverride?: boolean }
): PolicyResult {
  // 1. Separation of duties / self-approval prevention (DEC-03, BR-APP-01)
  if (actor.userId === versionAuthorId) {
    if (options?.allowSingleAuthorOverride === true) {
      return {
        allowed: true,
        reason: "Self-approval permitted via tenant single-author override",
      };
    }
    return {
      allowed: false,
      reason:
        "Self-approval is prohibited: author cannot approve their own document version (DEC-03, BR-APP-01)",
      errorCode: "SELF_APPROVAL_PROHIBITED",
    };
  }

  // 2. Role capability check for non-author approvers
  const isApprovalRole =
    actor.role === "WORKSPACE_ADMIN" ||
    actor.role === "QUALITY_MANAGER" ||
    actor.role === "APPROVER_REVIEWER";

  if (!isApprovalRole) {
    return {
      allowed: false,
      reason: "User role is not authorized to execute document approvals",
      errorCode: "FORBIDDEN",
    };
  }

  return { allowed: true };
}

export function assertCanApproveDocumentVersion(
  actor: ActiveMembership,
  versionAuthorId: string,
  options?: { allowSingleAuthorOverride?: boolean }
): void {
  const result = canApproveDocumentVersion(actor, versionAuthorId, options);
  if (!result.allowed) {
    throw new DomainError(
      result.errorCode ?? "FORBIDDEN",
      result.reason ?? "Approval sign-off not authorized",
      403
    );
  }
}

/**
 * Validates approver configuration upon workflow submission.
 * Enforces BR-APP-01 so an author cannot submit a workflow assigning themselves as approver
 * unless single-author override is explicitly enabled on the tenant.
 */
export function canSubmitWorkflowApprovers(
  authorUserId: string,
  approverUserIds: string[],
  options?: { allowSingleAuthorOverride?: boolean }
): PolicyResult {
  if (approverUserIds.length === 0) {
    return {
      allowed: false,
      reason: "Workflow must have at least one approver",
      errorCode: "VALIDATION_ERROR",
    };
  }

  if (approverUserIds.includes(authorUserId)) {
    if (!options?.allowSingleAuthorOverride) {
      return {
        allowed: false,
        reason:
          "Workflow cannot assign document author as approver unless single-author override is enabled (DEC-03, BR-APP-01)",
        errorCode: "SELF_APPROVAL_PROHIBITED",
      };
    }
  }

  return { allowed: true };
}

export function assertCanSubmitWorkflowApprovers(
  authorUserId: string,
  approverUserIds: string[],
  options?: { allowSingleAuthorOverride?: boolean }
): void {
  const result = canSubmitWorkflowApprovers(authorUserId, approverUserIds, options);
  if (!result.allowed) {
    throw new DomainError(
      result.errorCode ?? "FORBIDDEN",
      result.reason ?? "Invalid workflow approver configuration",
      result.errorCode === "SELF_APPROVAL_PROHIBITED" ? 403 : 400
    );
  }
}

/**
 * Validates Workspace Admin Approver Override (BR-APP-04).
 * WORKSPACE_ADMIN can step in to act as approver when an assigned approver is deactivated or unavailable,
 * provided they are not the author (unless override enabled).
 */
export function canAdminOverrideApprover(
  actor: ActiveMembership,
  targetStep: { assignedApproverId: string; status: ApprovalStepStatus },
  targetApproverMembership: { status: MembershipStatus } | null,
  versionAuthorId: string,
  options?: { allowSingleAuthorOverride?: boolean }
): PolicyResult {
  // 1. Must be WORKSPACE_ADMIN
  if (actor.role !== "WORKSPACE_ADMIN") {
    return {
      allowed: false,
      reason: "Only WORKSPACE_ADMIN can execute approver override (BR-APP-04)",
      errorCode: "FORBIDDEN",
    };
  }

  // 2. Target step must be in PENDING status
  if (targetStep.status !== "PENDING") {
    return {
      allowed: false,
      reason: "Can only execute override on an approval step currently in PENDING status",
      errorCode: "APPROVAL_STEP_NOT_ACTIVE",
    };
  }

  // 3. Separation of duties check for Admin
  if (actor.userId === versionAuthorId) {
    if (!options?.allowSingleAuthorOverride) {
      return {
        allowed: false,
        reason:
          "Workspace Admin cannot override to approve a document they authored without single-author override enabled (DEC-03, BR-APP-01)",
        errorCode: "SELF_APPROVAL_PROHIBITED",
      };
    }
  }

  return { allowed: true };
}

export function assertCanAdminOverrideApprover(
  actor: ActiveMembership,
  targetStep: { assignedApproverId: string; status: ApprovalStepStatus },
  targetApproverMembership: { status: MembershipStatus } | null,
  versionAuthorId: string,
  options?: { allowSingleAuthorOverride?: boolean }
): void {
  const result = canAdminOverrideApprover(
    actor,
    targetStep,
    targetApproverMembership,
    versionAuthorId,
    options
  );
  if (!result.allowed) {
    throw new DomainError(
      result.errorCode ?? "FORBIDDEN",
      result.reason ?? "Admin approver override not permitted",
      result.errorCode === "SELF_APPROVAL_PROHIBITED"
        ? 403
        : result.errorCode === "APPROVAL_STEP_NOT_ACTIVE"
        ? 409
        : 403
    );
  }
}

/**
 * Validates step reassignment by Workspace Admin (adminOverrideApproverAction).
 */
export function canAdminReassignStep(
  actor: ActiveMembership,
  newApprover: ActiveMembership,
  versionAuthorId: string,
  options?: { allowSingleAuthorOverride?: boolean }
): PolicyResult {
  if (actor.role !== "WORKSPACE_ADMIN") {
    return {
      allowed: false,
      reason: "Only WORKSPACE_ADMIN can reassign approval steps (BR-APP-04)",
      errorCode: "FORBIDDEN",
    };
  }

  const isEligibleRole =
    newApprover.role === "WORKSPACE_ADMIN" ||
    newApprover.role === "QUALITY_MANAGER" ||
    newApprover.role === "APPROVER_REVIEWER";

  if (!isEligibleRole) {
    return {
      allowed: false,
      reason: "New approver must hold an approval-capable role",
      errorCode: "FORBIDDEN",
    };
  }

  if (newApprover.userId === versionAuthorId) {
    if (!options?.allowSingleAuthorOverride) {
      return {
        allowed: false,
        reason:
          "Cannot reassign approval step to the document author (DEC-03, BR-APP-01)",
        errorCode: "SELF_APPROVAL_PROHIBITED",
      };
    }
  }

  return { allowed: true };
}

export function assertCanAdminReassignStep(
  actor: ActiveMembership,
  newApprover: ActiveMembership,
  versionAuthorId: string,
  options?: { allowSingleAuthorOverride?: boolean }
): void {
  const result = canAdminReassignStep(actor, newApprover, versionAuthorId, options);
  if (!result.allowed) {
    throw new DomainError(
      result.errorCode ?? "FORBIDDEN",
      result.reason ?? "Cannot reassign approval step",
      result.errorCode === "SELF_APPROVAL_PROHIBITED" ? 403 : 403
    );
  }
}
