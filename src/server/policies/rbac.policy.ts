import "server-only";
import { DomainError } from "@/types/errors";
import type {
  ActiveMembership,
  Permission,
  WorkspaceRole,
} from "./rbac.types";

const ROLE_PERMISSIONS: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  WORKSPACE_ADMIN: new Set<Permission>([
    "WORKSPACE_MANAGE_SETTINGS",
    "WORKSPACE_MANAGE_MEMBERS",
    "WORKSPACE_MANAGE_GROUPS",
    "DOCUMENT_CREATE",
    "DOCUMENT_EDIT_DRAFT",
    "DOCUMENT_SUBMIT_APPROVAL",
    "DOCUMENT_APPROVE_SIGN_OFF",
    "DOCUMENT_ADMIN_OVERRIDE",
    "DOCUMENT_PUBLISH",
    "DOCUMENT_RETIRE",
    "DOCUMENT_VIEW",
    "DOCUMENT_ACKNOWLEDGE",
    "AUDIT_VIEW_LOGS",
    "AUDIT_EXPORT_PACKET",
    "DASHBOARD_VIEW_COMPLETION",
  ]),

  QUALITY_MANAGER: new Set<Permission>([
    "DOCUMENT_CREATE",
    "DOCUMENT_EDIT_DRAFT",
    "DOCUMENT_SUBMIT_APPROVAL",
    "DOCUMENT_APPROVE_SIGN_OFF",
    "DOCUMENT_PUBLISH",
    "DOCUMENT_RETIRE",
    "DOCUMENT_VIEW",
    "DOCUMENT_ACKNOWLEDGE",
    "AUDIT_VIEW_LOGS",
    "AUDIT_EXPORT_PACKET",
    "DASHBOARD_VIEW_COMPLETION",
  ]),

  DOCUMENT_AUTHOR: new Set<Permission>([
    "DOCUMENT_CREATE",
    "DOCUMENT_EDIT_DRAFT",
    "DOCUMENT_SUBMIT_APPROVAL",
    "DOCUMENT_VIEW",
    "DOCUMENT_ACKNOWLEDGE",
  ]),

  APPROVER_REVIEWER: new Set<Permission>([
    "DOCUMENT_APPROVE_SIGN_OFF",
    "DOCUMENT_VIEW",
    "DOCUMENT_ACKNOWLEDGE",
  ]),

  READER: new Set<Permission>([
    "DOCUMENT_VIEW",
    "DOCUMENT_ACKNOWLEDGE",
  ]),
};

export function hasRolePermission(
  role: WorkspaceRole,
  permission: Permission
): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function isCreatorSeatRole(role: WorkspaceRole): boolean {
  return (
    role === "WORKSPACE_ADMIN" ||
    role === "QUALITY_MANAGER" ||
    role === "DOCUMENT_AUTHOR" ||
    role === "APPROVER_REVIEWER"
  );
}

export function isReaderPackRole(role: WorkspaceRole): boolean {
  return role === "READER";
}

// Workspace Management Policies
export function canManageMembers(actor: ActiveMembership): boolean {
  return hasRolePermission(actor.role, "WORKSPACE_MANAGE_MEMBERS");
}

export function assertCanManageMembers(actor: ActiveMembership): void {
  if (!canManageMembers(actor)) {
    throw new DomainError(
      "FORBIDDEN",
      "Only WORKSPACE_ADMIN can manage workspace members",
      403
    );
  }
}

export function canManageGovernance(actor: ActiveMembership): boolean {
  return hasRolePermission(actor.role, "WORKSPACE_MANAGE_SETTINGS");
}

export function assertCanManageGovernance(actor: ActiveMembership): void {
  if (!canManageGovernance(actor)) {
    throw new DomainError(
      "FORBIDDEN",
      "Only WORKSPACE_ADMIN can update workspace governance settings",
      403
    );
  }
}

export function canManageGroups(actor: ActiveMembership): boolean {
  return hasRolePermission(actor.role, "WORKSPACE_MANAGE_GROUPS");
}

export function assertCanManageGroups(actor: ActiveMembership): void {
  if (!canManageGroups(actor)) {
    throw new DomainError(
      "FORBIDDEN",
      "Only WORKSPACE_ADMIN can manage audience groups",
      403
    );
  }
}

// Document Authoring & Publishing Policies
export function canCreateDocument(actor: ActiveMembership): boolean {
  return hasRolePermission(actor.role, "DOCUMENT_CREATE");
}

export function assertCanCreateDocument(actor: ActiveMembership): void {
  if (!canCreateDocument(actor)) {
    throw new DomainError(
      "FORBIDDEN",
      "User role is not authorized to create documents",
      403
    );
  }
}

export function canPublishDocument(actor: ActiveMembership): boolean {
  return hasRolePermission(actor.role, "DOCUMENT_PUBLISH");
}

export function assertCanPublishDocument(actor: ActiveMembership): void {
  if (!canPublishDocument(actor)) {
    throw new DomainError(
      "FORBIDDEN",
      "Only WORKSPACE_ADMIN and QUALITY_MANAGER can publish documents",
      403
    );
  }
}

export function canRetireDocument(actor: ActiveMembership): boolean {
  return hasRolePermission(actor.role, "DOCUMENT_RETIRE");
}

export function assertCanRetireDocument(actor: ActiveMembership): void {
  if (!canRetireDocument(actor)) {
    throw new DomainError(
      "FORBIDDEN",
      "Only WORKSPACE_ADMIN and QUALITY_MANAGER can retire documents",
      403
    );
  }
}

// Audit & Dashboard Policies
export function canViewAuditLogs(actor: ActiveMembership): boolean {
  return hasRolePermission(actor.role, "AUDIT_VIEW_LOGS");
}

export function assertCanViewAuditLogs(actor: ActiveMembership): void {
  if (!canViewAuditLogs(actor)) {
    throw new DomainError(
      "FORBIDDEN",
      "Only WORKSPACE_ADMIN and QUALITY_MANAGER can view audit logs",
      403
    );
  }
}

export function canExportAuditPacket(actor: ActiveMembership): boolean {
  return hasRolePermission(actor.role, "AUDIT_EXPORT_PACKET");
}

export function assertCanExportAuditPacket(actor: ActiveMembership): void {
  if (!canExportAuditPacket(actor)) {
    throw new DomainError(
      "FORBIDDEN",
      "Only WORKSPACE_ADMIN and QUALITY_MANAGER can export audit packets",
      403
    );
  }
}

export function canViewCompletionDashboard(actor: ActiveMembership): boolean {
  return hasRolePermission(actor.role, "DASHBOARD_VIEW_COMPLETION");
}

export function assertCanViewCompletionDashboard(actor: ActiveMembership): void {
  if (!canViewCompletionDashboard(actor)) {
    throw new DomainError(
      "FORBIDDEN",
      "Only WORKSPACE_ADMIN and QUALITY_MANAGER can view completion dashboards",
      403
    );
  }
}
