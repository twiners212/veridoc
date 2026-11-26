import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Compliance Copy Guard (DEC-02, DEC-08)
 *
 * Verifies that zero prohibited marketing claims exist across:
 * - src/ (UI, components, services, route handlers)
 * - docs/ (Specifications, architecture, requirements)
 * - public/ (PWA manifest, static assets)
 *
 * Prohibited Claims:
 * 1. "FDA 21 CFR Part 11 Certified" (DEC-02)
 * 2. "100% Tamper-Proof" (DEC-08)
 */

function getAllTargetFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    // Skip node_modules, build artifacts, git, and stitch reference templates
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === ".git" ||
      entry === ".stitch-ref"
    ) {
      continue;
    }
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      getAllTargetFiles(fullPath, fileList);
    } else if (
      entry.endsWith(".ts") ||
      entry.endsWith(".tsx") ||
      entry.endsWith(".js") ||
      entry.endsWith(".mjs") ||
      entry.endsWith(".json") ||
      entry.endsWith(".md") ||
      entry.endsWith(".html") ||
      entry.endsWith(".css")
    ) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

test.describe("Compliance Copy Guard (DEC-02, DEC-08)", () => {
  const rootDir = process.cwd();
  const targetDirs = [
    path.join(rootDir, "src"),
    path.join(rootDir, "docs"),
    path.join(rootDir, "public"),
  ];

  const allFiles: string[] = [];
  for (const d of targetDirs) {
    getAllTargetFiles(d, allFiles);
  }

  test("should find target files across src, docs, and public", () => {
    expect(allFiles.length).toBeGreaterThan(0);
  });

  test("strictly prohibits 'FDA 21 CFR Part 11 Certified' claims (DEC-02)", () => {
    const forbiddenPattern = /FDA 21 CFR Part 11 Certified/i;
    const violations: { file: string; line: number; text: string }[] = [];

    for (const filePath of allFiles) {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");
      const isDoc = filePath.includes("docs");

      lines.forEach((line, idx) => {
        if (forbiddenPattern.test(line)) {
          // If in docs, allow rule definitions that explicitly state the prohibition
          const isRuleStatement =
            isDoc &&
            (line.toLowerCase().includes("prohibit") ||
              line.toLowerCase().includes("never") ||
              line.toLowerCase().includes("disproven") ||
              line.toLowerCase().includes("enforced by") ||
              line.toLowerCase().includes("claiming"));

          if (!isRuleStatement) {
            violations.push({
              file: path.relative(rootDir, filePath),
              line: idx + 1,
              text: line.trim(),
            });
          }
        }
      });
    }

    expect(
      violations,
      `Found forbidden 'FDA 21 CFR Part 11 Certified' claims: ${JSON.stringify(violations, null, 2)}`
    ).toHaveLength(0);
  });

  test("strictly prohibits '100% Tamper-Proof' claims (DEC-08)", () => {
    const forbiddenPattern = /100% Tamper-Proof/i;
    const violations: { file: string; line: number; text: string }[] = [];

    for (const filePath of allFiles) {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");
      const isDoc = filePath.includes("docs");

      lines.forEach((line, idx) => {
        if (forbiddenPattern.test(line)) {
          const isRuleStatement =
            isDoc &&
            (line.toLowerCase().includes("prohibit") ||
              line.toLowerCase().includes("never") ||
              line.toLowerCase().includes("disproven") ||
              line.toLowerCase().includes("claiming") ||
              line.toLowerCase().includes("add ui copy"));

          if (!isRuleStatement) {
            violations.push({
              file: path.relative(rootDir, filePath),
              line: idx + 1,
              text: line.trim(),
            });
          }
        }
      });
    }

    expect(
      violations,
      `Found forbidden '100% Tamper-Proof' claims: ${JSON.stringify(violations, null, 2)}`
    ).toHaveLength(0);
  });
});
