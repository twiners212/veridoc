import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Readable } from "node:stream";

export interface CanonicalDocumentMetadata {
  documentCode?: string;
  document_code?: string;
  title: string;
  versionLabel?: string;
  version_label?: string;
  tenantId?: string;
  tenant_id?: string;
}

export interface CanonicalDocumentPayload {
  markdownContent?: string | null;
  fileSha256?: string | null;
  metadata: CanonicalDocumentMetadata;
}

/**
 * Normalizes Markdown text according to NFC Unicode normalization and LF line endings.
 */
export function normalizeMarkdown(content?: string | null): string {
  if (!content) return "";
  return content.normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Deterministic JSON stringifier that sorts object keys recursively.
 * Guarantees consistent string serialization across runtimes.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonStringify(item ?? null)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const pairs: string[] = [];
  for (const key of keys) {
    const val = (value as Record<string, unknown>)[key];
    if (val !== undefined) {
      pairs.push(`${JSON.stringify(key)}:${canonicalJsonStringify(val)}`);
    }
  }
  return `{${pairs.join(",")}}`;
}

/**
 * Computes streaming SHA-256 hash of a Buffer, Uint8Array, Node.js stream, or Web ReadableStream.
 * Meets REQ-NFR-001 performance budget (< 1.5s for 20MB files).
 */
export async function computeFileSha256(
  input: Buffer | Uint8Array | Readable | NodeJS.ReadableStream | ReadableStream<Uint8Array>
): Promise<string> {
  const hash = createHash("sha256");

  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    hash.update(input);
    return hash.digest("hex");
  }

  // Web ReadableStream (e.g., from File.stream() or Response.body)
  if (typeof (input as ReadableStream).getReader === "function") {
    const reader = (input as ReadableStream<Uint8Array>).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        hash.update(value);
      }
    }
    return hash.digest("hex");
  }

  // Node.js ReadableStream
  return new Promise<string>((resolve, reject) => {
    (input as NodeJS.ReadableStream).on("data", (chunk: Buffer | Uint8Array | string) => {
      hash.update(chunk);
    });
    (input as NodeJS.ReadableStream).on("end", () => {
      resolve(hash.digest("hex"));
    });
    (input as NodeJS.ReadableStream).on("error", (err: Error) => {
      reject(err);
    });
  });
}

/**
 * Computes canonical SHA-256 digest for document versions (DEC-06, BR-INT-01).
 * Formula: SHA-256(normalized_markdown || file_sha256 || canonical_metadata_json)
 * where:
 *   - normalized_markdown is NFC, LF-normalized Markdown text (empty string if PDF-only)
 *   - file_sha256 is the SHA-256 of the exact PDF object in storage (empty string if Markdown-only)
 *   - canonical_metadata_json is deterministic key-sorted JSON { document_code, tenant_id, title, version_label }
 */
export function computeDocumentSha256(canonicalPayload: CanonicalDocumentPayload): string {
  const normalizedMarkdown = normalizeMarkdown(canonicalPayload.markdownContent);
  const fileSha256 = canonicalPayload.fileSha256 ?? "";

  const meta = canonicalPayload.metadata;
  const documentCode = meta.documentCode ?? meta.document_code ?? "";
  const tenantId = meta.tenantId ?? meta.tenant_id ?? "";
  const title = meta.title ?? "";
  const versionLabel = meta.versionLabel ?? meta.version_label ?? "";

  const canonicalMetadataJson = canonicalJsonStringify({
    document_code: documentCode,
    tenant_id: tenantId,
    title,
    version_label: versionLabel,
  });

  const combinedPayload = `${normalizedMarkdown}${fileSha256}${canonicalMetadataJson}`;
  return createHash("sha256").update(combinedPayload, "utf8").digest("hex");
}

/**
 * Secure constant-time comparison of two SHA-256 digests.
 */
export function verifyDocumentSha256(
  canonicalPayload: CanonicalDocumentPayload,
  expectedSha256: string
): boolean {
  if (!expectedSha256 || typeof expectedSha256 !== "string" || expectedSha256.length !== 64) {
    return false;
  }
  const computed = computeDocumentSha256(canonicalPayload);
  const bufA = Buffer.from(computed, "hex");
  const bufB = Buffer.from(expectedSha256, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
