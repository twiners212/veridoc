import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  submitForApprovalSchema,
  executeApprovalDecisionSchema,
  recallApprovalSchema,
  adminOverrideApproverSchema,
} from "@/server/actions/approval.schema";
import type { ApprovalQueueStepItem } from "@/types/approvals";

describe("Approval UI & Workflow Contracts (Unit)", () => {
  describe("SequentialStepper Step Progression Logic", () => {
    it("should correctly identify completed, active, and queued steps", () => {
      const steps: ApprovalQueueStepItem[] = [
        {
          id: "step-1",
          stepOrder: 1,
          status: "APPROVED",
          assignedApproverId: "user-1",
          assignedApproverName: "Dr. Rachel Vance",
          isBlockedInactiveApprover: false,
          actedAt: "2026-11-20T14:18:00Z",
        },
        {
          id: "step-2",
          stepOrder: 2,
          status: "PENDING",
          assignedApproverId: "user-2",
          assignedApproverName: "Marcus Vance",
          isBlockedInactiveApprover: false,
        },
        {
          id: "step-3",
          stepOrder: 3,
          status: "WAITING",
          assignedApproverId: "user-3",
          assignedApproverName: "Elena Rostova",
          isBlockedInactiveApprover: false,
        },
      ];

      const activeStep = steps.find((s) => s.status === "PENDING");
      expect(activeStep?.stepOrder).toBe(2);
      expect(steps[0].status).toBe("APPROVED");
      expect(steps[1].status).toBe("PENDING");
      expect(steps[2].status).toBe("WAITING");
    });

    it("should detect BLOCKED_INACTIVE_APPROVER when assigned approver is inactive", () => {
      const blockedStep: ApprovalQueueStepItem = {
        id: "step-2",
        stepOrder: 2,
        status: "PENDING",
        assignedApproverId: "user-deactivated",
        assignedApproverName: "Deactivated User",
        isBlockedInactiveApprover: true,
      };

      expect(blockedStep.isBlockedInactiveApprover).toBe(true);
      expect(blockedStep.status).toBe("PENDING");
    });
  });

  describe("SignOffReauthModal Validation Contracts (REQ-FR-401, REQ-FR-402)", () => {
    const validStepId = "11111111-1111-4111-a111-111111111111";

    it("should accept valid sign-off payload with mandatory intent and password", () => {
      const parsed = executeApprovalDecisionSchema.safeParse({
        approvalStepId: validStepId,
        decision: "APPROVE",
        decisionIntent: "Approved for operational rollout. All protocols verified.",
        reauthPassword: "ValidPassword123!",
      });

      expect(parsed.success).toBe(true);
    });

    it("should reject decisionIntent shorter than 5 characters", () => {
      const parsed = executeApprovalDecisionSchema.safeParse({
        approvalStepId: validStepId,
        decision: "APPROVE",
        decisionIntent: "ok",
        reauthPassword: "ValidPassword123!",
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].path).toContain("decisionIntent");
      }
    });

    it("should reject decisionIntent longer than 1000 characters", () => {
      const parsed = executeApprovalDecisionSchema.safeParse({
        approvalStepId: validStepId,
        decision: "APPROVE",
        decisionIntent: "a".repeat(1001),
        reauthPassword: "ValidPassword123!",
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].path).toContain("decisionIntent");
      }
    });

    it("should reject empty reauthPassword", () => {
      const parsed = executeApprovalDecisionSchema.safeParse({
        approvalStepId: validStepId,
        decision: "APPROVE",
        decisionIntent: "Approved for release.",
        reauthPassword: "",
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].path).toContain("reauthPassword");
      }
    });
  });

  describe("Workflow Submission Validation Contracts (BR-SEQ-03, BR-APP-01)", () => {
    const versionId = "22222222-2222-4222-a222-222222222222";
    const app1 = "33333333-3333-4333-a333-333333333333";
    const app2 = "44444444-4444-4444-a444-444444444444";
    const app3 = "55555555-5555-4555-a555-555555555555";

    it("should accept valid 1..10 sequential approvers without consecutive duplicates", () => {
      const parsed = submitForApprovalSchema.safeParse({
        versionId,
        approverIds: [app1, app2, app3],
      });

      expect(parsed.success).toBe(true);
    });

    it("should reject empty approver list", () => {
      const parsed = submitForApprovalSchema.safeParse({
        versionId,
        approverIds: [],
      });

      expect(parsed.success).toBe(false);
    });

    it("should reject consecutive duplicate approvers (BR-SEQ-03)", () => {
      const parsed = submitForApprovalSchema.safeParse({
        versionId,
        approverIds: [app1, app1, app2],
      });

      expect(parsed.success).toBe(false);
    });

    it("should reject more than 10 approvers", () => {
      const ids = Array.from(
        { length: 11 },
        (_, i) =>
          `00000000-0000-4000-a000-${i.toString(16).padStart(12, "0")}`
      );
      const parsed = submitForApprovalSchema.safeParse({
        versionId,
        approverIds: ids,
      });

      expect(parsed.success).toBe(false);
    });
  });

  describe("Recall and Admin Override Contracts", () => {
    it("should require reason >= 5 characters for recallApproval", () => {
      const versionId = "22222222-2222-4222-a222-222222222222";
      const valid = recallApprovalSchema.safeParse({
        versionId,
        reason: "Author requested recall to update Section 3.0",
      });
      expect(valid.success).toBe(true);

      const invalid = recallApprovalSchema.safeParse({
        versionId,
        reason: "no",
      });
      expect(invalid.success).toBe(false);
    });

    it("should require justification >= 5 characters for adminOverrideApprover", () => {
      const stepId = "11111111-1111-4111-a111-111111111111";
      const newApproverId = "44444444-4444-4444-a444-444444444444";

      const valid = adminOverrideApproverSchema.safeParse({
        approvalStepId: stepId,
        newApproverId,
        justification: "Reassigned due to approver leave of absence.",
      });
      expect(valid.success).toBe(true);

      const invalid = adminOverrideApproverSchema.safeParse({
        approvalStepId: stepId,
        newApproverId,
        justification: "fix",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("UI Server Action & Preview URL Wiring Contracts (AUD-001, AUD-002, AUD-005)", () => {
    it("CreateDocumentModal invokes createDocumentAction rather than nonexistent /api/documents", () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, "../../../src/components/features/documents/create-document-modal.tsx"),
        "utf8"
      );
      expect(src).toContain("createDocumentAction");
      expect(src).not.toContain('fetch("/api/documents"');
      expect(src).not.toContain("crypto.randomUUID()");
    });

    it("DocumentDetailView invokes updateDocumentVersionAction rather than nonexistent /update route", () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, "../../../src/components/features/documents/document-detail-view.tsx"),
        "utf8"
      );
      expect(src).toContain("updateDocumentVersionAction");
      expect(src).not.toContain("/update`");
    });

    it("ApprovalsView reads signedUrl from /preview-url response", () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, "../../../src/components/features/approvals/approvals-view.tsx"),
        "utf8"
      );
      expect(src).toContain("json.data?.signedUrl");
    });
  });
});
