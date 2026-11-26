import "server-only";
import { createHash } from "crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { withTenantContext, type TenantTransaction } from "@/db/context";
import {
  auditLogs,
  users,
  documents,
  documentVersions,
  approvalSteps,
  approvalCycles,
  readAcknowledgments,
  tenantMemberships,
} from "@/db/schema";
import type { WorkspaceRole } from "@/server/policies/rbac.types";

export interface AppendAuditLogParams {
  tenantId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorUserId?: string | null;
  actorRole?: WorkspaceRole | null;
  actorIp?: string | null;
  payloadJson?: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  sequenceNumber: number;
  eventType: string;
  entityType: string;
  entityId: string;
  actorUserId: string | null;
  actorRole: WorkspaceRole | null;
  actorIp: string | null;
  payloadJson: unknown;
  prevHash: string;
  entryHash: string;
  createdAt: Date;
}

export interface AuditChainVerificationResult {
  verified: boolean;
  totalEntries: number;
  headHash: string | null;
  failureReason?: string;
  failedSequenceNumber?: number;
}

export interface GetAuditLogsParams {
  tenantId: string;
  cursor?: number | null;
  cursorSequence?: number | null;
  limit?: number;
  search?: string | null;
  eventType?: string | null;
  actorRole?: WorkspaceRole | string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}

