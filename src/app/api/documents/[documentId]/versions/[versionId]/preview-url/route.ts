import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { resolveApiRequestContext } from "@/lib/auth/server";
import { withTenantContext } from "@/db/context";
import { documentVersions } from "@/db/schema";
import { assertActiveMembership } from "@/server/policies/membership.policy";
import { assertCanViewDocumentVersion } from "@/server/policies/document-visibility.policy";
import { getVersionAssignedApproverIdsInTx } from "@/server/services/document.service";
import { createSignedPreviewUrl } from "@/lib/storage/storage.service";
import { createCorrelationId, logError } from "@/lib/logger";
import { DomainError } from "@/types/errors";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
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

    const result = await withTenantContext(authContext.tenantId, async (tx, tenantId) => {
      // 1. Resolve membership
      const membership = await assertActiveMembership(tx, tenantId, authContext.userId);

      // 2. Query version
      const [version] = await tx
        .select({
          id: documentVersions.id,
          documentId: documentVersions.documentId,
          lifecycleState: documentVersions.lifecycleState,
          authorId: documentVersions.authorId,
          fileStorageKey: documentVersions.fileStorageKey,
          documentSha256: documentVersions.documentSha256,
        })
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.id, versionId),
            eq(documentVersions.documentId, documentId),
            eq(documentVersions.tenantId, tenantId)
          )
        )
        .limit(1);

      if (!version) {
        throw new DomainError("NOT_FOUND", "Document version not found", 404);
      }

      // 3. Assert visibility policy (anti-enumeration throws 404 for Reader on draft)
      const assignedApproverIds =
        membership.role === "APPROVER_REVIEWER"
          ? await getVersionAssignedApproverIdsInTx(tx, tenantId, version.id)
          : undefined;

      assertCanViewDocumentVersion(membership, {
        authorId: version.authorId,
        lifecycleState: version.lifecycleState,
        assignedApproverIds,
      });

      // 4. Ensure PDF file exists
      if (!version.fileStorageKey) {
        throw new DomainError(
          "NOT_FOUND",
          "No PDF attachment found for this document version",
          404
        );
      }

      // 5. Generate signed URL with 120s TTL
      const { signedUrl, expiresAt } = await createSignedPreviewUrl(
        version.fileStorageKey,
        120
      );

      return {
        signedUrl,
        expiresAt: expiresAt.toISOString(),
        documentSha256: version.documentSha256,
      };
    });

    return NextResponse.json({ data: result }, { status: 200 });
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
    logError(
      "GET /api/documents/[documentId]/versions/[versionId]/preview-url failed",
      error,
      { correlationId }
    );
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to generate preview URL (ref: ${correlationId})`,
        },
      },
      { status: 500 }
    );
  }
}
