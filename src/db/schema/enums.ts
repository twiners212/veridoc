import { pgSchema } from "drizzle-orm/pg-core";

export const veridoc = pgSchema("veridoc");

export const workspaceRoleEnum = veridoc.enum("workspace_role", [
  "WORKSPACE_ADMIN",
  "QUALITY_MANAGER",
  "DOCUMENT_AUTHOR",
  "APPROVER_REVIEWER",
  "READER",
]);

export const membershipStatusEnum = veridoc.enum("membership_status", [
  "ACTIVE",
  "INVITED",
  "DEACTIVATED",
]);

export const groupTypeEnum = veridoc.enum("group_type", [
  "DEPARTMENT",
  "SITE_LOCATION",
  "JOB_ROLE",
  "CUSTOM",
]);

export const contentFormatEnum = veridoc.enum("content_format", [
  "MARKDOWN",
  "PDF",
]);

export const documentLifecycleStateEnum = veridoc.enum("document_lifecycle_state", [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "PUBLISHED",
  "SUPERSEDED",
  "RETIRED",
]);

export const approvalCycleStatusEnum = veridoc.enum("approval_cycle_status", [
  "IN_PROGRESS",
  "APPROVED",
  "REJECTED",
  "INVALIDATED",
  "RECALLED",
]);

export const approvalStepStatusEnum = veridoc.enum("approval_step_status", [
  "WAITING",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "INVALIDATED",
  "SKIPPED",
]);

export const readAssignmentStatusEnum = veridoc.enum("read_assignment_status", [
  "PENDING",
  "COMPLETED",
  "EXPIRED_SUPERSEDED",
]);
