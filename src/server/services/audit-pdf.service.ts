import "server-only";
import type { AuditPacketExport } from "./audit-export.service";

/**
 * Escapes characters for PDF literal strings (ASCII parentheses and backslashes).
 */
function escapePdfString(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/•/g, "-")
    .replace(/§/g, "Section ")
    .replace(/—/g, "--")
    .replace(/–/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    // Non-Latin scripts fall back to "?" under WinAnsiEncoding
    .replace(/[^\x20-\x7E]/g, "?");
}

class PdfDocumentBuilder {
  private pages: string[] = [];
  private currentPageContent: string[] = [];
  private currentY: number = 740;
  private readonly leftMargin = 36;
  private readonly rightMargin = 576;
  private readonly contentWidth = 540;
  private readonly bottomMargin = 75;
  private pageCount: number = 0;

  constructor() {
    this.newPage();
  }

  public getCurrentY(): number {
    return this.currentY;
  }

  public setCurrentY(y: number): void {
    this.currentY = y;
  }

  public adjustY(delta: number): void {
    this.currentY += delta;
  }

  public newPage(): void {
    if (this.currentPageContent.length > 0) {
      this.pages.push(this.currentPageContent.join("\n"));
      this.currentPageContent = [];
    }
    this.pageCount++;
    this.currentY = 740;
  }

  public ensureSpace(neededHeight: number): void {
    if (this.currentY - neededHeight < this.bottomMargin) {
      this.newPage();
    }
  }

