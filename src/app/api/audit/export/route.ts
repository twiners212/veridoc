import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiRequestContext } from "@/lib/auth/server";
import { withTenantContext } from "@/db/context";
import { generateAuditPacketData } from "@/server/services/audit-export.service";
import { buildAuditPacketPdf } from "@/server/services/audit-pdf.service";
import {
  consumeDistributedRateLimit,
  createRateLimitResponse,
} from "@/server/security/rate-limiter";
import { createCorrelationId, logError } from "@/lib/logger";
import { DomainError } from "@/types/errors";

const querySchema = z.object({
  documentId: z.string().uuid().optional(),
  versionId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  format: z.enum(["json", "pdf"]).default("json"),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authContext = await resolveApiRequestContext(request);
    if (!authContext) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required to export audit packet",
          },
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      documentId: searchParams.get("documentId") ?? undefined,
      versionId: searchParams.get("versionId") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      format: searchParams.get("format") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters for audit packet export",
            details: parsedQuery.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { documentId, versionId, startDate, endDate, format } = parsedQuery.data;

    // Enforce rate limiting: 10 exports per 10 minutes (600,000 ms) per tenant+user
    const rateLimitKey = `audit-export:${authContext.tenantId}:${authContext.userId}`;
    const rateLimitResult = await consumeDistributedRateLimit(rateLimitKey, 10, 600000);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult);
    }

    const packetData = await withTenantContext(
      authContext.tenantId,
      async (tx, tenantId) => {
        return await generateAuditPacketData(tx, {
          tenantId,
          actorUserId: authContext.userId,
          filter: {
            documentId,
            versionId,
            startDate,
            endDate,
            format,
          },
        });
      }
    );

    const targetDoc = packetData.documents[0];
    const scopeSlug = targetDoc
      ? targetDoc.documentCode.toLowerCase().replace(/[^a-z0-9_-]/g, "-")
      : packetData.exportMetadata.tenant.slug;
    const timestampStr = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-");

    if (format === "pdf") {
      const pdfBuffer = buildAuditPacketPdf(packetData);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="audit-packet-${scopeSlug}-${timestampStr}.pdf"`,
          "Content-Length": String(pdfBuffer.length),
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // Default JSON export
    const jsonString = JSON.stringify(packetData, null, 2);
    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-packet-${scopeSlug}-${timestampStr}.json"`,
        "Content-Length": String(Buffer.byteLength(jsonString, "utf8")),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
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
    logError("GET /api/audit/export failed", error, { correlationId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: `An unexpected error occurred while exporting audit packet (ref: ${correlationId})`,
        },
      },
      { status: 500 }
    );
  }
}
