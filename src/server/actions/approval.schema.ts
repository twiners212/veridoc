import { z } from "zod";

export const submitForApprovalSchema = z.object({
  tenantId: z.string().uuid().optional(),
  versionId: z.string().uuid(),
  expectedRowVersion: z.number().int().positive().optional(),
  approverIds: z
    .array(z.string().uuid())
    .min(1, "At least one approver is required")
    .max(10, "Maximum of 10 approvers permitted")
    .refine(
      (ids) => {
        for (let i = 1; i < ids.length; i++) {
          if (ids[i] === ids[i - 1]) return false;
        }
        return true;
      },
      { message: "Approver list cannot contain consecutive duplicate approvers" }
    ),
});

export const executeApprovalDecisionSchema = z.object({
  tenantId: z.string().uuid().optional(),
  approvalStepId: z.string().uuid(),
  decision: z.enum(["APPROVE", "REJECT"]),
  decisionIntent: z
    .string()
    .min(5, "Decision intent must be at least 5 characters")
    .max(1000, "Decision intent cannot exceed 1000 characters"),
  reauthPassword: z.string().min(1, "Password re-authentication is required"),
  expectedDocumentSha256: z.string().length(64).optional(),
});

export const recallApprovalSchema = z.object({
  tenantId: z.string().uuid().optional(),
  versionId: z.string().uuid(),
  expectedRowVersion: z.number().int().positive().optional(),
  reason: z
    .string()
    .min(5, "Recall reason must be at least 5 characters")
    .max(1000, "Recall reason cannot exceed 1000 characters"),
});

export const adminOverrideApproverSchema = z.object({
  tenantId: z.string().uuid().optional(),
  approvalStepId: z.string().uuid(),
  newApproverId: z.string().uuid(),
  justification: z
    .string()
    .min(5, "Override justification must be at least 5 characters")
    .max(1000, "Override justification cannot exceed 1000 characters"),
});

export type SubmitForApprovalInput = z.infer<typeof submitForApprovalSchema>;
export type ExecuteApprovalDecisionInput = z.infer<typeof executeApprovalDecisionSchema>;
export type RecallApprovalInput = z.infer<typeof recallApprovalSchema>;
export type AdminOverrideApproverInput = z.infer<typeof adminOverrideApproverSchema>;
