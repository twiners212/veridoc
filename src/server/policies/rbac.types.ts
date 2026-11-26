import type { DomainErrorCode } from "@/types/errors";
import type {
  WorkspaceRole,
  MembershipStatus,
  DocumentLifecycleState,
  ApprovalStepStatus,
} from "@/types/roles";

export type {
  WorkspaceRole,
  MembershipStatus,
  DocumentLifecycleState,
  ApprovalStepStatus,
};

export interface ActiveMembership {
  id: string; // membership UUID
  tenantId: string;
  userId: string;
  role: WorkspaceRole;
  status: "ACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

export type Permission =
  | "WORKSPACE_MANAGE_SETTINGS"
  | "WORKSPACE_MANAGE_MEMBERS"
  | "WORKSPACE_MANAGE_GROUPS"
  | "DOCUMENT_CREATE"
  | "DOCUMENT_EDIT_DRAFT"
  | "DOCUMENT_SUBMIT_APPROVAL"
  | "DOCUMENT_APPROVE_SIGN_OFF"
  | "DOCUMENT_ADMIN_OVERRIDE"
  | "DOCUMENT_PUBLISH"
  | "DOCUMENT_RETIRE"
  | "DOCUMENT_VIEW"
  | "DOCUMENT_ACKNOWLEDGE"
  | "AUDIT_VIEW_LOGS"
  | "AUDIT_EXPORT_PACKET"
  | "DASHBOARD_VIEW_COMPLETION";

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  errorCode?: DomainErrorCode;
}

export interface TenantGovernanceSettings {
  allowSingleAuthorOverride: boolean;
}

export interface DocumentVersionTarget {
  id: string;
  tenantId: string;
  documentId: string;
  authorId: string;
  lifecycleState: DocumentLifecycleState;
  assignedApproverIds?: string[];
}

export interface ApprovalStepTarget {
  id: string;
  tenantId: string;
  approvalCycleId: string;
  stepOrder: number;
  assignedApproverId: string;
  status: ApprovalStepStatus;
  overriddenFromApproverId?: string | null;
}