  public drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    fillRgb?: [number, number, number],
    strokeRgb?: [number, number, number],
    lineWidth: number = 1
  ): void {
    let cmd = `q ${lineWidth} w `;
    if (fillRgb) {
      cmd += `${fillRgb[0]} ${fillRgb[1]} ${fillRgb[2]} rg `;
    }
    if (strokeRgb) {
      cmd += `${strokeRgb[0]} ${strokeRgb[1]} ${strokeRgb[2]} RG `;
    }
    cmd += `${x} ${y} ${width} ${height} re `;
    if (fillRgb && strokeRgb) {
      cmd += "B Q";
    } else if (fillRgb) {
      cmd += "f Q";
    } else {
      cmd += "S Q";
    }
    this.currentPageContent.push(cmd);
  }

  public drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    strokeRgb: [number, number, number] = [0.8, 0.8, 0.8],
    lineWidth: number = 1
  ): void {
    this.currentPageContent.push(
      `q ${lineWidth} w ${strokeRgb[0]} ${strokeRgb[1]} ${strokeRgb[2]} RG ${x1} ${y1} m ${x2} ${y2} l S Q`
    );
  }

  public addText(
    text: string,
    font: "/F1" | "/F2" | "/F3" | "/F4",
    size: number,
    rgb: [number, number, number] = [0.1, 0.1, 0.1],
    x?: number,
    y?: number
  ): void {
    const targetX = x ?? this.leftMargin;
    const targetY = y ?? this.currentY;
    const escaped = escapePdfString(text);
    this.currentPageContent.push(
      `BT ${font} ${size} Tf ${rgb[0]} ${rgb[1]} ${rgb[2]} rg 1 0 0 1 ${targetX} ${targetY} Tm (${escaped}) Tj ET`
    );
  }

  public addTextLine(
    text: string,
    font: "/F1" | "/F2" | "/F3" | "/F4",
    size: number,
    lineHeight: number = size + 4,
    rgb: [number, number, number] = [0.1, 0.1, 0.1],
    x?: number
  ): void {
    this.ensureSpace(lineHeight);
    this.addText(text, font, size, rgb, x, this.currentY);
    this.currentY -= lineHeight;
  }

  public addSectionHeader(title: string): void {
    this.ensureSpace(35);
    this.currentY -= 6;
    this.drawLine(this.leftMargin, this.currentY + 14, this.rightMargin, this.currentY + 14, [0.85, 0.87, 0.9]);
    this.addText(title.toUpperCase(), "/F2", 9, [0.2, 0.3, 0.5], this.leftMargin, this.currentY);
    this.currentY -= 14;
  }

  public addKeyValueRow(key: string, value: string, font: "/F1" | "/F3" = "/F1", valueRgb?: [number, number, number]): void {
    this.ensureSpace(14);
    this.addText(key, "/F2", 8.5, [0.4, 0.45, 0.5], this.leftMargin, this.currentY);
    this.addText(value, font, 8.5, valueRgb ?? [0.1, 0.1, 0.1], this.leftMargin + 130, this.currentY);
    this.currentY -= 13;
  }

  public build(metadata: { documentCode?: string; timestamp: string }): Buffer {
    // Finish active page
    if (this.currentPageContent.length > 0) {
      this.pages.push(this.currentPageContent.join("\n"));
      this.currentPageContent = [];
    }

    const totalPages = this.pages.length;

    // Apply header & footer to each page
    const finalizedPageStreams: string[] = this.pages.map((content, idx) => {
      const pageNum = idx + 1;
      const footerLines = [
        `q 1 w 0.85 0.87 0.9 RG 36 50 m 576 50 l S Q`,
        `BT /F1 7.5 Tf 0.4 0.45 0.5 rg 1 0 0 1 36 40 Tm (${escapePdfString(
          `VeriDoc Governance Audit Packet • Scope: ${metadata.documentCode || "Tenant Summary"} • ${metadata.timestamp}`
        )}) Tj ET`,
        `BT /F2 7.5 Tf 0.2 0.3 0.6 rg 1 0 0 1 520 40 Tm (${escapePdfString(
          `Page ${pageNum} of ${totalPages}`
        )}) Tj ET`,
        `BT /F1 6.5 Tf 0.5 0.5 0.55 rg 1 0 0 1 36 30 Tm (${escapePdfString(
          "Notice on Security Boundaries (DEC-08): Secured via append-only database controls and application SHA-256 hash chaining."
        )}) Tj ET`,
        `BT /F1 6.5 Tf 0.5 0.5 0.55 rg 1 0 0 1 36 22 Tm (${escapePdfString(
          "Cloud DBA and infrastructure access remain governed by IAM policies. Out-of-the-box FDA 21 CFR Part 11 validation packages or absolute tamper-proof claims are not provided in Slice 1 (DEC-02)."
        )}) Tj ET`,
      ];
      return `${content}\n${footerLines.join("\n")}`;
    });

    // Assemble PDF 1.4 binary structure
    const objects: string[] = [];
    const objectOffsets: number[] = [];
    let currentOffset = 0;

    const appendObject = (objContent: string): number => {
      objectOffsets.push(currentOffset);
      const str = `${objects.length + 1} 0 obj\n${objContent}\nendobj\n`;
      currentOffset += Buffer.byteLength(str, "utf8");
      objects.push(str);
      return objects.length;
    };

    const header = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    currentOffset = Buffer.byteLength(header, "utf8");

    // Obj 1: Catalog
    appendObject(`<< /Type /Catalog /Pages 2 0 R >>`);

    // Obj 2: Pages (placeholder, updated below)
    const pageObjNumbers: number[] = [];
    // Page objects start from Obj 7
    for (let i = 0; i < totalPages; i++) {
      pageObjNumbers.push(7 + i * 2);
    }
    const kidsArray = pageObjNumbers.map((num) => `${num} 0 R`).join(" ");
    objects[1] = `2 0 obj\n<< /Type /Pages /Kids [${kidsArray}] /Count ${totalPages} >>\nendobj\n`;

    // Calculate actual offset for obj 2
    objectOffsets[1] = objectOffsets[0] + Buffer.byteLength(objects[0], "utf8");
    currentOffset = objectOffsets[1] + Buffer.byteLength(objects[1], "utf8");

    // Standard Font Objects 3, 4, 5, 6
    appendObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
    appendObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
    appendObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>`);
    appendObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>`);

    // For each page: Page object + Content stream object
    for (let i = 0; i < totalPages; i++) {
      const contentStream = finalizedPageStreams[i];
      const streamLength = Buffer.byteLength(contentStream, "utf8");
      const streamObjIndex = 8 + i * 2;

      // Page Object
      appendObject(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${streamObjIndex} 0 R >>`
      );

      // Stream Object
      appendObject(
        `<< /Length ${streamLength} >>\nstream\n${contentStream}\nendstream`
      );
    }

    // Cross-reference table
    const startXref = currentOffset;
    const totalObjs = objects.length;
    let xref = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;

    for (let i = 0; i < totalObjs; i++) {
      const offsetStr = objectOffsets[i].toString().padStart(10, "0");
      xref += `${offsetStr} 00000 n \n`;
    }

    const trailer = `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

    const fullPdf = header + objects.join("") + xref + trailer;
    return Buffer.from(fullPdf, "utf8");
  }
}

