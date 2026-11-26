import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and, sql } from "drizzle-orm";
import { withTenantContext } from "@/db/context";
import { tenants, users, auditLogs } from "@/db/schema";
import {
  testAdminDb,
  testAppDb,
  adminClient,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";
import {
  appendAuditLog,
  verifyTenantAuditChain,
  computeAuditHash,
} from "@/server/services/audit.service";

describe("Serialized Hash-Chained AuditService (DEC-08) & Concurrency", () => {
  let tenantId: string;
  let adminUserId: string;
  const userIds: string[] = [];
  const tenantIds: string[] = [];

  beforeAll(async () => {
    // 1. Create Workspace
    const [t] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Audit Concurrency Workspace",
        slug: `audit-workspace-${Date.now()}`,
      })
      .returning();
    tenantId = t.id;
    tenantIds.push(tenantId);

    // 2. Create Admin user
    const [u] = await testAdminDb
      .insert(users)
      .values({
        name: "Audit Administrator",
        email: `audit-admin-${Date.now()}@veridoc.test`,
      })
      .returning();
    adminUserId = u.id;
    userIds.push(adminUserId);
  });

  afterAll(async () => {
    await cleanupTestTenants(tenantIds);
    await cleanupTestUsers(userIds);
  });

  it("serializes 10 concurrent audit writes via pg_advisory_xact_lock without sequence collisions or chain forks", async () => {
    // Launch 10 simultaneous asynchronous transactions
    const concurrency = 10;
    const tasks = Array.from({ length: concurrency }, (_, i) =>
      withTenantContext(
        tenantId,
        async (tx) => {
          return await appendAuditLog(tx, {
            tenantId,
            eventType: "CONCURRENT_TEST_EVENT",
            entityType: "DOCUMENT_VERSION",
            entityId: crypto.randomUUID(),
            actorUserId: adminUserId,
            actorRole: "WORKSPACE_ADMIN",
            payloadJson: {
              batchIndex: i,
              timestamp: Date.now(),
              description: `Concurrent audit log write #${i}`,
            },
          });
        },
        testAppDb
      )
    );

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(concurrency);

    // Fetch all logs from DB ordered by sequenceNumber
    const rows = await testAdminDb
      .select({
        sequenceNumber: auditLogs.sequenceNumber,
        prevHash: auditLogs.prevHash,
        entryHash: auditLogs.entryHash,
        eventType: auditLogs.eventType,
        payloadJson: auditLogs.payloadJson,
      })
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .orderBy(auditLogs.sequenceNumber);

    // 1. Monotonic gapless sequence verification: [1, 2, ..., 10]
    expect(rows).toHaveLength(concurrency);
    const sequenceNumbers = rows.map((r) => r.sequenceNumber);
    expect(sequenceNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // 2. Genesis entry rule: seq 1 prevHash is 64 zeroes
    expect(rows[0].prevHash).toBe("0".repeat(64));

    // 3. Sequential hash chain linkage: row[i].prevHash === row[i-1].entryHash
    for (let i = 1; i < concurrency; i++) {
      expect(rows[i].prevHash).toBe(rows[i - 1].entryHash);
    }

    // 4. Verify using verifyTenantAuditChain utility
    const verification = await verifyTenantAuditChain(tenantId, {
      dbClient: testAppDb,
    });
    expect(verification.verified).toBe(true);
    expect(verification.totalEntries).toBe(concurrency);
    expect(verification.headHash).toBe(rows[concurrency - 1].entryHash);
    expect(verification.failureReason).toBeUndefined();
  });

  it("detects payload tampering and fails verification with failedSequenceNumber (Tamper Evidence)", async () => {
    // Identify row with sequenceNumber = 5
    const [targetRow] = await testAdminDb
      .select({
        id: auditLogs.id,
        sequenceNumber: auditLogs.sequenceNumber,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.sequenceNumber, 5)
        )
      )
      .limit(1);

    expect(targetRow).toBeDefined();

    // Use adminClient (superuser) with session_replication_role = 'replica'
    // to bypass the PostgreSQL fn_audit_logs_immutable() trigger and simulate unauthorized tampering
    await adminClient.begin(async (sql) => {
      await sql`SET LOCAL session_replication_role = 'replica'`;
      await sql`
        UPDATE veridoc.audit_logs
        SET payload_json = '{"tampered": true, "malicious_edit": "unauthorized"}'::jsonb
        WHERE id = ${targetRow.id}
      `;
    });

    // Verify tenant audit chain now detects tampering at sequence 5
    const result = await verifyTenantAuditChain(tenantId, {
      dbClient: testAppDb,
    });

    expect(result.verified).toBe(false);
    expect(result.failedSequenceNumber).toBe(5);
    expect(result.failureReason).toContain("Hash mismatch at sequence 5");
  });

  it("supports parallel audit streams across independent tenants without lock interference", async () => {
    // Create Tenant Alpha and Tenant Beta
    const [tAlpha] = await testAdminDb
      .insert(tenants)
      .values({ name: "Alpha", slug: `alpha-${Date.now()}` })
      .returning();
    const [tBeta] = await testAdminDb
      .insert(tenants)
      .values({ name: "Beta", slug: `beta-${Date.now()}` })
      .returning();

    tenantIds.push(tAlpha.id, tBeta.id);

    // Fire 3 concurrent writes to Alpha and 3 concurrent writes to Beta simultaneously
    const alphaTasks = Array.from({ length: 3 }, (_, i) =>
      withTenantContext(
        tAlpha.id,
        async (tx) => {
          return await appendAuditLog(tx, {
            tenantId: tAlpha.id,
            eventType: "ALPHA_EVENT",
            entityType: "TENANT",
            entityId: tAlpha.id,
            payloadJson: { alphaIndex: i },
          });
        },
        testAppDb
      )
    );

    const betaTasks = Array.from({ length: 3 }, (_, i) =>
      withTenantContext(
        tBeta.id,
        async (tx) => {
          return await appendAuditLog(tx, {
            tenantId: tBeta.id,
            eventType: "BETA_EVENT",
            entityType: "TENANT",
            entityId: tBeta.id,
            payloadJson: { betaIndex: i },
          });
        },
        testAppDb
      )
    );

    await Promise.all([...alphaTasks, ...betaTasks]);

    // Both chains verify independently
    const verifyAlpha = await verifyTenantAuditChain(tAlpha.id, { dbClient: testAppDb });
    const verifyBeta = await verifyTenantAuditChain(tBeta.id, { dbClient: testAppDb });

    expect(verifyAlpha.verified).toBe(true);
    expect(verifyAlpha.totalEntries).toBe(3);

    expect(verifyBeta.verified).toBe(true);
    expect(verifyBeta.totalEntries).toBe(3);
  });
});
