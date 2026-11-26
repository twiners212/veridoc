import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/server", () => ({
  resolveApiRequestContext: vi.fn(async (req: NextRequest) => ({
    tenantId: req.headers.get("x-tenant-id") ?? "11111111-1111-4111-8111-111111111111",
    userId: req.headers.get("x-user-id") ?? "44444444-4444-4444-8444-444444444444",
  })),
}));

vi.mock("@/server/security/rate-limiter", () => ({
  consumeDistributedRateLimit: vi.fn(async () => ({
    allowed: true,
    limit: 20,
    remaining: 19,
    retryAfterSeconds: 0,
    resetUnixSeconds: 9999999999,
  })),
  createRateLimitResponse: vi.fn(),
}));
import type { TenantTransaction } from "@/db/context";
import {
  tenants,
  tenantMemberships,
  documents,
  documentVersions,
  approvalCycles,
  approvalSteps,
  users,
  auditLogs,
} from "@/db/schema";
import { ApprovalService } from "@/server/services/approval.service";
import { ResendNotificationProvider } from "@/server/services/notification.service";
import {
  createSignedPreviewUrl,
  createSignedUploadUrl,
  uploadDocumentPdf,
  verifyUploadedPdfObject,
} from "@/lib/storage/storage.service";
import { POST as uploadFinalizePost } from "@/app/api/documents/[documentId]/versions/[versionId]/upload-finalize/route";
import { isDemoLoginEnabled } from "@/lib/auth/demo-accounts";
import {
  createCorrelationId,
  logError,
  logInfo,
  logWarn,
} from "@/lib/logger";
import { buildAuditPacketPdf } from "@/server/services/audit-pdf.service";
import type { AuditPacketExport } from "@/server/services/audit-export.service";

function createApprovalMockTx(approverEmail: string | null): TenantTransaction {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const docId = "22222222-2222-4222-8222-222222222222";
  const versionId = "33333333-3333-4333-8333-333333333333";
  const authorId = "44444444-4444-4444-8444-444444444444";
  const approverId = "55555555-5555-4555-8555-555555555555";

  const fakeTx = {
    execute: async () => [],
    select: () => ({
      from: (table: unknown) => {
        const makeResult = (rows: unknown[]) => {
          const promise = Promise.resolve(rows) as Promise<unknown[]> & {
            where: () => typeof promise;
            for: () => typeof promise;
            orderBy: () => typeof promise;
            limit: () => Promise<unknown[]>;
          };
          promise.where = () => promise;
          promise.for = () => promise;
          promise.orderBy = () => promise;
          promise.limit = async () => rows;
          return promise;
        };

        if (table === documentVersions) {
          return makeResult([
            {
              id: versionId,
              tenantId,
              documentId: docId,
              versionMajor: 1,
              versionMinor: 0,
              title: "Cleanroom SOP",
              contentFormat: "MARKDOWN",
              markdownContent: "# Cleanroom SOP\nStep 1",
              fileStorageKey: null,
              fileSha256: null,
              lifecycleState: "DRAFT",
              authorId,
              rowVersion: 1,
            },
          ]);
        }
        if (table === tenants) {
          return makeResult([{ allowSingleAuthorOverride: false }]);
        }
        if (table === tenantMemberships) {
          return makeResult([
            { userId: approverId, role: "APPROVER_REVIEWER", status: "ACTIVE" },
          ]);
        }
        if (table === documents) {
          return makeResult([{ documentCode: "SOP-001" }]);
        }
        if (table === approvalCycles) {
          return makeResult([{ maxNum: 0 }]);
        }
        if (table === auditLogs) {
          return makeResult([]);
        }
        if (table === users) {
          return makeResult(approverEmail !== null ? [{ email: approverEmail }] : []);
        }
        return makeResult([]);
      },
    }),
    insert: (table: unknown) => ({
      values: (vals: unknown) => ({
        returning: async () => {
          if (table === approvalCycles) {
            return [{ id: "66666666-6666-4666-8666-666666666666", cycleNumber: 1 }];
          }
          if (table === approvalSteps) {
            return Array.isArray(vals)
              ? vals.map((v, i) => ({
                  id: `77777777-7777-4777-8777-77777777777${i}`,
                  ...v,
                }))
              : [vals];
          }
          return [vals];
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [
            {
              id: versionId,
              lifecycleState: "PENDING_APPROVAL",
              rowVersion: 2,
            },
          ],
        }),
      }),
    }),
  };

  return fakeTx as unknown as TenantTransaction;
}

