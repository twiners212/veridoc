export type DocumentLifecycleState =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "PUBLISHED"
  | "SUPERSEDED"
  | "RETIRED";

export type ContentFormat = "MARKDOWN" | "PDF";

export type ChangeType = "MINOR" | "MAJOR";

export interface CreateDocumentInput {
  tenantId?: string;
  title: string;
  documentNumber: string;
  documentCode?: string;
  category?: string | null;
  description?: string | null;
  initialContent?: string;
  targetAudienceGroupIds?: string[];
}

export interface CreateDocumentResult {
  documentId: string;
  versionId: string;
}

export interface UpdateDocumentVersionInput {
  tenantId?: string;
  documentId?: string;
  versionId: string;
  contentMarkdown?: string;
  markdownContent?: string;
  rowVersion?: number;
  expectedRowVersion?: number;
  title?: string;
  confirmInvalidateApprovals?: boolean;
}

export interface UpdateDocumentVersionResult {
  versionId: string;
  rowVersion: number;
  documentSha256: string;
  versionMinor?: number;
  lifecycleState?: string;
}

export interface CreateRevisionInput {
  tenantId?: string;
  documentId?: string;
  parentVersionId?: string;
  sourceVersionId?: string;
  changeType?: ChangeType;
  revisionType?: ChangeType;
  changeSummary?: string;
}

export interface CreateRevisionResult {
  versionId: string;
  versionNumber: string;
}

export interface ListDocumentsFilters {
  tenantId?: string;
  search?: string;
  category?: string;
  status?: DocumentLifecycleState;
  page?: number;
  limit?: number;
  sortBy?: "updatedAt" | "createdAt" | "documentCode" | "title";
  sortOrder?: "asc" | "desc";
}

export interface DocumentListItem {
  id: string;
  tenantId: string;
  documentCode: string;
  title: string;
  category: string | null;
  contentFormat: ContentFormat;
  currentVersionLabel: string;
  currentVersionId: string;
  lifecycleState: DocumentLifecycleState;
  documentSha256?: string | null;
  versionCount: number;
  authorName?: string | null;
  authorId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListDocumentsResult {
  documents: DocumentListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DocumentVersionSummary {
  id: string;
  documentId: string;
  parentVersionId: string | null;
  versionMajor: number;
  versionMinor: number;
  versionLabel: string | null;
  title: string;
  contentFormat: ContentFormat;
  markdownContent?: string | null;
  fileMimeType?: string | null;
  fileSizeBytes?: number | null;
  fileSha256?: string | null;
  lifecycleState: DocumentLifecycleState;
  authorId: string;
  authorName?: string | null;
  effectiveDate?: string | null;
  publishedAt?: string | null;
  rowVersion: number;
  documentSha256: string | null;
  fileStorageKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersionDetail extends DocumentVersionSummary {
  markdownContent: string | null;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  fileSha256: string | null;
  effectiveDate: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  authorName?: string | null;
}

export interface DocumentDetailResult {
  document: {
    id: string;
    tenantId: string;
    documentCode: string;
    category: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  };
  versions: DocumentVersionSummary[];
  activeVersion: DocumentVersionDetail | null;
}
