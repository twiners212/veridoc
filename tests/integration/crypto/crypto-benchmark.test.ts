import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import {
  computeFileSha256,
  computeDocumentSha256,
  verifyDocumentSha256,
  normalizeMarkdown,
  canonicalJsonStringify,
} from "@/lib/crypto/crypto.service";

describe("Cryptographic SHA-256 Engine & Performance Benchmark (DEC-06, REQ-NFR-001)", () => {
  describe("1. Streaming SHA-256 Performance Benchmark (REQ-NFR-001)", () => {
    it("computes SHA-256 for a 20MB buffer in well under 1.5s", async () => {
      const sizeBytes = 20 * 1024 * 1024; // 20 MB
      const buffer = Buffer.alloc(sizeBytes, 0x41); // 'A' repeated 20 million times

      const startTime = performance.now();
      const digest = await computeFileSha256(buffer);
      const durationMs = performance.now() - startTime;

      expect(durationMs).toBeLessThan(1500); // REQ-NFR-001 budget: < 1.5s
      expect(digest).toBeDefined();
      expect(digest).toHaveLength(64);
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    });

    it("computes SHA-256 over a streaming Node.js Readable stream", async () => {
      const chunks = [
        Buffer.from("%PDF-1.7\n"),
        Buffer.from("1 0 obj\n<< /Type /Catalog >>\nendobj\n"),
        Buffer.from("%%EOF\n"),
      ];
      const stream = Readable.from(chunks);

      const digest = await computeFileSha256(stream);
      expect(digest).toHaveLength(64);

      // Verify that streaming produces identical hash to contiguous buffer
      const fullBuffer = Buffer.concat(chunks);
      const bufferDigest = await computeFileSha256(fullBuffer);
      expect(digest).toBe(bufferDigest);
    });
  });

  describe("2. Canonical document_sha256 Payload Binding (DEC-06, BR-INT-01)", () => {
    const basePayload = {
      markdownContent: "# Standard Operating Procedure\n\n1. Wash hands\n2. Put on PPE\n",
      fileSha256: null,
      metadata: {
        documentCode: "SOP-BIO-001",
        tenantId: "11111111-1111-1111-1111-111111111111",
        title: "Cleanroom Biosafety Protocol",
        versionLabel: "v1.0",
      },
    };

    it("generates deterministic canonical document_sha256 digest", () => {
      const digest1 = computeDocumentSha256(basePayload);
      const digest2 = computeDocumentSha256(basePayload);

      expect(digest1).toBe(digest2);
      expect(digest1).toHaveLength(64);
    });

    it("normalizes CRLF line endings so Windows and Unix linebreaks produce identical hashes", () => {
      const unixPayload = {
        ...basePayload,
        markdownContent: "Line 1\nLine 2\nLine 3\n",
      };
      const windowsPayload = {
        ...basePayload,
        markdownContent: "Line 1\r\nLine 2\r\nLine 3\r\n",
      };

      const unixDigest = computeDocumentSha256(unixPayload);
      const windowsDigest = computeDocumentSha256(windowsPayload);

      expect(windowsDigest).toBe(unixDigest);
    });

    it("is key-order agnostic in metadata serialization", () => {
      const json1 = canonicalJsonStringify({ b: 2, a: 1, c: 3 });
      const json2 = canonicalJsonStringify({ c: 3, a: 1, b: 2 });
      expect(json1).toBe(json2);
      expect(json1).toBe('{"a":1,"b":2,"c":3}');
    });

    it("detects any modification to content, attached PDF digest, or metadata", () => {
      const baseDigest = computeDocumentSha256(basePayload);

      // Tamper markdown content
      const tamperedContentDigest = computeDocumentSha256({
        ...basePayload,
        markdownContent: basePayload.markdownContent + " ",
      });
      expect(tamperedContentDigest).not.toBe(baseDigest);

      // Tamper title
      const tamperedTitleDigest = computeDocumentSha256({
        ...basePayload,
        metadata: {
          ...basePayload.metadata,
          title: "Cleanroom Biosafety Protocol Edited",
        },
      });
      expect(tamperedTitleDigest).not.toBe(baseDigest);

      // Tamper attached PDF hash
      const pdfAttachedDigest = computeDocumentSha256({
        ...basePayload,
        fileSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      });
      expect(pdfAttachedDigest).not.toBe(baseDigest);
    });

    it("verifies hash in constant-time with verifyDocumentSha256", () => {
      const digest = computeDocumentSha256(basePayload);

      expect(verifyDocumentSha256(basePayload, digest)).toBe(true);
      expect(
        verifyDocumentSha256(
          basePayload,
          "0000000000000000000000000000000000000000000000000000000000000000"
        )
      ).toBe(false);
      expect(verifyDocumentSha256(basePayload, "invalid_length")).toBe(false);
    });
  });
});
