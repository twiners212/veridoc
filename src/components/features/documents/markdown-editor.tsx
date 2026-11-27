"use client";

import * as React from "react";
import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Minus,
  Table as TableIcon,
  Eye,
  Edit3,
  Columns,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface MarkdownEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  minHeight?: string;
  className?: string;
  placeholder?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  readOnly = false,
  minHeight = "450px",
  className,
  placeholder = "Write your controlled SOP procedure in standard Markdown...",
}: MarkdownEditorProps) {
  const [viewMode, setViewMode] = React.useState<"split" | "edit" | "preview">("split");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Compute character and word stats
  const stats = React.useMemo(() => {
    const text = value || "";
    const charCount = text.length;
    const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
    const lineCount = text === "" ? 0 : text.split("\n").length;
    const estMinutes = Math.max(1, Math.ceil(wordCount / 200));
    return { charCount, wordCount, lineCount, estMinutes };
  }, [value]);

  // Insert syntax into textarea at current selection
  const insertSyntax = (prefix: string, suffix: string = "", defaultText: string = "") => {
    if (readOnly || !onChange || !textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = value.substring(start, end) || defaultText;
    const replacement = `${prefix}${selection}${suffix}`;
    const nextValue = value.substring(0, start) + replacement + value.substring(end);

    onChange(nextValue);

    // Reposition cursor
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selection.length
      );
    }, 0);
  };

  const insertLinePrefix = (prefix: string) => {
    if (readOnly || !onChange || !textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    // Find start of current line
    const beforeCursor = value.substring(0, start);
    const lastNewline = beforeCursor.lastIndexOf("\n");
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;

    const nextValue =
      value.substring(0, lineStart) + prefix + value.substring(lineStart);
    onChange(nextValue);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border bg-card shadow-sm overflow-hidden",
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border bg-muted/40 px-3 py-2 select-none">
        {/* Formatting Actions */}
        <div className="flex flex-wrap items-center gap-1">
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={() => insertSyntax("**", "**", "bold text")}
                title="Bold (Ctrl+B)"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Bold"
              >
                <Bold className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertSyntax("*", "*", "italic text")}
                title="Italic (Ctrl+I)"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Italic"
              >
                <Italic className="h-4 w-4" />
              </button>
              <div className="h-4 w-px bg-border mx-0.5" />
              <button
                type="button"
                onClick={() => insertLinePrefix("# ")}
                title="Heading 1"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Heading 1"
              >
                <Heading1 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertLinePrefix("## ")}
                title="Heading 2"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Heading 2"
              >
                <Heading2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertLinePrefix("### ")}
                title="Heading 3"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Heading 3"
              >
                <Heading3 className="h-4 w-4" />
              </button>
              <div className="h-4 w-px bg-border mx-0.5" />
              <button
                type="button"
                onClick={() => insertLinePrefix("- ")}
                title="Bullet List"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Bullet List"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertLinePrefix("1. ")}
                title="Numbered List"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Numbered List"
              >
                <ListOrdered className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertLinePrefix("> ")}
                title="Blockquote"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Blockquote"
              >
                <Quote className="h-4 w-4" />
              </button>
              <div className="h-4 w-px bg-border mx-0.5" />
              <button
                type="button"
                onClick={() => insertSyntax("`", "`", "code")}
                title="Inline Code"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Inline Code"
              >
                <Code className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  insertSyntax(
                    "| Step | Responsibility | Requirement |\n| :--- | :--- | :--- |\n| 1 | ",
                    " | Verify Equipment Calibration |",
                    "Operator"
                  )
                }
                title="Table Template"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Table"
              >
                <TableIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertSyntax("[", "](https://)", "link text")}
                title="Hyperlink"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Link"
              >
                <LinkIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertLinePrefix("\n---\n")}
                title="Horizontal Rule"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Horizontal Rule"
              >
                <Minus className="h-4 w-4" />
              </button>
            </>
          )}

          {readOnly && (
            <span className="text-xs text-muted-foreground italic px-2 py-1">
              Read-Only (Version is governed & locked)
            </span>
          )}
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-muted p-0.5 rounded border border-border">
          {!readOnly && (
            <button
              type="button"
              onClick={() => setViewMode("edit")}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                viewMode === "edit"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Edit</span>
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => setViewMode("split")}
              className={cn(
                "hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                viewMode === "split"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Columns className="h-3.5 w-3.5" />
              <span>Split</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setViewMode("preview")}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
              viewMode === "preview"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Preview</span>
          </button>
        </div>
      </div>

      {/* Main Editing / Preview Canvas */}
      <div
        className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border bg-card overflow-hidden"
        style={{
          gridTemplateColumns:
            viewMode === "split" && !readOnly ? "1fr 1fr" : "1fr",
          minHeight,
        }}
      >
        {/* Editor Area */}
        {viewMode !== "preview" && !readOnly && (
          <div className="flex flex-col h-full bg-card">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              placeholder={placeholder}
              disabled={readOnly}
              className="flex-1 w-full p-4 font-mono text-sm leading-6 bg-transparent text-foreground placeholder:text-muted-foreground resize-none focus:outline-none"
              style={{ minHeight }}
              spellCheck={false}
            />
          </div>
        )}

        {/* Live Sanitized Preview Area */}
        {(viewMode === "preview" || (viewMode === "split" && !readOnly)) && (
          <div
            className="flex flex-col h-full bg-slate-50/40 dark:bg-muted/30 p-5 overflow-y-auto"
            style={{ minHeight }}
          >
            <div className="flex items-center gap-1.5 pb-3 mb-3 border-b border-border/60 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Sanitized Preview (rehype-sanitize active)</span>
            </div>
            {value.trim() === "" ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground italic py-12">
                No content to preview yet. Start typing to see rendered SOP markdown.
              </div>
            ) : (
              <div className="prose prose-slate dark:prose-invert max-w-none text-foreground text-sm leading-6 space-y-4">
                <Markdown
                  rehypePlugins={[rehypeSanitize]}
                  components={{
                    h1: ({ ...props }) => (
                      <h1
                        className="text-xl font-bold tracking-tight text-foreground border-b border-border pb-1 mt-4 mb-2"
                        {...props}
                      />
                    ),
                    h2: ({ ...props }) => (
                      <h2
                        className="text-lg font-semibold text-foreground border-b border-border/50 pb-1 mt-3 mb-2"
                        {...props}
                      />
                    ),
                    h3: ({ ...props }) => (
                      <h3 className="text-base font-semibold text-foreground mt-2 mb-1" {...props} />
                    ),
                    p: ({ ...props }) => <p className="text-sm leading-6 text-foreground my-2" {...props} />,
                    ul: ({ ...props }) => (
                      <ul className="list-disc pl-5 my-2 space-y-1 text-sm text-foreground" {...props} />
                    ),
                    ol: ({ ...props }) => (
                      <ol className="list-decimal pl-5 my-2 space-y-1 text-sm text-foreground" {...props} />
                    ),
                    blockquote: ({ ...props }) => (
                      <blockquote
                        className="border-l-4 border-primary/50 pl-4 py-1 italic bg-muted/40 my-3 text-muted-foreground text-sm rounded-r"
                        {...props}
                      />
                    ),
                    table: ({ ...props }) => (
                      <div className="overflow-x-auto my-3">
                        <table
                          className="min-w-full divide-y divide-border border border-border text-xs text-left"
                          {...props}
                        />
                      </div>
                    ),
                    th: ({ ...props }) => (
                      <th
                        className="px-3 py-2 bg-muted font-semibold text-foreground border-b border-border"
                        {...props}
                      />
                    ),
                    td: ({ ...props }) => (
                      <td className="px-3 py-2 border-b border-border/50 text-foreground" {...props} />
                    ),
                    code: ({ inline, ...props }: { inline?: boolean } & React.HTMLAttributes<HTMLElement>) =>
                      inline ? (
                        <code
                          className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs text-foreground border border-border/60"
                          {...props}
                        />
                      ) : (
                        <pre className="p-3 rounded bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto my-2">
                          <code {...props} />
                        </pre>
                      ),
                    hr: () => <hr className="my-4 border-border" />,
                  }}
                >
                  {value}
                </Markdown>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Editor Stats Footer Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground font-mono">
        <div className="flex items-center gap-4">
          <span>{stats.charCount} chars</span>
          <span>•</span>
          <span>{stats.wordCount} words</span>
          <span>•</span>
          <span>{stats.lineCount} lines</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Est. read: ~{stats.estMinutes} min</span>
        </div>
      </div>
    </div>
  );
}
