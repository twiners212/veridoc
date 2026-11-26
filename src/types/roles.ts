export type WorkspaceRole =
  | "WORKSPACE_ADMIN"
  | "QUALITY_MANAGER"
  | "DOCUMENT_AUTHOR"
  | "APPROVER_REVIEWER"
  | "READER";

export type MembershipStatus = "ACTIVE" | "INVITED" | "DEACTIVATED";

export type DocumentLifecycleState =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "PUBLISHED"
  | "SUPERSEDED"
  | "RETIRED";

export type ApprovalStepStatus =
  | "WAITING"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "INVALIDATED"
  | "SKIPPED";
