import { NextRequest, NextResponse } from "next/server";
import { resolveApiRequestContext } from "@/lib/auth/server";
import { withTenantContext } from "@/db/context";
import { assertActiveMembership } from "@/server/policies/membership.policy";
import { assertCanViewAuditLogs } from "@/server/policies/rbac.policy";
import { verifyTenantAuditChainInTx } from "@/server/services/audit.service";
import { createCorrelationId, logError } from "@/lib/logger";
import { DomainError } from "@/types/errors";

async function handleVerification(request: NextRequest): Promise<NextResponse> {
  try {
    const authContext = await resolveApiRequestContext(request);
    if (!authContext) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required to verify audit chain",
          },
        },
        { status: 401 }
      );
    }

    const verificationResult = await withTenantContext(
      authContext.tenantId,
      async (tx, tenantId) => {
        const membership = await assertActiveMembership(
          tx,
          tenantId,
          authContext.userId
        );
        assertCanViewAuditLogs(membership);

        return await verifyTenantAuditChainInTx(tx, tenantId);
      }
    );

    return NextResponse.json(
      {
        success: true,
        data: verificationResult,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
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
    logError("GET/POST /api/audit/verify failed", error, { correlationId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: `An unexpected error occurred while verifying the audit chain (ref: ${correlationId})`,
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleVerification(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleVerification(request);
}
