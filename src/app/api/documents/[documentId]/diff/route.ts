import { NextRequest, NextResponse } from "next/server";
import { resolveApiRequestContext } from "@/lib/auth/server";
import { withTenantContext } from "@/db/context";
import { assertActiveMembership } from "@/server/policies/membership.policy";
import { getDocumentVersionDiff } from "@/server/services/document-diff.service";
import { createCorrelationId, logError } from "@/lib/logger";
import { DomainError } from "@/types/errors";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;

    if (!UUID_REGEX.test(documentId)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid documentId UUID format",
          },
        },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const baseVersionId =
      searchParams.get("vA") || searchParams.get("baseVersionId");
    const targetVersionId =
      searchParams.get("vB") || searchParams.get("targetVersionId");

    if (
      !baseVersionId ||
      !targetVersionId ||
      !UUID_REGEX.test(baseVersionId) ||
      !UUID_REGEX.test(targetVersionId)
    ) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Query parameters vA (baseVersionId) and vB (targetVersionId) must be valid UUIDs",
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

    const diffResult = await withTenantContext(
      authContext.tenantId,
      async (tx, tenantId) => {
        // 1. Authorize membership
        const membership = await assertActiveMembership(
          tx,
          tenantId,
          authContext.userId
        );

        if (membership.role === "READER") {
          throw new DomainError(
            "FORBIDDEN",
            "Readers are not authorized to view document diffs",
            403
          );
        }

        // 2. Compute diff using domain service (enforces DEC-05)
        return await getDocumentVersionDiff(
          tx,
          tenantId,
          documentId,
          baseVersionId,
          targetVersionId
        );
      }
    );

    return NextResponse.json({ data: diffResult }, { status: 200 });
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
    logError("GET /api/documents/[documentId]/diff failed", error, {
      correlationId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to generate document diff (ref: ${correlationId})`,
        },
      },
      { status: 500 }
    );
  }
}
