import type { DocumentLifecycleState, ContentFormat } from "./documents";
import type { WorkspaceRole } from "./roles";

export type ReadAssignmentStatus =
  | "PENDING"
  | "COMPLETED"
  | "EXPIRED_SUPERSEDED";

export interface PublishDocumentVersionInput {
  tenantId?: string;
  versionId: string;
  expectedRowVersion?: number;
  targetGroupIds: string[];
  acknowledgmentDueDays?: number;
  effectiveDate?: string | Date;
}

export interface PublishDocumentVersionResult {
  versionId: string;
  documentId: string;
  lifecycleState: DocumentLifecycleState;
  publishedAt: string;
  effectiveDate: string;
  supersededVersionId?: string | null;
  assignedCount: number;
}

export interface RetireDocumentVersionInput {
  tenantId?: string;
  versionId: string;
  expectedRowVersion?: number;
  reason: string;
}

export interface RetireDocumentVersionResult {
  versionId: string;
  documentId: string;
  lifecycleState: DocumentLifecycleState;
  retiredAt: string;
}

export interface AcknowledgeDocumentInput {
  tenantId?: string;
  readAssignmentId: string;
  documentVersionId: string;
  dwellTimeSeconds: number;
  maxScrollPercent: number;
  bindingConfirmation: boolean;
  expectedDocumentSha256?: string;
}

export interface AcknowledgeDocumentResult {
  acknowledgmentId: string;
  readAssignmentId: string;
  documentVersionId: string;
  documentSha256: string;
  acknowledgedAt: string;
  dwellTimeSeconds: number;
  maxScrollPercent: number;
  userId: string;
}

export interface ReadQueueQueryInput {
  tenantId?: string;
  status?: "PENDING" | "COMPLETED";
  page?: number;
  limit?: number;
}

export interface ReadQueueItem {
  id: string; // alias for assignmentId
  assignmentId: string;
  documentId: string;
  documentVersionId: string; // alias for versionId
  versionId: string;
  versionLabel: string;
  version: string; // alias for versionLabel
  documentCode: string;
  title: string;
  category: string | null;
  contentFormat: ContentFormat;
  markdownContent?: string | null;
  fileStorageKey?: string | null;
  documentSha256: string;
  effectiveDate?: string | null;
  status: ReadAssignmentStatus;
  dueAt: string;
  createdAt: string;
  isOverdue: boolean;
  daysUntilDue: number;
  assignedViaGroupId?: string | null;
  groupName?: string | null;
  targetGroupName?: string | null;
  acknowledgedAt?: string | null;
  acknowledgmentId?: string | null;
  acknowledgment?: {
    id: string;
    acknowledgedAt: string;
    dwellTimeSeconds: number;
    maxScrollPercent: number;
    documentSha256: string;
  } | null;
}

export interface ReadQueueResponse {
  items: ReadQueueItem[];
  assignments: ReadQueueItem[]; // alias for items
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DashboardCompletionQueryInput {
  tenantId?: string;
  documentId?: string;
  groupId?: string;
  overdueOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface DashboardKPIs {
  activeSops: number;
  publishedActiveSops: number;
  publishedTrend?: string;
  pendingApprovals: number;
  pendingApprovalsBlockedCount: number;
  acknowledgmentRatePercent: number;
  readAcknowledgmentRate: number;
  acknowledgedCount: number;
  totalAssignedCount: number;
  overdueAcknowledgments: number;
  overdueGroupsCount?: number;
}

export interface RolloutBreakdownItem {
  documentId: string;
  versionId: string;
  documentCode: string;
  title: string;
  versionLabel: string;
  lifecycleState: DocumentLifecycleState;
  effectiveDate: string | null;
  publishedAt: string | null;
  targetAudienceGroups: string[];
  targetAudienceGroupNames: string[];
  totalAssigned: number;
  totalAssignedCount: number;
  totalAcknowledged: number;
  acknowledgedCount: number;
  totalPending: number;
  totalOverdue: number;
  overdueCount: number;
  completionRatePercent: number;
  completionPercent: number;
  status: "COMPLETED" | "OVERDUE" | "ON_TRACK";
  earliestDueAt: string | null;
  latestDueAt: string | null;
  dueDate: string;
  documentSha256?: string | null;
  facilityLocation?: string | null;
}

export interface GovernanceDashboardData {
  kpis: DashboardKPIs;
  rollouts: RolloutBreakdownItem[];
  events?: Array<{
    id: string;
    eventType: string;
    actorName: string;
    actorRole?: string;
    documentCode: string;
    versionLabel: string;
    description?: string;
    documentSha256?: string;
    timestamp: string | Date;
  }>;
  tenantName?: string;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type GovernanceDashboardResponse =
  | { success: true; data: GovernanceDashboardData }
  | { success: false; error: { code: string; message: string; details?: unknown } };
