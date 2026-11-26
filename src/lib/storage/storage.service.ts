import "server-only";
import dns from "node:dns";
import { randomUUID } from "node:crypto";
import { computeFileSha256 } from "../crypto/crypto.service";

// Ensure IPv4 lookup precedence on Node.js / Windows to prevent IPv6 connect timeouts
try {
  dns.setDefaultResultOrder?.("ipv4first");
} catch {
  // Ignore in environments where setDefaultResultOrder is not supported
}

export const MAX_PDF_BYTES = 52428800; // 50MB (REQ-FR-101)
const UPLOAD_FETCH_TIMEOUT_MS = 30000;
const CONTROL_FETCH_TIMEOUT_MS = 15000;

export interface UploadPdfResult {
  storageKey: string;
  fullPath: string;
  fileSizeBytes: number;
  fileSha256: string;
}

export interface SignedPreviewUrlResult {
  signedUrl: string;
  expiresAt: Date;
}

export interface SignedUploadUrlResult {
  signedUrl: string;
  token: string;
  storageKey: string;
}

export interface VerifyUploadedPdfResult {
  storageKey: string;
  fileSizeBytes: number;
  fileSha256: string;
}

export function hasValidPdfMagicBytes(bytes: Uint8Array | number[]): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

function getStorageConfig() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required for server-side private storage operations"
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for server-side private storage operations"
    );
  }

  const bucket =
    process.env.SUPABASE_STORAGE_BUCKET || "veridoc-controlled-docs";

  return { supabaseUrl: supabaseUrl.replace(/\/+$/, ""), serviceRoleKey, bucket };
}

function normalizeStorageUrl(supabaseUrl: string, rawUrl: string): string {
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  if (rawUrl.startsWith("/storage/v1")) {
    return `${supabaseUrl}${rawUrl}`;
  }
  return `${supabaseUrl}/storage/v1${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
}

function stripBucketPrefix(filePath: string, bucket: string): string {
  return filePath.startsWith(`${bucket}/`)
    ? filePath.slice(bucket.length + 1)
    : filePath;
}

/**
 * Uploads a verified controlled SOP PDF buffer to private Supabase Storage.
 * Object path: tenants/{tenantId}/documents/{documentId}/versions/{versionId}/{uuid}.pdf
 */
export async function uploadDocumentPdf(
  tenantId: string,
  documentId: string,
  versionId: string,
  fileBuffer: Buffer | Uint8Array,
  _fileName?: string
): Promise<UploadPdfResult> {
  const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();

  const fileUuid = randomUUID();
  const storageKey = `tenants/${tenantId}/documents/${documentId}/versions/${versionId}/${fileUuid}.pdf`;
  const fileSha256 = await computeFileSha256(fileBuffer);
  const fileSizeBytes = fileBuffer.length;

  const endpoint = `${supabaseUrl}/storage/v1/object/${bucket}/${storageKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/pdf",
      "x-upsert": "true",
    },
    body: Buffer.from(fileBuffer),
    signal: AbortSignal.timeout(UPLOAD_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to upload document PDF to Supabase Storage (${response.status}): ${errorText}`
    );
  }

  return {
    storageKey,
    fullPath: `${bucket}/${storageKey}`,
    fileSizeBytes,
    fileSha256,
  };
}

/**
 * Streams a verified controlled SOP PDF directly to private Supabase Storage
 * without buffering the full payload in memory.
 */
export async function uploadDocumentPdfStream(
  tenantId: string,
  documentId: string,
  versionId: string,
  fileStream: ReadableStream<Uint8Array>,
  fileSizeBytes: number,
  fileSha256: string
): Promise<UploadPdfResult> {
  const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();

  const fileUuid = randomUUID();
  const storageKey = `tenants/${tenantId}/documents/${documentId}/versions/${versionId}/${fileUuid}.pdf`;
  const endpoint = `${supabaseUrl}/storage/v1/object/${bucket}/${storageKey}`;

  const requestInit: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/pdf",
      "Content-Length": String(fileSizeBytes),
      "x-upsert": "true",
    },
    body: fileStream,
    duplex: "half",
    signal: AbortSignal.timeout(UPLOAD_FETCH_TIMEOUT_MS),
  };

  const response = await fetch(endpoint, requestInit);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to upload document PDF to Supabase Storage (${response.status}): ${errorText}`
    );
  }

  return {
    storageKey,
    fullPath: `${bucket}/${storageKey}`,
    fileSizeBytes,
    fileSha256,
  };
}

/**
 * Generates a short-lived signed URL for direct client PUT upload to private Supabase Storage.
 */
