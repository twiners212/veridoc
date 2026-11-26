import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiRequestContext } from "@/lib/auth/server";
import { withTenantContext } from "@/db/context";
import {
  deleteDocumentPdf,
  verifyUploadedPdfObject,
} from "@/lib/storage/storage.service";
import {
  commitDocumentPdfUpload,
  preflightDocumentPdfUpload,
} from "@/server/services/document-storage.service";
import {
  consumeDistributedRateLimit,
  createRateLimitResponse,
} from "@/server/security/rate-limiter";
import { createCorrelationId, logError } from "@/lib/logger";
import { DomainError } from "@/types/errors";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UploadFinalizeSchema = z.object({
  storageKey: z.string().min(1),
  expectedRowVersion: z.number().int().positive().optional(),
  confirmInvalidateApprovals: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string; versionId: string }> }
) {
  try {
    const { documentId, versionId } = await params;

    if (!UUID_REGEX.test(documentId) || !UUID_REGEX.test(versionId)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid documentId or versionId UUID format",
          },
        },
        { status: 400 }
      );
    }

    const authContext = await resolveApiRequestContext(request);
    if (!authContext) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Missing or expired session",
          },
        },
        { status: 401 }
      );
    }

    const rateLimitKey = `upload:${authContext.tenantId}:${authContext.userId}`;
    const rateLimitResult = await consumeDistributedRateLimit(rateLimitKey, 20, 600000);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult);
    }

    let jsonBody: unknown;
    try {
      jsonBody = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Request body must be valid JSON",
          },
        },
        { status: 400 }
      );
    }

    const parsed = UploadFinalizeSchema.safeParse(jsonBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid upload-finalize request payload",
            fieldErrors: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    const { storageKey, expectedRowVersion, confirmInvalidateApprovals } =
      parsed.data;

    // Strictly bind storageKey to authenticated tenant, document, and version path
    const expectedKeyPattern = new RegExp(
      `^tenants/${authContext.tenantId}/documents/${documentId}/versions/${versionId}/[0-9a-f-]{36}\\.pdf$`
    );
    if (!expectedKeyPattern.test(storageKey)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message:
              "storageKey does not match authorized tenant/document/version path",
          },
        },
        { status: 400 }
      );
    }

    // TX1: pre-flight RBAC, state, author ownership, optimistic lock, and DEC-04 gate
    await withTenantContext(authContext.tenantId, async (tx, tenantId) => {
      return await preflightDocumentPdfUpload(tx, {
        tenantId,
        userId: authContext.userId,
        documentId,
        versionId,
        expectedRowVersion,
        confirmInvalidateApprovals,
      });
    });

    // Stream-verify uploaded PDF object outside any DB transaction
    let verified: Awaited<ReturnType<typeof verifyUploadedPdfObject>>;
    try {
      verified = await verifyUploadedPdfObject(storageKey);
    } catch (verifyError) {
      await deleteDocumentPdf(storageKey).catch(() => {});
      const message =
        verifyError instanceof Error
          ? verifyError.message
          : "Uploaded PDF object failed verification";
      return NextResponse.json(
        {
          error: {
            code: "INVALID_FILE_PAYLOAD",
            message,
          },
        },
        { status: 400 }
      );
    }

    // TX2: short FOR UPDATE lock to persist metadata & audit log; clean up orphan blob on failure
    try {
      const result = await withTenantContext(
        authContext.tenantId,
        async (tx, tenantId) => {
          return await commitDocumentPdfUpload(tx, {
            tenantId,
            userId: authContext.userId,
            documentId,
            versionId,
            storageKey: verified.storageKey,
            fileSizeBytes: verified.fileSizeBytes,
            fileSha256: verified.fileSha256,
            expectedRowVersion,
            confirmInvalidateApprovals,
          });
        }
      );

      return NextResponse.json({ data: result }, { status: 200 });
    } catch (txError) {
      await deleteDocumentPdf(verified.storageKey).catch(() => {});
      throw txError;
    }
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            fieldErrors: error.fieldErrors,
          },
        },
        { status: error.httpStatus }
      );
    }

    const correlationId = createCorrelationId();
    logError("POST /api/documents/[documentId]/versions/[versionId]/upload-finalize failed", error, {
      correlationId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to finalize uploaded PDF (ref: ${correlationId})`,
        },
      },
      { status: 500 }
    );
  }
}
