import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

const LEAKED_SECRET_MSG =
  "postgres://admin:supersecret@db.internal:5432/prod_db_leak";

vi.mock("@/lib/auth/server", () => ({
  auth: {
    api: {
      signInEmail: vi.fn(async () => {
        throw new Error(LEAKED_SECRET_MSG);
      }),
    },
  },
  getUserWorkspaces: vi.fn(async () => {
    throw new Error(LEAKED_SECRET_MSG);
  }),
  resolveApiRequestContext: vi.fn(async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
  })),
  resolveServerActionCaller: vi.fn(async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
  })),
  resolveServerActionDb: vi.fn(() => ({})),
  resolveServerActionIp: vi.fn(async () => "127.0.0.1"),
  verifySignOffPassword: vi.fn(async () => true),
}));

vi.mock("@/db/context", () => ({
  isValidUuid: (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    ),
  withTenantContext: vi.fn(async () => {
    throw new Error(LEAKED_SECRET_MSG);
  }),
}));

vi.mock("@/server/security/rate-limiter", () => ({
  consumeDistributedRateLimit: vi.fn(async () => ({
    allowed: true,
    limit: 20,
    remaining: 19,
    retryAfterSeconds: 0,
    resetUnixSeconds: 9999999999,
  })),
  checkDistributedRateLimit: vi.fn(async () => ({
    allowed: true,
    limit: 5,
    remaining: 5,
    retryAfterSeconds: 0,
    resetUnixSeconds: 9999999999,
  })),
  clearDistributedRateLimit: vi.fn(async () => {}),
  extractTrustedClientIp: vi.fn(() => "127.0.0.1"),
  createRateLimitResponse: vi.fn(),
}));

import { GET as verifyGet } from "@/app/api/audit/verify/route";
import { GET as exportGet } from "@/app/api/audit/export/route";
import { GET as diffGet } from "@/app/api/documents/[documentId]/diff/route";
import { GET as previewUrlGet } from "@/app/api/documents/[documentId]/versions/[versionId]/preview-url/route";
import { POST as uploadUrlPost } from "@/app/api/documents/[documentId]/versions/[versionId]/upload-url/route";
import { POST as uploadFinalizePost } from "@/app/api/documents/[documentId]/versions/[versionId]/upload-finalize/route";
import {
  submitForApprovalAction,
  getApprovalsPageContextAction,
} from "@/server/actions/approval.actions";
import { listDocumentsAction } from "@/server/actions/documents.actions";
import { getWorkspaceSettingsDataAction } from "@/server/actions/workspace-admin.actions";

const VALID_DOC_ID = "33333333-3333-4333-8333-333333333333";
const VALID_VER_ID = "44444444-4444-4444-8444-444444444444";
const VALID_TENANT_ID = "22222222-2222-4222-8222-222222222222";

describe("500 Error Scrubbing & Correlation IDs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never leaks raw Error.message in API route 500 responses and returns a correlationId ref", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const responses = [
      await verifyGet(new NextRequest("http://localhost:3000/api/audit/verify")),
      await exportGet(new NextRequest("http://localhost:3000/api/audit/export")),
      await diffGet(
        new NextRequest(
          `http://localhost:3000/api/documents/${VALID_DOC_ID}/diff?vA=${VALID_VER_ID}&vB=${VALID_VER_ID}`
        ),
        { params: Promise.resolve({ documentId: VALID_DOC_ID }) }
      ),
      await previewUrlGet(
        new NextRequest(
          `http://localhost:3000/api/documents/${VALID_DOC_ID}/versions/${VALID_VER_ID}/preview-url`
        ),
        {
          params: Promise.resolve({
            documentId: VALID_DOC_ID,
            versionId: VALID_VER_ID,
          }),
        }
      ),
      await uploadUrlPost(
        new NextRequest(
          `http://localhost:3000/api/documents/${VALID_DOC_ID}/versions/${VALID_VER_ID}/upload-url`,
          { method: "POST" }
        ),
        {
          params: Promise.resolve({
            documentId: VALID_DOC_ID,
            versionId: VALID_VER_ID,
          }),
        }
      ),
      await uploadFinalizePost(
        new NextRequest(
          `http://localhost:3000/api/documents/${VALID_DOC_ID}/versions/${VALID_VER_ID}/upload-finalize`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              storageKey: `tenants/${VALID_TENANT_ID}/documents/${VALID_DOC_ID}/versions/${VALID_VER_ID}/55555555-5555-4555-8555-555555555555.pdf`,
            }),
          }
        ),
        {
          params: Promise.resolve({
            documentId: VALID_DOC_ID,
            versionId: VALID_VER_ID,
          }),
        }
      ),
    ];

    for (const res of responses) {
      expect(res.status).toBe(500);
      const body = (await res.json()) as {
        error: { code: string; message: string };
      };
      expect(body.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(body.error.message).not.toContain(LEAKED_SECRET_MSG);
      expect(body.error.message).not.toContain("postgres://");
      expect(body.error.message).toMatch(/ref: [0-9a-f-]{36}/i);
    }
  });

  it("never leaks raw Error.message in Server Action 500 responses and returns a correlationId ref", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const results = [
      await submitForApprovalAction({
        tenantId: VALID_TENANT_ID,
        versionId: VALID_VER_ID,
        approverIds: ["55555555-5555-4555-8555-555555555555"],
      }),
      await getApprovalsPageContextAction(VALID_TENANT_ID),
      await listDocumentsAction({ tenantId: VALID_TENANT_ID }),
      await getWorkspaceSettingsDataAction(VALID_TENANT_ID),
    ];

    for (const res of results) {
      expect(res.success).toBe(false);
      if (res.success) continue;
      expect(res.error.status).toBe(500);
      expect(res.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(res.error.message).not.toContain(LEAKED_SECRET_MSG);
      expect(res.error.message).not.toContain("postgres://");
      expect(res.error.message).toMatch(/ref: [0-9a-f-]{36}/i);
    }
  });
});