export async function createSignedUploadUrl(
  storageKey: string
): Promise<SignedUploadUrlResult> {
  const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();
  const cleanPath = stripBucketPrefix(storageKey, bucket);
  const endpoint = `${supabaseUrl}/storage/v1/object/upload/sign/${bucket}/${cleanPath}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
      "x-upsert": "true",
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(CONTROL_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create signed upload URL from Supabase Storage (${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as {
    url?: string;
    signedURL?: string;
    token?: string;
  };
  const rawUrl = data.signedURL ?? data.url;
  if (!rawUrl) {
    throw new Error("Supabase Storage response missing signed upload url");
  }

  const signedUrl = normalizeStorageUrl(supabaseUrl, rawUrl);
  let token = data.token ?? "";
  if (!token) {
    try {
      token = new URL(signedUrl).searchParams.get("token") ?? "";
    } catch {
      token = "";
    }
  }

  return {
    signedUrl,
    token,
    storageKey: cleanPath,
  };
}

/**
 * Downloads a directly-uploaded PDF object as a stream, verifies size (0 < size <= 50MB)
 * and %PDF- magic bytes on the leading bytes, and computes its SHA-256 without full-file buffering.
 */
export async function verifyUploadedPdfObject(
  storageKey: string
): Promise<VerifyUploadedPdfResult> {
  const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();
  const cleanPath = stripBucketPrefix(storageKey, bucket);
  const endpoint = `${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${cleanPath}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    signal: AbortSignal.timeout(CONTROL_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Uploaded PDF object could not be retrieved for verification (${response.status}): ${errorText}`
    );
  }

  const rawContentLength = response.headers.get("content-length");
  if (rawContentLength !== null) {
    const declaredSize = Number(rawContentLength);
    if (
      !Number.isFinite(declaredSize) ||
      declaredSize <= 0 ||
      declaredSize > MAX_PDF_BYTES
    ) {
      await response.body?.cancel().catch(() => {});
      throw new Error(
        `File size must be > 0 and <= 50MB (${MAX_PDF_BYTES} bytes)`
      );
    }
  }

  if (!response.body) {
    throw new Error("Storage response missing object body");
  }

  const reader = response.body.getReader();
  const headerBytes: number[] = [];
  let headerChecked = false;
  let totalBytes = 0;

  const inspectionStream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (totalBytes <= 0 || totalBytes > MAX_PDF_BYTES) {
            throw new Error(
              `File size must be > 0 and <= 50MB (${MAX_PDF_BYTES} bytes)`
            );
          }
          if (!hasValidPdfMagicBytes(headerBytes)) {
            throw new Error(
              "Invalid PDF magic bytes: file must begin with %PDF-"
            );
          }
          controller.close();
          return;
        }

        if (value && value.byteLength > 0) {
          totalBytes += value.byteLength;
          if (totalBytes > MAX_PDF_BYTES) {
            await reader.cancel().catch(() => {});
            throw new Error(
              `File size must be > 0 and <= 50MB (${MAX_PDF_BYTES} bytes)`
            );
          }

          if (!headerChecked) {
            for (let i = 0; i < value.length && headerBytes.length < 5; i++) {
              headerBytes.push(value[i]);
            }
            if (headerBytes.length === 5) {
              headerChecked = true;
              if (!hasValidPdfMagicBytes(headerBytes)) {
                await reader.cancel().catch(() => {});
                throw new Error(
                  "Invalid PDF magic bytes: file must begin with %PDF-"
                );
              }
            }
          }

          controller.enqueue(value);
        }
      } catch (err) {
        await reader.cancel().catch(() => {});
        controller.error(err);
      }
    },
    cancel() {
      return reader.cancel().catch(() => {});
    },
  });

  const fileSha256 = await computeFileSha256(inspectionStream);

  return {
    storageKey: cleanPath,
    fileSizeBytes: totalBytes,
    fileSha256,
  };
}

/**
 * Generates a short-lived signed URL for previewing private document PDFs (120s TTL).
 */
export async function createSignedPreviewUrl(
  filePath: string,
  expiresInSeconds = 120
): Promise<SignedPreviewUrlResult> {
  const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();

  // Strip bucket prefix if accidentally included in filePath
  const cleanPath = stripBucketPrefix(filePath, bucket);

  const endpoint = `${supabaseUrl}/storage/v1/object/sign/${bucket}/${cleanPath}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
    signal: AbortSignal.timeout(CONTROL_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create signed preview URL from Supabase Storage (${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as { signedURL?: string };
  if (!data.signedURL) {
    throw new Error("Supabase Storage response missing signedURL");
  }

  const signedUrl = normalizeStorageUrl(supabaseUrl, data.signedURL);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  return {
    signedUrl,
    expiresAt,
  };
}

/**
 * Deletes a document PDF object from Supabase Storage.
 */
export async function deleteDocumentPdf(filePath: string): Promise<void> {
  const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();

  const cleanPath = stripBucketPrefix(filePath, bucket);

  const endpoint = `${supabaseUrl}/storage/v1/object/${bucket}`;

  await fetch(endpoint, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: [cleanPath] }),
    signal: AbortSignal.timeout(CONTROL_FETCH_TIMEOUT_MS),
  });
}
