"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X, FileText, FileCode, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { cn } from "@/lib/utils";
import { createDocumentAction } from "@/server/actions/documents.actions";

export interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories?: string[];
  tenantId?: string;
  onSuccess?: (doc: {
    documentId: string;
    versionId: string;
    documentCode: string;
    title: string;
    category: string;
    contentFormat: "MARKDOWN" | "PDF";
  }) => void;
}

export function CreateDocumentModal({
  isOpen,
  onClose,
  categories = ["Safety", "Quality", "Operations", "Manufacturing", "Compliance"],
  tenantId,
  onSuccess,
}: CreateDocumentModalProps) {
  const router = useRouter();
  const [documentCode, setDocumentCode] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("Quality");
  const [contentFormat, setContentFormat] = React.useState<"MARKDOWN" | "PDF">("MARKDOWN");
  const [markdownContent, setMarkdownContent] = React.useState(
    "# Standard Operating Procedure\n\n## 1. Purpose\nDescribe the operational objective...\n\n## 2. Scope\nApplicable workstations and personnel...\n\n## 3. Procedure Steps\n1. Initial verification...\n2. Operational execution...\n"
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const modalRef = React.useRef<HTMLDivElement>(null);

  useModalA11y({
    isOpen,
    onClose,
    disabled: isSubmitting,
    containerRef: modalRef,
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanCode = documentCode.trim().toUpperCase();
    const cleanTitle = title.trim();

    if (!cleanCode) {
      setErrorMessage("Document Code is required (e.g. SOP-SAF-004).");
      return;
    }
    if (cleanTitle.length < 3) {
      setErrorMessage("Title must be at least 3 characters long.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await createDocumentAction({
        tenantId,
        documentNumber: cleanCode,
        documentCode: cleanCode,
        title: cleanTitle,
        category,
        contentFormat,
        initialContent: contentFormat === "MARKDOWN" ? markdownContent : undefined,
      });

      if (!res.success) {
        setErrorMessage(res.error.message || "Failed to create document.");
        return;
      }

      const createdId = res.data.documentId;
      const versionId = res.data.versionId;

      onClose();
      if (onSuccess) {
        onSuccess({
          documentId: createdId,
          versionId,
          documentCode: cleanCode,
          title: cleanTitle,
          category,
          contentFormat,
        });
      } else {
        router.push(`/documents/${createdId}`);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to create document."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={modalRef}
        className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-doc-title"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            <h2 id="create-doc-title" className="text-lg font-bold text-foreground">
              New Controlled Document
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-muted-foreground hover:text-foreground p-1 rounded"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {errorMessage && (
            <div className="flex items-center gap-2 p-2.5 rounded bg-destructive/10 text-destructive text-xs border border-destructive/20">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Document Code */}
          <div>
            <label htmlFor="create-doc-code" className="block text-xs font-semibold text-foreground mb-1 uppercase tracking-wider">
              Document Code <span className="text-destructive">*</span>
            </label>
            <Input
              id="create-doc-code"
              type="text"
              placeholder="e.g. SOP-SAF-004"
              value={documentCode}
              onChange={(e) => setDocumentCode(e.target.value.toUpperCase())}
              className="font-mono text-sm uppercase"
              required
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Monospace identifier used across controlled copies and audit packets.
            </p>
          </div>

          {/* Title */}
          <div>
            <label htmlFor="create-doc-title-input" className="block text-xs font-semibold text-foreground mb-1 uppercase tracking-wider">
              Document Title <span className="text-destructive">*</span>
            </label>
            <Input
              id="create-doc-title-input"
              type="text"
              placeholder="e.g. Chemical Handling & Spill Response Procedure"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-sm"
              required
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="create-doc-category" className="block text-xs font-semibold text-foreground mb-1 uppercase tracking-wider">
              Category
            </label>
            <select
              id="create-doc-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-9 rounded border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Format Selection */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1 uppercase tracking-wider">
              Format Engine
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={cn(
                  "flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors",
                  contentFormat === "MARKDOWN"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:bg-muted/30 text-foreground"
                )}
              >
                <input
                  type="radio"
                  name="format"
                  checked={contentFormat === "MARKDOWN"}
                  onChange={() => setContentFormat("MARKDOWN")}
                  className="hidden"
                />
                <FileCode className="h-5 w-5" />
                <div className="text-left">
                  <div className="text-xs font-semibold">Structured Markdown</div>
                  <div className="text-[10px] text-muted-foreground">
                    Live diffing, sanitized preview
                  </div>
                </div>
              </label>

              <label
                className={cn(
                  "flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors",
                  contentFormat === "PDF"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:bg-muted/30 text-foreground"
                )}
              >
                <input
                  type="radio"
                  name="format"
                  checked={contentFormat === "PDF"}
                  onChange={() => setContentFormat("PDF")}
                  className="hidden"
                />
                <FileText className="h-5 w-5 text-red-600" />
                <div className="text-left">
                  <div className="text-xs font-semibold">PDF Attachment</div>
                  <div className="text-[10px] text-muted-foreground">
                    Max 50MB, %PDF- verified
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Initial Markdown Content (if MARKDOWN) */}
          {contentFormat === "MARKDOWN" && (
            <div>
              <label htmlFor="create-doc-markdown" className="block text-xs font-semibold text-foreground mb-1 uppercase tracking-wider">
                Initial Procedure Draft
              </label>
              <textarea
                id="create-doc-markdown"
                value={markdownContent}
                onChange={(e) => setMarkdownContent(e.target.value)}
                rows={5}
                className="w-full rounded border border-border bg-background p-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !documentCode.trim() || !title.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Creating...
                </>
              ) : (
                "Create Controlled SOP"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
