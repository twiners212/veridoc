"use client";

import * as React from "react";
import {
  Upload,
  FileCheck2,
  AlertCircle,
  FileText,
  CheckCircle2,
  Loader2,
  X,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sha256DigestChip } from "./sha256-digest-chip";
import { InvalidationWarningModal } from "@/components/features/approvals/invalidation-warning-modal";
import { cn } from "@/lib/utils";

export interface ExistingPdfInfo {
  storageKey?: string | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  fileSha256?: string | null;
  mimeType?: string | null;
}

export interface PdfUploaderProps {
  documentId: string;
  versionId: string;
  expectedRowVersion: number;
  lifecycleState: string;
  existingPdf?: ExistingPdfInfo | null;
  onUploadSuccess?: (result: {
    fileSizeBytes: number;
    fileSha256: string;
    lifecycleState: string;
    rowVersion: number;
  }) => void;
  className?: string;
  readOnly?: boolean;
}

const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50MB (REQ-FR-101)
const DIRECT_UPLOAD_THRESHOLD_BYTES = 4 * 1024 * 1024; // 4MB serverless payload threshold

export function PdfUploader({
  documentId,
  versionId,
  expectedRowVersion,
  lifecycleState,
  existingPdf,
  onUploadSuccess,
  className,
  readOnly = false,
}: PdfUploaderProps) {
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<number>(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Invalidation confirmation dialog state for PENDING_APPROVAL drafts (DEC-04)
  const [showInvalidateModal, setShowInvalidateModal] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isPendingApproval = lifecycleState === "PENDING_APPROVAL";
  const isImmutable =
    lifecycleState === "APPROVED" ||
    lifecycleState === "PUBLISHED" ||
    lifecycleState === "SUPERSEDED" ||
    lifecycleState === "RETIRED";

  // Validate PDF client-side before upload
  const validateFile = async (file: File): Promise<string | null> => {
    if (file.size <= 0) {
      return "Selected file is empty (0 bytes). Please upload a valid PDF document.";
    }

    if (file.size > MAX_PDF_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      return `File size (${sizeMb} MB) exceeds maximum allowed limit of 50 MB (REQ-FR-101).`;
    }

    try {
      // Validate %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D) magic bytes
      const slice = file.slice(0, 5);
      const buffer = await slice.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      const isValidMagic =
        bytes.length >= 5 &&
        bytes[0] === 0x25 && // %
        bytes[1] === 0x50 && // P
        bytes[2] === 0x44 && // D
        bytes[3] === 0x46 && // F
        bytes[4] === 0x2d; // -

      if (!isValidMagic) {
        return "Invalid file format: File header does not match authentic '%PDF-' magic bytes.";
      }
    } catch {
      return "Unable to verify file header. Please ensure the file is an authentic PDF.";
    }

    return null;
  };

  const handleFileSelect = async (file: File) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const validationError = await validateFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);

    // If document is in PENDING_APPROVAL, require explicit invalidation confirmation
    if (isPendingApproval) {
      setShowInvalidateModal(true);
    }
  };

  const executeUpload = async (requireInvalidateConfirm: boolean = false) => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(10);
    setErrorMessage(null);
    setSuccessMessage(null);

    let progressTimer: ReturnType<typeof setInterval> | null = null;

    const throwApiError = (
      status: number,
      payload: { error?: { code?: string; message?: string } }
    ): never => {
      const errorData = payload.error || {};
      if (
        status === 409 &&
        errorData.code === "INVALIDATION_CONFIRMATION_REQUIRED"
      ) {
        setShowInvalidateModal(true);
        throw new Error(
          "Approval invalidation confirmation required: This document version is currently PENDING_APPROVAL."
        );
      }
      throw new Error(
        errorData.message || `Upload failed with status ${status}`
      );
    };

    try {
      let uploadData: {
        fileSizeBytes: number;
        fileSha256: string;
        lifecycleState: string;
        rowVersion: number;
      } | null = null;

      if (selectedFile.size > DIRECT_UPLOAD_THRESHOLD_BYTES) {
        // Large files (> 4MB): signed upload URL -> direct PUT -> server finalize & SHA-256 verification
        const basePath = `/api/documents/${documentId}/versions/${versionId}`;
        const controlBody = JSON.stringify({
          expectedRowVersion,
          ...(requireInvalidateConfirm ? { confirmInvalidateApprovals: true } : {}),
        });

        setUploadProgress(15);
        const urlResponse = await fetch(`${basePath}/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: controlBody,
        });
        const urlResult = await urlResponse.json();
        if (!urlResponse.ok) {
          throwApiError(urlResponse.status, urlResult);
        }

        const { signedUrl, storageKey } = urlResult.data as {
          signedUrl: string;
          storageKey: string;
        };

        setUploadProgress(40);
        const putResponse = await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: selectedFile,
        });
        if (!putResponse.ok) {
          throw new Error(
            `Direct storage upload failed with status ${putResponse.status}`
          );
        }

        setUploadProgress(80);
        const finalizeResponse = await fetch(`${basePath}/upload-finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storageKey,
            expectedRowVersion,
            ...(requireInvalidateConfirm ? { confirmInvalidateApprovals: true } : {}),
          }),
        });
        const finalizeResult = await finalizeResponse.json();
        if (!finalizeResponse.ok) {
          throwApiError(finalizeResponse.status, finalizeResult);
        }

        setUploadProgress(100);
        uploadData = finalizeResult.data ?? null;
      } else {
        // Small files (<= 4MB): standard multipart upload through API route
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("expectedRowVersion", expectedRowVersion.toString());

        if (requireInvalidateConfirm) {
          formData.append("confirmInvalidateApprovals", "true");
        }

        progressTimer = setInterval(() => {
          setUploadProgress((prev) => {
            if (prev >= 90) return prev;
            return prev + 15;
          });
        }, 150);

        const response = await fetch(
          `/api/documents/${documentId}/versions/${versionId}/upload`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (progressTimer) {
          clearInterval(progressTimer);
          progressTimer = null;
        }
        setUploadProgress(100);

        const result = await response.json();
        if (!response.ok) {
          throwApiError(response.status, result);
        }

        uploadData = result.data ?? null;
      }

      setSuccessMessage("PDF document uploaded and bound to version successfully.");
      setSelectedFile(null);
      setShowInvalidateModal(false);

      if (onUploadSuccess && uploadData) {
        onUploadSuccess(uploadData);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "PDF upload failed";
      setErrorMessage(msg);
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes || bytes <= 0) return "0 KB";
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Existing PDF Banner if already attached */}
      {existingPdf?.fileSha256 ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">
                  {existingPdf.fileName || "Controlled_Document.pdf"}
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  ({formatFileSize(existingPdf.fileSizeBytes)})
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Sha256DigestChip digest={existingPdf.fileSha256} />
              </div>
            </div>
          </div>

          {!readOnly && !isImmutable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              Replace PDF
            </Button>
          )}
        </div>
      ) : (
        (readOnly || isImmutable) && (
          <div className="flex flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
            <div className="h-11 w-11 rounded-full bg-muted text-muted-foreground flex items-center justify-center border border-border">
              <FileText className="h-5 w-5" />
            </div>
            <div className="space-y-1 max-w-md">
              <p className="text-sm font-semibold text-foreground">
                No PDF Attachment
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This controlled document version uses Structured Markdown format or has no binary PDF file attached. Versions in{" "}
                <span className="font-mono font-semibold text-foreground">
                  {lifecycleState}
                </span>{" "}
                state are read-only and immutable.
              </p>
            </div>
          </div>
        )
      )}

      {/* Upload Dropzone */}
      {!readOnly && !isImmutable && (
        <div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileSelect(file);
            }}
            className={cn(
              "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 sm:p-8 text-center transition-colors cursor-pointer",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/30",
              isUploading && "pointer-events-none opacity-60"
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />

            <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Upload className="h-6 w-6" />
            </div>

            <p className="text-sm font-semibold text-foreground">
              Click to upload or drag & drop controlled PDF
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Authentic PDF format verified via <span className="font-mono">%PDF-</span> magic header
              • Max file size: 50MB (REQ-FR-101)
            </p>
          </div>

          {/* Selected File Action Bar */}
          {selectedFile && (
            <div className="mt-3 flex items-center justify-between p-3 rounded-lg border border-border bg-card shadow-sm">
              <div className="flex items-center gap-2.5 truncate pr-2">
                <FileCheck2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div className="truncate text-left">
                  <p className="text-sm font-medium text-foreground truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {formatFileSize(selectedFile.size)} • Ready to upload
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedFile(null)}
                  disabled={isUploading}
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (isPendingApproval) {
                      setShowInvalidateModal(true);
                    } else {
                      executeUpload(false);
                    }
                  }}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      Uploading...
                    </>
                  ) : (
                    "Upload Attachment"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {isUploading && (
            <div className="mt-3 space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Streaming & calculating SHA-256 digest...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error and Success Banners */}
      {errorMessage && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="p-0.5 text-destructive/70 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">{successMessage}</div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="p-0.5 text-emerald-600 hover:text-emerald-900"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Invalidation Confirmation Modal for PENDING_APPROVAL Versions (DEC-04) */}
      <InvalidationWarningModal
        isOpen={showInvalidateModal}
        onClose={() => setShowInvalidateModal(false)}
        onConfirm={() => {
          setShowInvalidateModal(false);
          executeUpload(true);
        }}
        isInvalidating={isUploading}
        actionType="upload"
      />
    </div>
  );
}