/**
 * Builds a printable vector PDF 1.4 Audit Packet document from structured export data.
 */
export function buildAuditPacketPdf(exportData: AuditPacketExport): Buffer {
  const doc = new PdfDocumentBuilder();
  const meta = exportData.exportMetadata;
  const verif = exportData.verification;

  // Header Banner
  doc.drawRect(36, 725, 540, 42, [0.0, 0.22, 0.69]);
  doc.addText("VERIDOC GOVERNANCE AUDIT PACKET", "/F2", 13, [1, 1, 1], 46, 747);
  doc.addText(
    "CRYPTOGRAPHIC AUDIT TRAIL & CONTROLLED COMPLIANCE LEDGER",
    "/F1",
    7.5,
    [0.85, 0.9, 1],
    46,
    734
  );
  doc.addText(`TENANT: ${meta.tenant.name.toUpperCase()}`, "/F2", 8.5, [1, 1, 1], 380, 747);
  doc.addText(`EXPORT ID: ${meta.exportId.slice(0, 18)}...`, "/F3", 7, [0.8, 0.85, 0.95], 380, 734);

  // Spacing after header
  doc.setCurrentY(705);

  // Chain Verification Status Box
  if (verif.chainVerified) {
    doc.drawRect(36, 645, 540, 52, [0.94, 0.99, 0.95], [0.52, 0.85, 0.6], 1.5);
    doc.addText(
      "[VERIFIED] APPEND-ONLY HASH CHAIN INTEGRITY (DEC-08)",
      "/F2",
      9.5,
      [0.08, 0.45, 0.2],
      46,
      680
    );
    doc.addText(
      `Replayed ${verif.totalEntriesInChain.toLocaleString()} blocks sequentially with zero payload tampering or sequence gaps.`,
      "/F1",
      8,
      [0.15, 0.35, 0.2],
      46,
      667
    );
    doc.addText(
      `Ledger Head Hash: ${verif.headHash ?? "GENESIS"}`,
      "/F3",
      7.5,
      [0.1, 0.25, 0.15],
      46,
      654
    );
  } else {
    doc.drawRect(36, 645, 540, 52, [1.0, 0.95, 0.95], [0.9, 0.3, 0.3], 1.5);
    doc.addText(
      "[INTEGRITY FAILURE DETECTED] HASH CHAIN MISMATCH",
      "/F2",
      9.5,
      [0.75, 0.1, 0.1],
      46,
      680
    );
    doc.addText(
      `Failure Reason: ${verif.failureReason ?? "Hash mismatch detected in chain replay."}`,
      "/F1",
      8,
      [0.6, 0.1, 0.1],
      46,
      667
    );
    doc.addText(
      `Failed Sequence Number: #${verif.failedSequenceNumber ?? "N/A"}`,
      "/F3",
      7.5,
      [0.5, 0.1, 0.1],
      46,
      654
    );
  }

  doc.setCurrentY(630);

  // Metadata Section
  doc.addSectionHeader("1. Audit Packet Overview & System Metadata");
  doc.addKeyValueRow("Generated At (UTC):", meta.generatedAt);
  doc.addKeyValueRow("Generated By:", `${meta.generatedBy.fullName} (${meta.generatedBy.role})`);
  doc.addKeyValueRow("Tenant / Organization:", `${meta.tenant.name} [slug: ${meta.tenant.slug}]`);
  doc.addKeyValueRow(
    "Packet Scope:",
    `${exportData.scope.type} (${exportData.scope.documentCount} docs, ${exportData.scope.versionCount} versions, ${exportData.scope.totalAuditEntriesInScope} audit entries)`
  );
  doc.addKeyValueRow("Compliance Assist:", exportData.complianceDisclosure.standard);
  doc.addKeyValueRow("Digest Algorithm:", "FIPS 180-4 SHA-256 (Bound to payload & sign-offs)");

  // Controlled Documents & Lineage
  doc.addSectionHeader("2. Controlled Documents & Cryptographic Payloads");
  if (exportData.documents.length === 0) {
    doc.addTextLine(
      "No controlled documents matched the export filter.",
      "/F1",
      8.5,
      13,
      [0.4, 0.4, 0.45]
    );
  } else {
    for (let docIdx = 0; docIdx < exportData.documents.length; docIdx++) {
      const controlledDoc = exportData.documents[docIdx];
      if (docIdx > 0) {
        doc.ensureSpace(20);
        doc.drawLine(36, doc.getCurrentY() + 4, 576, doc.getCurrentY() + 4, [0.85, 0.87, 0.9]);
        doc.adjustY(-8);
      }

      if (controlledDoc.versions.length === 0) {
        doc.addKeyValueRow("Document Code:", controlledDoc.documentCode);
        doc.addKeyValueRow("Versions:", "No versions in export scope");
        continue;
      }

      for (let verIdx = 0; verIdx < controlledDoc.versions.length; verIdx++) {
        const version = controlledDoc.versions[verIdx];
        if (verIdx > 0) {
          doc.ensureSpace(16);
          doc.drawLine(46, doc.getCurrentY() + 4, 566, doc.getCurrentY() + 4, [0.92, 0.93, 0.95], 0.5);
          doc.adjustY(-6);
        }

        doc.addKeyValueRow("Document Code:", controlledDoc.documentCode);
        doc.addKeyValueRow("Version Label:", `${version.versionLabel} (${version.lifecycleState})`);
        doc.addKeyValueRow("Document Title:", version.title);
        doc.addKeyValueRow("Format & Author:", `${version.contentFormat} • Author: ${version.author.name}`);
        doc.addKeyValueRow(
          "Bound SHA-256 Digest:",
          version.documentSha256 ?? "N/A",
          "/F3",
          [0.0, 0.25, 0.6]
        );
        if (version.publishedAt) {
          doc.addKeyValueRow(
            "Publication Details:",
            `Published ${version.publishedAt} by ${version.publishedBy?.name ?? "Admin"}`
          );
        }

        // Digital Sign-Off History across all cycles
        const cyclesWithSteps = version.approvalCycles.filter((c) => c.steps.length > 0);
        if (cyclesWithSteps.length > 0) {
          doc.addSectionHeader(
            `3. Sequential Digital Sign-Off History - ${controlledDoc.documentCode} ${version.versionLabel} (REQ-FR-402, DEC-03)`
          );
          for (const approvalCycle of cyclesWithSteps) {
            doc.ensureSpace(16);
            doc.addTextLine(
              `Cycle #${approvalCycle.cycleNumber} (${approvalCycle.status})${
                approvalCycle.invalidatedReason ? ` • Reason: ${approvalCycle.invalidatedReason}` : ""
              }`,
              "/F2",
              8,
              13,
              [0.25, 0.3, 0.45]
            );
            for (const step of approvalCycle.steps) {
              doc.ensureSpace(42);
              const actedText = step.actedBy
                ? `${step.actedBy.fullName} (${step.actedBy.role ?? "Approver"})`
                : `Assigned: ${step.assignedApprover.name}`;
              const statusColor: [number, number, number] =
                step.status === "APPROVED"
                  ? [0.08, 0.45, 0.2]
                  : step.status === "PENDING"
                  ? [0.6, 0.4, 0.0]
                  : [0.5, 0.5, 0.5];

              doc.addText(
                `Stage ${step.stepOrder}: ${step.status}`,
                "/F2",
                8.5,
                statusColor,
                36
              );
              doc.addText(
                actedText,
                "/F1",
                8.5,
                [0.15, 0.15, 0.15],
                150
              );
              doc.addText(
                step.actedAt ? step.actedAt : "Pending",
                "/F1",
                7.5,
                [0.4, 0.4, 0.4],
                420
              );
              doc.adjustY(-12);

              if (step.decisionIntent) {
                doc.addText(
                  `Intent: "${step.decisionIntent}" • Auth: ${step.authMethod ?? "PASSWORD_REAUTH"} • IP: ${step.actedBy?.ipAddress ?? "Recorded"}`,
                  "/F1",
                  7.5,
                  [0.35, 0.35, 0.4],
                  50
                );
                doc.adjustY(-11);
              }

              if (step.signedDocumentSha256) {
                doc.addText(
                  `Digest Bound: ${step.signedDocumentSha256}`,
                  "/F3",
                  7,
                  [0.2, 0.3, 0.5],
                  50
                );
                doc.adjustY(-13);
              }
            }
          }
        }

        // Frontline Read Acknowledgments
        const readAck = version.readAcknowledgments;
        if (readAck && (readAck.summary.totalAssigned > 0 || readAck.records.length > 0)) {
          doc.addSectionHeader(
            `4. Frontline Read Acknowledgments - ${controlledDoc.documentCode} ${version.versionLabel} (REQ-FR-503, DEC-01)`
          );
          doc.addKeyValueRow(
            "Acknowledgment Progress:",
            `${readAck.summary.totalAcknowledged} / ${readAck.summary.totalAssigned} completed (${readAck.summary.completionRatePercent}%) • Overdue: ${readAck.summary.totalOverdue}`
          );

          if (readAck.records.length > 0) {
            doc.ensureSpace(20);
            doc.addText(
              "Verified Reader Attestations (Dwell Time >= 10s, Scroll >= 90%):",
              "/F2",
              8,
              [0.3, 0.3, 0.35]
            );
            doc.adjustY(-12);

            for (const ack of readAck.records.slice(0, 10)) {
              doc.ensureSpace(12);
              doc.addText(
                `• ${ack.user.name} • ${ack.acknowledgedAt} • Dwell: ${ack.dwellTimeSeconds}s • Scroll: ${ack.maxScrollPercent}% • IP: ${ack.acknowledgedIp ?? "Logged"}`,
                "/F1",
                7.5,
                [0.2, 0.2, 0.2],
                46
              );
              doc.adjustY(-11);
            }
            if (readAck.records.length > 10) {
              doc.ensureSpace(14);
              doc.addText(
                `[TRUNCATED] Showing 10 of ${readAck.records.length} verified reader attestations (${readAck.records.length - 10} omitted; see JSON export for complete list).`,
                "/F1",
                7.5,
                [0.6, 0.35, 0.0],
                46
              );
              doc.adjustY(-12);
            }
          }
        }
      }
    }
  }

  // Audit Ledger Trail Slice
  if (exportData.auditTrail.length > 0 || exportData.scope.auditTrailTruncated) {
    doc.addSectionHeader("5. Hash-Chained Audit Trail Slice (DEC-08)");
    if (exportData.scope.auditTrailTruncated) {
      doc.ensureSpace(16);
      doc.addText(
        `[SCOPE TRUNCATED] ${exportData.scope.totalAuditEntriesInScope.toLocaleString()} total entries matched scope; export capped at ${exportData.auditTrail.length.toLocaleString()} most recent entries.`,
        "/F2",
        7.5,
        [0.7, 0.2, 0.1],
        36
      );
      doc.adjustY(-13);
    }
    for (const log of exportData.auditTrail.slice(0, 20)) {
      doc.ensureSpace(14);
      doc.addText(`#${log.sequenceNumber}`, "/F4", 7.5, [0.0, 0.22, 0.69], 36);
      doc.addText(log.createdAt.replace("T", " ").replace("Z", ""), "/F3", 7, [0.4, 0.4, 0.4], 80);
      doc.addText(log.eventType, "/F2", 7.5, [0.2, 0.2, 0.2], 200);
      doc.addText(log.actorRole ?? "SYSTEM", "/F1", 7, [0.4, 0.4, 0.4], 340);
      doc.addText(`${log.entryHash.slice(0, 16)}...`, "/F3", 7, [0.3, 0.35, 0.4], 440);
      doc.adjustY(-12);
    }
    if (exportData.auditTrail.length > 20) {
      doc.ensureSpace(14);
      doc.addText(
        `[TRUNCATED IN PDF] Showing 20 of ${exportData.auditTrail.length} exported ledger entries (${exportData.auditTrail.length - 20} omitted; see JSON export for complete chain payload).`,
        "/F1",
        7.5,
        [0.6, 0.35, 0.0],
        36
      );
      doc.adjustY(-12);
    }
  }

  return doc.build({
    documentCode:
      exportData.documents.length === 1
        ? exportData.documents[0]?.documentCode
        : undefined,
    timestamp: meta.generatedAt,
  });
}