export interface EnrichedAuditLogItem {
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

export interface GetAuditLogsResult {
  items: EnrichedAuditLogItem[];
  nextCursorSequence: number | null;
  hasMore: boolean;
  limit: number;
}

export interface AuditStatsResult {
  ledgerHead: number;
  digestStandard: "SHA-256";
  invalidations30d: number;
  readAttestations: number;
  totalEntries: number;
  headHash: string | null;
  chainVerified?: boolean;
}

/**
 * Deterministic JSON stringifier that sorts object keys recursively.
 * Guarantees consistent string serialization across runtimes.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonStringify(item ?? null)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const pairs: string[] = [];
  for (const key of keys) {
    const val = (value as Record<string, unknown>)[key];
    if (val !== undefined) {
      pairs.push(`${JSON.stringify(key)}:${canonicalJsonStringify(val)}`);
    }
  }
  return `{${pairs.join(",")}}`;
}

/**
 * Canonical audit hash formula:
 * entry_hash = SHA-256(AUDIT_HASH_SALT || prev_hash || tenant_id || sequence_number || event_type || entity_id || canonical_payload_json)
 */
export function computeAuditHash({
  salt = process.env.AUDIT_HASH_SALT || "",
  prevHash,
  tenantId,
  sequenceNumber,
  eventType,
  entityId,
  payloadJson = {},
}: {
  salt?: string;
  prevHash: string;
  tenantId: string;
  sequenceNumber: number;
  eventType: string;
  entityId: string;
  payloadJson?: Record<string, unknown>;
}): string {
  const canonicalPayload = canonicalJsonStringify(payloadJson);
  const data = `${salt}${prevHash}${tenantId}${sequenceNumber}${eventType}${entityId}${canonicalPayload}`;
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * Appends a hash-chained audit log entry within an active database transaction.
 * Serializes concurrent transactions for the same tenant using pg_advisory_xact_lock.
 */
export async function appendAuditLog(
  tx: TenantTransaction,
  params: AppendAuditLogParams
): Promise<AuditLogEntry> {
  const { tenantId } = params;

  // 1. Acquire transaction-scoped advisory lock on tenantId to serialize sequence numbers
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}::text))`
  );

  // 2. Fetch the latest audit log entry for this tenant
  const [latest] = await tx
    .select({
      sequenceNumber: auditLogs.sequenceNumber,
      entryHash: auditLogs.entryHash,
    })
    .from(auditLogs)
    .where(eq(auditLogs.tenantId, tenantId))
    .orderBy(desc(auditLogs.sequenceNumber))
    .limit(1);

  // 3. Determine monotonic sequence number and prev_hash
  const nextSequenceNumber = latest ? latest.sequenceNumber + 1 : 1;
  const prevHash = latest ? latest.entryHash : "0".repeat(64);

  // 4. Compute entry hash using canonical formula
  const payload = params.payloadJson ?? {};
  const entryHash = computeAuditHash({
    prevHash,
    tenantId,
    sequenceNumber: nextSequenceNumber,
    eventType: params.eventType,
    entityId: params.entityId,
    payloadJson: payload,
  });

  // 5. Insert new audit log row
  const [inserted] = await tx
    .insert(auditLogs)
    .values({
      tenantId,
      sequenceNumber: nextSequenceNumber,
      eventType: params.eventType,
      entityType: params.entityType,
      entityId: params.entityId,
      actorUserId: params.actorUserId ?? null,
      actorRole: params.actorRole ?? null,
      actorIp: params.actorIp ?? null,
      payloadJson: payload,
      prevHash,
      entryHash,
    })
    .returning();

  return inserted as AuditLogEntry;
}

/**
 * Verifies the integrity of the audit hash-chain within an active tenant transaction.
 * Replays audit_logs in bounded chunks of 1000 rows ordered by sequenceNumber ASC.
 */
export async function verifyTenantAuditChainInTx(
  tx: TenantTransaction,
  tenantId: string,
  options?: {
    salt?: string;
  }
): Promise<AuditChainVerificationResult> {
  const salt = options?.salt ?? process.env.AUDIT_HASH_SALT ?? "";
  const GENESIS_PREV_HASH = "0".repeat(64);
  const CHUNK_SIZE = 1000;

  let lastSeq = 0;
  let expectedSeq = 1;
  let expectedPrevHash = GENESIS_PREV_HASH;
  let totalEntries = 0;
  let headHash: string | null = null;

  while (true) {
    const rows = await tx
      .select({
        id: auditLogs.id,
        tenantId: auditLogs.tenantId,
        sequenceNumber: auditLogs.sequenceNumber,
        eventType: auditLogs.eventType,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        payloadJson: auditLogs.payloadJson,
        prevHash: auditLogs.prevHash,
        entryHash: auditLogs.entryHash,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          gt(auditLogs.sequenceNumber, lastSeq)
        )
      )
      .orderBy(asc(auditLogs.sequenceNumber))
      .limit(CHUNK_SIZE);

    if (rows.length === 0) {
      break;
    }

    for (const entry of rows) {
      totalEntries++;

      // Check sequence monotonicity (gapless)
      if (entry.sequenceNumber !== expectedSeq) {
        return {
          verified: false,
          totalEntries,
          headHash,
          failureReason: `Sequence gap detected: expected ${expectedSeq}, got ${entry.sequenceNumber}`,
          failedSequenceNumber: entry.sequenceNumber,
        };
      }

      // Check prevHash linkage
      if (entry.prevHash !== expectedPrevHash) {
        return {
          verified: false,
          totalEntries,
          headHash,
          failureReason: `Hash linkage broken at sequence ${entry.sequenceNumber}: prevHash mismatch`,
          failedSequenceNumber: entry.sequenceNumber,
        };
      }

      // Recompute entry hash
      const recomputedHash = computeAuditHash({
        salt,
        prevHash: entry.prevHash,
        tenantId: entry.tenantId,
        sequenceNumber: entry.sequenceNumber,
        eventType: entry.eventType,
        entityId: entry.entityId,
        payloadJson: entry.payloadJson as Record<string, unknown>,
      });

      if (entry.entryHash !== recomputedHash) {
        return {
          verified: false,
          totalEntries,
          headHash,
          failureReason: `Hash mismatch at sequence ${entry.sequenceNumber}: entry was tampered`,
          failedSequenceNumber: entry.sequenceNumber,
        };
      }

      expectedSeq++;
      expectedPrevHash = entry.entryHash;
      headHash = entry.entryHash;
      lastSeq = entry.sequenceNumber;
    }

    if (rows.length < CHUNK_SIZE) {
      break;
    }
  }

  return {
    verified: true,
    totalEntries,
    headHash,
  };
}

/**
 * Verifies the integrity of the audit hash-chain for a given tenant.
 * Replays the chain sequentially and checks sequence monotonicity, hash linkage, and entry hash correctness.
 */
export async function verifyTenantAuditChain(
  tenantId: string,
  options?: {
    dbClient?: typeof db;
    salt?: string;
  }
): Promise<AuditChainVerificationResult> {
  const client = options?.dbClient ?? db;

  return await withTenantContext(
    tenantId,
    (tx) => verifyTenantAuditChainInTx(tx, tenantId, options),
    client
  );
}

/**
 * Fetches cursor-paginated audit trail logs for a tenant with rich polymorphic entity metadata.
 */
export async function getAuditLogs(
  tx: TenantTransaction,
  params: GetAuditLogsParams
): Promise<GetAuditLogsResult> {
  const cursor = params.cursor ?? params.cursorSequence ?? null;
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 200);

  const conditions = [eq(auditLogs.tenantId, params.tenantId)];

  if (cursor !== null && cursor !== undefined) {
    conditions.push(sql`${auditLogs.sequenceNumber} < ${cursor}`);
  }

  if (params.eventType && params.eventType !== "ALL") {
    conditions.push(eq(auditLogs.eventType, params.eventType));
  }

  if (params.actorRole && params.actorRole !== "ALL") {
    conditions.push(eq(auditLogs.actorRole, params.actorRole as WorkspaceRole));
  }

  if (params.startDate) {
    conditions.push(gte(auditLogs.createdAt, new Date(params.startDate)));
  }

  if (params.endDate) {
    conditions.push(lte(auditLogs.createdAt, new Date(params.endDate)));
  }

  if (params.search) {
    const searchTerm = params.search.trim();
    if (searchTerm.length > 0) {
      // Find matching document versions by document code or title
      const matchingDocs = await tx
        .select({ id: documentVersions.id })
        .from(documentVersions)
        .innerJoin(documents, eq(documentVersions.documentId, documents.id))
        .where(
          and(
            eq(documentVersions.tenantId, params.tenantId),
            or(
              ilike(documents.documentCode, `%${searchTerm}%`),
              ilike(documentVersions.title, `%${searchTerm}%`)
            )
          )
        )
        .limit(50);

      const matchingVersionIds = matchingDocs.map((d) => d.id);

      // Find matching users by name or email within tenant
      const matchingUsers = await tx
        .select({ id: users.id })
        .from(users)
        .innerJoin(tenantMemberships, eq(users.id, tenantMemberships.userId))
        .where(
          and(
            eq(tenantMemberships.tenantId, params.tenantId),
            or(
              ilike(users.name, `%${searchTerm}%`),
              ilike(users.email, `%${searchTerm}%`)
            )
          )
        )
        .limit(50);

      const matchingUserIds = matchingUsers.map((u) => u.id);

      const searchConditions = [
        ilike(auditLogs.entryHash, `%${searchTerm}%`),
        sql`${auditLogs.actorIp}::text ILIKE ${'%' + searchTerm + '%'}`,
        sql`${auditLogs.payloadJson}::text ILIKE ${'%' + searchTerm + '%'}`,
      ];

      if (matchingVersionIds.length > 0) {
        searchConditions.push(inArray(auditLogs.entityId, matchingVersionIds));
      }

      if (matchingUserIds.length > 0) {
        searchConditions.push(inArray(auditLogs.actorUserId, matchingUserIds));
      }

      conditions.push(or(...searchConditions)!);
    }
  }

  const rows = await tx
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.sequenceNumber))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const resultRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursorSequence = hasMore
    ? resultRows[resultRows.length - 1].sequenceNumber
    : null;

  if (resultRows.length === 0) {
    return {
      items: [],
      nextCursorSequence: null,
      hasMore: false,
      limit,
    };
  }

  // 1. Fetch actors
  const actorUserIds = Array.from(
    new Set(resultRows.map((r) => r.actorUserId).filter(Boolean) as string[])
  );
  const userMap = new Map<string, { id: string; name: string; email: string }>();
  if (actorUserIds.length > 0) {
    const userRecords = await tx
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, actorUserIds));
    for (const u of userRecords) {
      userMap.set(u.id, u);
    }
  }

  // 2. Collect version, document, step, cycle IDs
  const versionIds = new Set<string>();
  const documentIds = new Set<string>();
  const stepIds = new Set<string>();
  const cycleIds = new Set<string>();

  for (const r of resultRows) {
    const payload = (r.payloadJson ?? {}) as Record<string, unknown>;
    if (typeof payload.documentVersionId === "string") {
      versionIds.add(payload.documentVersionId);
    }
    if (typeof payload.documentId === "string") {
      documentIds.add(payload.documentId);
    }
    if (r.entityType === "DOCUMENT_VERSION") {
      versionIds.add(r.entityId);
    } else if (r.entityType === "DOCUMENT") {
      documentIds.add(r.entityId);
    } else if (r.entityType === "APPROVAL_STEP") {
      stepIds.add(r.entityId);
    } else if (r.entityType === "APPROVAL_CYCLE") {
      cycleIds.add(r.entityId);
    }
  }

  if (stepIds.size > 0) {
    const steps = await tx
      .select({
        stepId: approvalSteps.id,
        versionId: approvalCycles.documentVersionId,
      })
      .from(approvalSteps)
      .innerJoin(
        approvalCycles,
        eq(approvalSteps.approvalCycleId, approvalCycles.id)
      )
      .where(
        and(
          eq(approvalSteps.tenantId, params.tenantId),
          inArray(approvalSteps.id, Array.from(stepIds))
        )
      );
    for (const s of steps) {
      if (s.versionId) versionIds.add(s.versionId);
    }
  }

  if (cycleIds.size > 0) {
    const cycles = await tx
      .select({
        cycleId: approvalCycles.id,
        versionId: approvalCycles.documentVersionId,
      })
      .from(approvalCycles)
      .where(
        and(
          eq(approvalCycles.tenantId, params.tenantId),
          inArray(approvalCycles.id, Array.from(cycleIds))
        )
      );
    for (const c of cycles) {
      if (c.versionId) versionIds.add(c.versionId);
    }
  }

  // Fetch document versions
  const versionMap = new Map<
    string,
    {
      id: string;
      documentCode: string;
      documentTitle: string;
      versionString: string;
    }
  >();

  if (versionIds.size > 0) {
    const versions = await tx
      .select({
        id: documentVersions.id,
        title: documentVersions.title,
        versionMajor: documentVersions.versionMajor,
        versionMinor: documentVersions.versionMinor,
        documentCode: documents.documentCode,
      })
      .from(documentVersions)
      .innerJoin(documents, eq(documentVersions.documentId, documents.id))
      .where(
        and(
          eq(documentVersions.tenantId, params.tenantId),
          inArray(documentVersions.id, Array.from(versionIds))
        )
      );
    for (const v of versions) {
      versionMap.set(v.id, {
        id: v.id,
        documentCode: v.documentCode,
        documentTitle: v.title,
        versionString: `v${v.versionMajor}.${v.versionMinor}`,
      });
    }
  }

  // Fetch documents if not covered by versionMap
  const docMap = new Map<string, { id: string; documentCode: string; title: string }>();
  if (documentIds.size > 0) {
    const docs = await tx
      .select({
        id: documents.id,
        documentCode: documents.documentCode,
      })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, params.tenantId),
          inArray(documents.id, Array.from(documentIds))
        )
      );
    for (const d of docs) {
      docMap.set(d.id, {
        id: d.id,
        documentCode: d.documentCode,
        title: "",
      });
    }
  }

  const items: EnrichedAuditLogItem[] = resultRows.map((r) => {
    const payload = (r.payloadJson ?? {}) as Record<string, unknown>;
    const user = r.actorUserId ? userMap.get(r.actorUserId) : null;
    const actorName =
      user?.name ?? (r.actorRole ? r.actorRole.replace("_", " ") : "System");

    let docCode: string | null = null;
    let docTitle: string | null = null;
    let versionStr: string | null = null;

    if (typeof payload.documentCode === "string") {
      docCode = payload.documentCode;
    }
    if (typeof payload.versionLabel === "string") {
      versionStr = payload.versionLabel;
    } else if (typeof payload.versionString === "string") {
      versionStr = payload.versionString;
    }

    let targetVersionId: string | null = null;
    if (r.entityType === "DOCUMENT_VERSION") {
      targetVersionId = r.entityId;
    } else if (typeof payload.documentVersionId === "string") {
      targetVersionId = payload.documentVersionId;
    }
    if (targetVersionId && versionMap.has(targetVersionId)) {
      const info = versionMap.get(targetVersionId)!;
      docCode = docCode ?? info.documentCode;
      docTitle = docTitle ?? info.documentTitle;
      versionStr = versionStr ?? info.versionString;
    }

    let targetDocId: string | null = null;
    if (r.entityType === "DOCUMENT") {
      targetDocId = r.entityId;
    } else if (typeof payload.documentId === "string") {
      targetDocId = payload.documentId;
    }
    if (targetDocId && docMap.has(targetDocId)) {
      const dInfo = docMap.get(targetDocId)!;
      docCode = docCode ?? dInfo.documentCode;
      docTitle = docTitle ?? dInfo.title;
    }

    let contextNote: string | null = null;
    if (r.eventType === "APPROVAL_INVALIDATED_BY_EDIT") {
      contextNote = "State reset to DRAFT (DEC-04)";
    } else if (r.eventType === "ADMIN_APPROVER_OVERRIDE") {
      contextNote = "BR-APP-04 Reason Logged";
    } else if (r.eventType === "WORKFLOW_SUBMITTED") {
      contextNote = "Locked SHA-256 payload";
    } else if (r.eventType === "APPROVAL_GRANTED") {
      contextNote = payload.isFinalStep
        ? "Final Sign-Off Bound"
        : "Sequential Step Sign-Off";
    } else if (r.eventType === "READ_ACKNOWLEDGED") {
      const dwell = payload.dwellTimeSeconds ?? 0;
      const scroll = payload.maxScrollPercent ?? 100;
      contextNote = `Dwell: ${dwell}s (${scroll}%)`;
    } else if (r.eventType === "SELF_APPROVAL_OVERRIDE_USED") {
      contextNote = "Single-author override enabled";
    }

    return {
      id: r.id,
      sequenceNumber: r.sequenceNumber,
      eventType: r.eventType,
      entityType: r.entityType,
      entityId: r.entityId,
      documentCode: docCode,
      documentTitle: docTitle,
      versionString: versionStr,
      actorName,
      actorRole: r.actorRole,
      actorIp: r.actorIp,
      prevHash: r.prevHash,
      entryHash: r.entryHash,
      createdAt: r.createdAt.toISOString(),
      payloadJson: payload,
      contextNote,
      actor: {
        id: r.actorUserId,
        name: actorName,
        email: user?.email ?? null,
        role: r.actorRole,
      },
    };
  });

  return {
    items,
    nextCursorSequence,
    hasMore,
    limit,
  };
}

/**
 * Computes high-level governance and ledger verification statistics for a tenant.
 */
export async function getAuditStats(
  tx: TenantTransaction,
  tenantId: string
): Promise<AuditStatsResult> {
  const [latest] = await tx
    .select({
      sequenceNumber: auditLogs.sequenceNumber,
      entryHash: auditLogs.entryHash,
    })
    .from(auditLogs)
    .where(eq(auditLogs.tenantId, tenantId))
    .orderBy(desc(auditLogs.sequenceNumber))
    .limit(1);

  const [totalRes] = await tx
    .select({ count: count() })
    .from(auditLogs)
    .where(eq(auditLogs.tenantId, tenantId));

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [invalidationsRes] = await tx
    .select({ count: count() })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.tenantId, tenantId),
        eq(auditLogs.eventType, "APPROVAL_INVALIDATED_BY_EDIT"),
        gte(auditLogs.createdAt, thirtyDaysAgo)
      )
    );

  const [readsRes] = await tx
    .select({ count: count() })
    .from(readAcknowledgments)
    .where(eq(readAcknowledgments.tenantId, tenantId));

  return {
    ledgerHead: latest?.sequenceNumber ?? 0,
    headHash: latest?.entryHash ?? null,
    digestStandard: "SHA-256",
    totalEntries: Number(totalRes?.count ?? 0),
    invalidations30d: Number(invalidationsRes?.count ?? 0),
    readAttestations: Number(readsRes?.count ?? 0),
  };
}
