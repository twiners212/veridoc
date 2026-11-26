import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function getAllSourceFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getAllSourceFiles(filePath, fileList);
    } else if (
      file.endsWith(".ts") ||
      file.endsWith(".tsx") ||
      file.endsWith(".json") ||
      file.endsWith(".css")
    ) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

describe("Compliance Copy Guard (DEC-02, DEC-08)", () => {
  const srcDir = path.resolve(__dirname, "../../../src");
  const sourceFiles = getAllSourceFiles(srcDir);

  it("should have source files to inspect", () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it("should strictly prohibit 'FDA 21 CFR Part 11 Certified' across all source files", () => {
    const forbiddenPattern = /FDA 21 CFR Part 11 Certified/i;
    const violations: { file: string; line: number; text: string }[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        if (forbiddenPattern.test(line)) {
          violations.push({
            file: path.relative(srcDir, file),
            line: idx + 1,
            text: line.trim(),
          });
        }
      });
    }

    expect(
      violations,
      `Found forbidden 'FDA 21 CFR Part 11 Certified' copy in source files: ${JSON.stringify(
        violations,
        null,
        2
      )}`
    ).toHaveLength(0);
  });

  it("should strictly prohibit '100% Tamper-Proof' across all source files", () => {
    const forbiddenPattern = /100% Tamper-Proof/i;
    const violations: { file: string; line: number; text: string }[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        if (forbiddenPattern.test(line)) {
          violations.push({
            file: path.relative(srcDir, file),
            line: idx + 1,
            text: line.trim(),
          });
        }
      });
    }

    expect(
      violations,
      `Found forbidden '100% Tamper-Proof' copy in source files: ${JSON.stringify(
        violations,
        null,
        2
      )}`
    ).toHaveLength(0);
  });
});
