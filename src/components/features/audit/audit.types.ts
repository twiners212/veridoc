import type { WorkspaceRole } from "@/types/roles";

export interface AuditItem {
  id: string;
  sequenceNumber: number;
  eventType: string;
  entityType: string;
  entityId: string;
  documentCode: string | null;
  documentTitle: string | null;
  versionString: string | null;
  actorName: string;
  actorRole: WorkspaceRole | null;
  actorIp: string | null;
  prevHash: string;
  entryHash: string;
  createdAt: string;
  payloadJson: Record<string, unknown>;
  contextNote?: string | null;
  actor?: {
    id: string | null;
    name: string;
    email: string | null;
    role: WorkspaceRole | null;
  };
}

export interface AuditStats {
  ledgerHead: number;
  digestStandard: string;
  invalidations30d: number;
  readAttestations: number;
  totalEntries?: number;
  headHash?: string | null;
  chainVerified?: boolean;
}

export interface AuditChainVerificationResult {
  verified: boolean;
  totalEntries: number;
  headHash: string | null;
  failureReason?: string;
  failedSequenceNumber?: number;
}
