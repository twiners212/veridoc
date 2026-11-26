import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiRequestContext } from "@/lib/auth/server";
import { withTenantContext } from "@/db/context";
import { createSignedUploadUrl } from "@/lib/storage/storage.service";
import { preflightDocumentPdfUpload } from "@/server/services/document-storage.service";
import {
  consumeDistributedRateLimit,
  createRateLimitResponse,
} from "@/server/security/rate-limiter";
import { createCorrelationId, logError } from "@/lib/logger";
import { DomainError } from "@/types/errors";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UploadUrlRequestSchema = z.object({
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

    let parsedBody: z.infer<typeof UploadUrlRequestSchema> = {};
    const rawBody = await request.text();
    if (rawBody.trim().length > 0) {
      let jsonBody: unknown;
      try {
        jsonBody = JSON.parse(rawBody);
      } catch {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid JSON request body",
            },
          },
          { status: 400 }
        );
      }

      const validated = UploadUrlRequestSchema.safeParse(jsonBody);
      if (!validated.success) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid upload-url request payload",
              fieldErrors: validated.error.flatten().fieldErrors,
            },
          },
          { status: 400 }
        );
      }
      parsedBody = validated.data;
    }

    // TX1: pre-flight RBAC, state, author ownership, optimistic lock, and DEC-04 gate
    await withTenantContext(authContext.tenantId, async (tx, tenantId) => {
      return await preflightDocumentPdfUpload(tx, {
        tenantId,
        userId: authContext.userId,
        documentId,
        versionId,
        expectedRowVersion: parsedBody.expectedRowVersion,
        confirmInvalidateApprovals: parsedBody.confirmInvalidateApprovals,
      });
    });

    const storageKey = `tenants/${authContext.tenantId}/documents/${documentId}/versions/${versionId}/${randomUUID()}.pdf`;
    const signed = await createSignedUploadUrl(storageKey);

    return NextResponse.json(
      {
        data: {
          signedUrl: signed.signedUrl,
          token: signed.token,
          storageKey: signed.storageKey,
        },
      },
      { status: 200 }
    );
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
    logError("POST /api/documents/[documentId]/versions/[versionId]/upload-url failed", error, {
      correlationId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to generate upload URL (ref: ${correlationId})`,
        },
      },
      { status: 500 }
    );
  }
}
