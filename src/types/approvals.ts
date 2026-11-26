import type { WorkspaceRole, MembershipStatus, ApprovalStepStatus } from "./roles";
import type { DocumentLifecycleState, ContentFormat } from "./documents";

export interface ApprovalQueueStepItem {
  id: string;
  stepOrder: number;
  status: ApprovalStepStatus;
  assignedApproverId: string;
  assignedApproverName: string;
  assignedApproverRole?: WorkspaceRole | null;
  assignedApproverEmail?: string | null;
  isBlockedInactiveApprover: boolean;
  overriddenFromApproverId?: string | null;
  actedByUserId?: string | null;
  actedByFullName?: string | null;
  actedByRole?: WorkspaceRole | null;
  actedAt?: string | null;
  signedDocumentSha256?: string | null;
  decisionIntent?: string | null;
}

export interface ApprovalQueueItem {
  stepId: string;
  stepOrder: number;
  totalSteps: number;
  stepStatus: ApprovalStepStatus;
  assignedApproverId: string;
  assignedApproverName: string;
  assignedApproverRole?: WorkspaceRole | null;
  assignedApproverEmail?: string | null;
  isBlockedInactiveApprover: boolean;
  isAssignedToCurrentUser: boolean;
  canApprove: boolean;
  canAdminOverride: boolean;
  cycleId: string;
  cycleNumber: number;
  cycleStatus: string;
  submittedAt: string;
  submittedByUserId: string;
  submittedByName: string;
  submittedSha256: string;
  documentId: string;
  documentCode: string;
  documentTitle: string;
  category: string | null;
  versionId: string;
  versionLabel: string;
  versionMajor: number;
  versionMinor: number;
  contentFormat: ContentFormat;
  lifecycleState: DocumentLifecycleState;
  documentSha256: string | null;
  authorId: string;
  authorName: string;
  markdownContent: string | null;
  fileStorageKey: string | null;
  fileSizeBytes: number | null;
  rowVersion: number;
  updatedAt: string;
  stepsInCycle: ApprovalQueueStepItem[];
}

export interface ApprovalQueuePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApprovalQueueResponseData {
  items: ApprovalQueueItem[];
  pagination: ApprovalQueuePagination;
}

export interface ApprovalQueueResponse {
  success: boolean;
  data: ApprovalQueueResponseData;
}
