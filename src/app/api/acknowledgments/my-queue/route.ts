import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiRequestContext } from "@/lib/auth/server";
import { withTenantContext } from "@/db/context";
import { assertActiveMembership } from "@/server/policies/membership.policy";
import { ReaderService } from "@/server/services/reader.service";
import { DomainError } from "@/types/errors";

const querySchema = z.object({
  status: z
    .string()
    .transform((val) => val.toUpperCase())
    .pipe(z.enum(["PENDING", "COMPLETED"]))
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authContext = await resolveApiRequestContext(request);
    if (!authContext) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required to access reading queue",
          },
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      status: searchParams.get("status") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters for reading queue",
            details: parsedQuery.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { status, page, limit } = parsedQuery.data;

    const queueData = await withTenantContext(
      authContext.tenantId,
      async (tx, tenantId) => {
        await assertActiveMembership(tx, tenantId, authContext.userId);

        return await ReaderService.getMyReadQueue(tx, {
          tenantId,
          userId: authContext.userId,
          status,
          page,
          limit,
        });
      }
    );

    return NextResponse.json(
      {
        success: true,
        data: queueData,
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

    console.error("Failed to fetch reading queue:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred while fetching the reading queue",
        },
      },
      { status: 500 }
    );
  }
}
