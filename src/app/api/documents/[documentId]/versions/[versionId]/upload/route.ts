import { NextRequest, NextResponse } from "next/server";
import { resolveApiRequestContext } from "@/lib/auth/server";
import { withTenantContext } from "@/db/context";
import { computeFileSha256 } from "@/lib/crypto/crypto.service";
import {
  deleteDocumentPdf,
  hasValidPdfMagicBytes,
  MAX_PDF_BYTES,
  uploadDocumentPdfStream,
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

    // Rate limit: 20 uploads / 10 min (600,000 ms) per tenant+user
    const rateLimitKey = `upload:${authContext.tenantId}:${authContext.userId}`;
    const rateLimitResult = await consumeDistributedRateLimit(rateLimitKey, 20, 600000);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Request must be multipart/form-data",
          },
        },
        { status: 400 }
      );
    }

    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_FILE_PAYLOAD",
            message: "File payload is required",
          },
        },
        { status: 400 }
      );
    }

    const blob = file as File;
    if (blob.size <= 0 || blob.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_FILE_PAYLOAD",
            message: `File size must be > 0 and <= 50MB (${MAX_PDF_BYTES} bytes)`,
          },
        },
        { status: 400 }
      );
    }

    // Read only the leading 5 bytes to validate %PDF- magic header before hashing/uploading
    const headerBytes = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    if (!hasValidPdfMagicBytes(headerBytes)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_FILE_PAYLOAD",
            message: "Invalid PDF magic bytes: file must begin with %PDF-",
          },
        },
        { status: 400 }
      );
    }

    const rawExpectedRowVersion = formData.get("expectedRowVersion");
    const expectedRowVersion =
      rawExpectedRowVersion !== null &&
      rawExpectedRowVersion !== undefined &&
      rawExpectedRowVersion !== ""
        ? Number(rawExpectedRowVersion)
        : undefined;

    const confirmInvalidateApprovals =
      formData.get("confirmInvalidateApprovals") === "true" ||
      formData.get("confirmInvalidateApprovals") === "1";

    // TX1: short pre-flight (membership, RBAC, state, author, optimistic lock, DEC-04 gate)
    const preflight = await withTenantContext(
      authContext.tenantId,
      async (tx, tenantId) => {
        return await preflightDocumentPdfUpload(tx, {
          tenantId,
          userId: authContext.userId,
          documentId,
          versionId,
          expectedRowVersion,
          confirmInvalidateApprovals,
        });
      }
    );

    // Stream SHA-256 and storage upload completely outside any PostgreSQL transaction
    const fileSha256 = await computeFileSha256(blob.stream());
    const uploadResult = await uploadDocumentPdfStream(
      authContext.tenantId,
      documentId,
      versionId,
      blob.stream(),
      blob.size,
      fileSha256
    );

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
            storageKey: uploadResult.storageKey,
            fileSizeBytes: uploadResult.fileSizeBytes,
            fileSha256: uploadResult.fileSha256,
            expectedRowVersion: expectedRowVersion ?? preflight.rowVersion,
            confirmInvalidateApprovals,
          });
        }
      );

      return NextResponse.json({ data: result }, { status: 201 });
    } catch (txError) {
      await deleteDocumentPdf(uploadResult.storageKey).catch(() => {});
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
    logError("POST /api/documents/[documentId]/versions/[versionId]/upload failed", error, {
      correlationId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to upload document PDF (ref: ${correlationId})`,
        },
      },
      { status: 500 }
    );
  }
}