describe("Wave 2 Unit Tests: Reliability & Security Controls", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const key of [
      "NOTIFICATION_FROM_EMAIL",
      "EMAIL_FROM",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "VERCEL_ENV",
      "NODE_ENV",
      "ENABLE_DEMO_LOGIN",
    ]) {
      if (originalEnv[key] === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        Reflect.set(process.env, key, originalEnv[key]);
      }
    }
  });

  describe("1. Notification email resolution & ResendNotificationProvider", () => {
    it("resolves user UUID to users.email in ApprovalService.submitForApproval and omits notification when missing", async () => {
      const tenantId = "11111111-1111-4111-8111-111111111111";
      const versionId = "33333333-3333-4333-8333-333333333333";
      const authorId = "44444444-4444-4444-8444-444444444444";
      const approverId = "55555555-5555-4555-8555-555555555555";

      const withEmail = await ApprovalService.submitForApproval(
        createApprovalMockTx("reviewer@veridoc.test"),
        {
          tenantId,
          actorUserId: authorId,
          actorRole: "DOCUMENT_AUTHOR",
          versionId,
          approverIds: [approverId],
        }
      );

      expect(withEmail.notifications).toHaveLength(1);
      expect(withEmail.notifications[0].to).toBe("reviewer@veridoc.test");

      const withoutEmail = await ApprovalService.submitForApproval(
        createApprovalMockTx(null),
        {
          tenantId,
          actorUserId: authorId,
          actorRole: "DOCUMENT_AUTHOR",
          versionId,
          approverIds: [approverId],
        }
      );

      expect(withoutEmail.notifications).toHaveLength(0);
    });

    it("ResendNotificationProvider uses NOTIFICATION_FROM_EMAIL and passes AbortSignal.timeout", async () => {
      Reflect.set(process.env, "NOTIFICATION_FROM_EMAIL", "QA <qa@example.com>");
      const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify({ id: "email-123" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = new ResendNotificationProvider("re_test_key");
      const result = await provider.send({
        to: "approver@example.com",
        subject: "Approval Required",
        body: "Please review SOP-001",
      });

      expect(result).toEqual({ success: true, id: "email-123" });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const callArgs = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit
      ];
      const init = callArgs[1];
      const parsedBody = JSON.parse(String(init.body)) as { from: string };
      expect(parsedBody.from).toBe("QA <qa@example.com>");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe("2. Storage fail-fast URL error", () => {
    it("throws when both NEXT_PUBLIC_SUPABASE_URL and SUPABASE_URL are unset", async () => {
      Reflect.deleteProperty(process.env, "NEXT_PUBLIC_SUPABASE_URL");
      Reflect.deleteProperty(process.env, "SUPABASE_URL");
      Reflect.set(process.env, "SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

      await expect(createSignedPreviewUrl("tenants/a/doc.pdf")).rejects.toThrow(
        /NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required/
      );
      await expect(createSignedUploadUrl("tenants/a/doc.pdf")).rejects.toThrow(
        /NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required/
      );
      await expect(
        verifyUploadedPdfObject("tenants/a/doc.pdf")
      ).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required/);
      await expect(
        uploadDocumentPdf(
          "11111111-1111-4111-8111-111111111111",
          "22222222-2222-4222-8222-222222222222",
          "33333333-3333-4333-8333-333333333333",
          Buffer.from("%PDF-1.4\n")
        )
      ).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required/);
    });
  });

  describe("3. /upload-finalize storageKey prefix regex validation", () => {
    it("rejects cross-tenant, traversal, and non-UUID storageKey values with 400 VALIDATION_ERROR", async () => {
      const tenantId = "11111111-1111-4111-8111-111111111111";
      const otherTenantId = "99999999-9999-4999-8999-999999999999";
      const documentId = "22222222-2222-4222-8222-222222222222";
      const versionId = "33333333-3333-4333-8333-333333333333";
      const userId = "44444444-4444-4444-8444-444444444444";

      const invalidKeys = [
        `tenants/${otherTenantId}/documents/${documentId}/versions/${versionId}/55555555-5555-4555-8555-555555555555.pdf`,
        `tenants/${tenantId}/documents/${documentId}/versions/${versionId}/../secret.pdf`,
        `tenants/${tenantId}/documents/${documentId}/versions/${versionId}/not-a-uuid.pdf`,
        "arbitrary/path/file.pdf",
      ];

      for (const storageKey of invalidKeys) {
        const req = new NextRequest(
          `http://localhost:3000/api/documents/${documentId}/versions/${versionId}/upload-finalize`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-tenant-id": tenantId,
              "x-user-id": userId,
            },
            body: JSON.stringify({ storageKey }),
          }
        );

        const res = await uploadFinalizePost(req, {
          params: Promise.resolve({ documentId, versionId }),
        });

        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("4. isDemoLoginEnabled() production guard", () => {
    it("returns false unconditionally when VERCEL_ENV === 'production' even if ENABLE_DEMO_LOGIN === 'true'", () => {
      Reflect.set(process.env, "VERCEL_ENV", "production");
      Reflect.set(process.env, "NODE_ENV", "development");
      Reflect.set(process.env, "ENABLE_DEMO_LOGIN", "true");

      expect(isDemoLoginEnabled()).toBe(false);
    });
  });

  describe("5. Structured logger scrubbing", () => {
    it("emits JSON and scrubs password, reauthPassword, secret, token, key, signedUrl, and authorization", () => {
      const captured: string[] = [];
      vi.spyOn(console, "info").mockImplementation((msg?: unknown) => {
        captured.push(String(msg));
      });
      vi.spyOn(console, "warn").mockImplementation((msg?: unknown) => {
        captured.push(String(msg));
      });
      vi.spyOn(console, "error").mockImplementation((msg?: unknown) => {
        captured.push(String(msg));
      });

      const correlationId = createCorrelationId();
      expect(correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      logInfo("info-event", {
        correlationId,
        token: "jwt-secret-token",
        apiKey: "ak_123",
        safeField: "visible",
      });
      logWarn("warn-event", {
        nested: {
          signedUrl: "https://storage.example/signed?token=abc",
          authorization: "Bearer raw-bearer",
        },
      });
      logError("error-event", new Error("db failure"), {
        correlationId,
        password: "pw1",
        reauthPassword: "pw2",
        secret: "sec-val",
        key: "raw-key",
      });

      expect(captured).toHaveLength(3);

      const info = JSON.parse(captured[0]) as Record<string, unknown>;
      expect(info.token).toBe("[REDACTED]");
      expect(info.apiKey).toBe("[REDACTED]");
      expect(info.safeField).toBe("visible");

      const warn = JSON.parse(captured[1]) as {
        nested: Record<string, unknown>;
      };
      expect(warn.nested.signedUrl).toBe("[REDACTED]");
      expect(warn.nested.authorization).toBe("[REDACTED]");

      const err = JSON.parse(captured[2]) as Record<string, unknown>;
      expect(err.password).toBe("[REDACTED]");
      expect(err.reauthPassword).toBe("[REDACTED]");
      expect(err.secret).toBe("[REDACTED]");
      expect(err.key).toBe("[REDACTED]");
    });
  });

  describe("6. Audit PDF builder syntax, NFD transliteration & multi-doc rendering", () => {
    it("renders valid footer path operator, NFD Latin transliteration, multi-doc/version sections, and truncation notices", () => {
      const dummyExport: AuditPacketExport = {
        exportMetadata: {
          exportId: "11111111-1111-4111-8111-111111111111",
          generatedAt: "2026-11-26T10:00:00.000Z",
          generatedBy: {
            userId: "22222222-2222-4222-8222-222222222222",
            fullName: "José García",
            role: "QUALITY_MANAGER",
          },
          tenant: {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Café Résumé Labs",
            slug: "cafe-resume-labs",
          },
          filter: { format: "pdf" },
          specVersion: "1.0.0",
          system: "VeriDoc Document & SOP Approval Workspace",
        },
        verification: {
          chainVerified: true,
          totalEntriesInChain: 42,
          headHash: "a".repeat(64),
          genesisPrevHash: "0".repeat(64),
          hashAlgorithm: "SHA-256",
          verifiedAt: "2026-11-26T10:00:00.000Z",
        },
        complianceDisclosure: {
          standard: "ISO 9001 Document Control Assist",
          immutabilityArchitecture: "Append-only ledger",
          infrastructureBoundaryNotice: "DB IAM enforced",
          claimsBoundary: {
            fda21CfrPart11Certified: false,
            part11Notice: "Not certified",
            tamperProofAbsoluteClaim: false,
            tamperProofNotice: "Tamper-evident",
          },
        },
        scope: {
          type: "TENANT_AUDIT_SUMMARY",
          documentCount: 2,
          versionCount: 3,
          auditTrailTruncated: true,
          totalAuditEntriesInScope: 1500,
        },
        documents: [
          {
            id: "doc-1",
            documentCode: "SOP-001",
            category: "QA",
            createdAt: "2026-11-01T00:00:00.000Z",
            versions: [
              {
                id: "ver-1",
                versionMajor: 1,
                versionMinor: 0,
                versionLabel: "v1.0",
                title: "Café Résumé naïve 日本語",
                contentFormat: "MARKDOWN",
                lifecycleState: "SUPERSEDED",
                documentSha256: "b".repeat(64),
                fileSha256: null,
                fileSizeBytes: null,
                fileMimeType: null,
                effectiveDate: null,
                publishedAt: null,
                publishedBy: null,
                author: { id: "u1", name: "Author A" },
                parentVersionId: null,
                createdAt: "2026-11-01T00:00:00.000Z",
                updatedAt: "2026-11-01T00:00:00.000Z",
                approvalCycles: [],
                readAcknowledgments: {
                  summary: {
                    totalAssigned: 12,
                    totalAcknowledged: 12,
                    totalPending: 0,
                    totalOverdue: 0,
                    completionRatePercent: 100,
                  },
                  records: Array.from({ length: 12 }, (_, idx) => ({
                    id: `ack-${idx}`,
                    user: { id: `u-${idx}`, name: `Reader ${idx}` },
                    documentSha256: "b".repeat(64),
                    dwellTimeSeconds: 15,
                    maxScrollPercent: 100,
                    acknowledgedIp: "127.0.0.1",
                    acknowledgedAt: "2026-11-02T00:00:00.000Z",
                  })),
                },
              },
              {
                id: "ver-2",
                versionMajor: 2,
                versionMinor: 0,
                versionLabel: "v2.0",
                title: "Updated Cleanroom SOP",
                contentFormat: "MARKDOWN",
                lifecycleState: "PUBLISHED",
                documentSha256: "c".repeat(64),
                fileSha256: null,
                fileSizeBytes: null,
                fileMimeType: null,
                effectiveDate: null,
                publishedAt: "2026-11-10T00:00:00.000Z",
                publishedBy: { id: "u2", name: "Admin B" },
                author: { id: "u1", name: "Author A" },
                parentVersionId: "ver-1",
                createdAt: "2026-11-05T00:00:00.000Z",
                updatedAt: "2026-11-10T00:00:00.000Z",
                approvalCycles: [],
                readAcknowledgments: {
                  summary: {
                    totalAssigned: 0,
                    totalAcknowledged: 0,
                    totalPending: 0,
                    totalOverdue: 0,
                    completionRatePercent: 0,
                  },
                  records: [],
                },
              },
            ],
          },
          {
            id: "doc-2",
            documentCode: "SOP-002",
            category: "SAFETY",
            createdAt: "2026-11-12T00:00:00.000Z",
            versions: [
              {
                id: "ver-3",
                versionMajor: 1,
                versionMinor: 0,
                versionLabel: "v1.0",
                title: "Chemical Handling",
                contentFormat: "PDF",
                lifecycleState: "PUBLISHED",
                documentSha256: "d".repeat(64),
                fileSha256: "e".repeat(64),
                fileSizeBytes: 1024,
                fileMimeType: "application/pdf",
                effectiveDate: null,
                publishedAt: "2026-11-15T00:00:00.000Z",
                publishedBy: { id: "u2", name: "Admin B" },
                author: { id: "u1", name: "Author A" },
                parentVersionId: null,
                createdAt: "2026-11-12T00:00:00.000Z",
                updatedAt: "2026-11-15T00:00:00.000Z",
                approvalCycles: [],
                readAcknowledgments: {
                  summary: {
                    totalAssigned: 0,
                    totalAcknowledged: 0,
                    totalPending: 0,
                    totalOverdue: 0,
                    completionRatePercent: 0,
                  },
                  records: [],
                },
              },
            ],
          },
        ],
        auditTrail: Array.from({ length: 25 }, (_, i) => ({
          sequenceNumber: i + 1,
          eventType: "DOCUMENT_CREATED",
          entityType: "DOCUMENT",
          entityId: `doc-${i}`,
          actorUserId: "u1",
          actorRole: "DOCUMENT_AUTHOR",
          actorIp: "127.0.0.1",
          prevHash: "0".repeat(64),
          entryHash: "f".repeat(64),
          createdAt: "2026-11-01T00:00:00.000Z",
          payloadJson: {},
        })),
      };

      const pdfBuffer = buildAuditPacketPdf(dummyExport);
      const pdfText = pdfBuffer.toString("utf8");

      expect(pdfText.startsWith("%PDF-1.4")).toBe(true);
      expect(pdfText).toContain("36 50 m 576 50 l S Q");
      expect(pdfText).not.toContain("36 50 m 576 50 S Q");

      // NFD Latin transliteration + non-Latin '?' fallback
      expect(pdfText).toContain("Jose Garcia");
      expect(pdfText).toContain("Cafe Resume naive ???");

      // Multi-doc & multi-version rendering (parentheses are escaped in PDF literal strings)
      expect(pdfText).toContain("SOP-001");
      expect(pdfText).toContain("v1.0 \\(SUPERSEDED\\)");
      expect(pdfText).toContain("v2.0 \\(PUBLISHED\\)");
      expect(pdfText).toContain("SOP-002");
      expect(pdfText).toContain("Chemical Handling");

      // Truncation notices
      expect(pdfText).toContain("[TRUNCATED] Showing 10 of 12 verified reader attestations");
      expect(pdfText).toContain(
        `[SCOPE TRUNCATED] ${(1500).toLocaleString()} total entries matched scope`
      );
      expect(pdfText).toContain("[TRUNCATED IN PDF] Showing 20 of 25 exported ledger entries");
    });
  });
});
