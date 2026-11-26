export type ContentFormat = "MARKDOWN" | "PDF";

export type ReadAssignmentStatus = "PENDING" | "COMPLETED" | "EXPIRED_SUPERSEDED";

export interface ReadAssignmentItem {
  id: string; // read_assignment_id
  documentId: string;
  documentVersionId: string;
  documentCode: string;
  title: string;
  version: string;
  category: string | null;
  targetGroupName?: string | null;
  contentFormat: ContentFormat;
  documentSha256: string;
  dueAt: string;
  isOverdue: boolean;
  daysUntilDue: number;
  status: ReadAssignmentStatus;
  estimatedMinutes?: number;
  wordCount?: number;
  effectiveDate?: string | null;
  acknowledgedAt?: string | null;
  acknowledgmentId?: string | null;
  markdownContent?: string | null;
  fileStorageKey?: string | null;
}

export interface AcknowledgeDocumentPayload {
  readAssignmentId: string;
  documentVersionId: string;
  dwellTimeSeconds: number;
  maxScrollPercent: number;
  bindingConfirmation: true;
  expectedDocumentSha256?: string;
}

export interface AcknowledgmentReceipt {
  acknowledgmentId: string;
  documentVersionId: string;
  documentCode: string;
  title: string;
  version: string;
  documentSha256: string;
  userId: string;
  userName: string;
  userRole?: string;
  acknowledgedAt: string; // UTC ISO string
  dwellTimeSeconds: number;
  maxScrollPercent: number;
}
