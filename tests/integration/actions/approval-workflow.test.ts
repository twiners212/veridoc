import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import {
  tenants,
  users,
  accounts,
  tenantMemberships,
  documents,
  documentVersions,
  approvalCycles,
  approvalSteps,
  auditLogs,
} from "@/db/schema";
import {
  testAdminDb,
  testAppDb,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";
import {
  createDocumentAction,
  updateDocumentVersionAction,
} from "@/server/actions/documents.actions";
import {
  submitForApprovalAction,
  executeApprovalDecisionAction,
  recallApprovalAction,
  adminOverrideApproverAction,
} from "@/server/actions/approval.actions";

describe("Phase 4 Part 1: Approval Workflow & Concurrency Core (Live PostgreSQL)", { timeout: 120000 }, () => {
  let tenantId: string;
  let adminUserId: string;
  let authorUserId: string;
  let approver1UserId: string;
  let approver2UserId: string;
  let approver3UserId: string;
  let readerUserId: string;

  const userIds: string[] = [];
  const tenantIds: string[] = [];
  const defaultPassword = "ApproverSecret!2026";

  beforeAll(async () => {
    // 1. Create Workspace Tenant (allowSingleAuthorOverride = false)
    const [t] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Phase 4 Approval Core Workspace",
        slug: `approval-ws-${Date.now()}`,
        allowSingleAuthorOverride: false,
      })
      .returning();
    tenantId = t.id;
    tenantIds.push(tenantId);

    const hashedPw = await hashPassword(defaultPassword);

    // 2. Helper to create user with credentials
    async function createUser(name: string, emailPrefix: string, role: any) {
      const [u] = await testAdminDb
        .insert(users)
        .values({
          name,
          email: `${emailPrefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@veridoc.test`,
        })
        .returning();
      userIds.push(u.id);

      await testAdminDb.insert(accounts).values({
        userId: u.id,
        accountId: u.id,
        providerId: "credential",
        password: hashedPw,
      });

      await testAdminDb.insert(tenantMemberships).values({
        tenantId,
        userId: u.id,
        role,
        status: "ACTIVE",
      });

      return u.id;
    }

    adminUserId = await createUser("Workspace Admin", "admin", "WORKSPACE_ADMIN");
    authorUserId = await createUser("Document Author", "author", "DOCUMENT_AUTHOR");
    approver1UserId = await createUser("Approver One", "app1", "APPROVER_REVIEWER");
    approver2UserId = await createUser("Approver Two", "app2", "QUALITY_MANAGER");
    approver3UserId = await createUser("Approver Three", "app3", "APPROVER_REVIEWER");
    readerUserId = await createUser("Reader User", "reader", "READER");
  });

  afterAll(async () => {
    await cleanupTestTenants(tenantIds);
    await cleanupTestUsers(userIds);
  });

  // ============================================================================
  // Test 1: Sequential Happy Path (AC-01)
  // ============================================================================
  it("executes multi-step sequential approval happy path to APPROVED state (AC-01)", async () => {
    // 1. Create document
    const createRes = await createDocumentAction(
      {
        tenantId,
        documentCode: `SOP-HP-${Date.now()}`,
        title: "Standard Cleanroom Operation",
        contentFormat: "MARKDOWN",
        markdownContent: "# Standard Cleanroom Operation\n\nEnsure ISO Class 5 compliance.",
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    expect(createRes.success).toBe(true);
    if (!createRes.success) return;
    const { versionId } = createRes.data;

    // 2. Submit for approval with 2 sequential approvers
    const submitRes = await submitForApprovalAction(
      {
        tenantId,
        versionId,
        approverIds: [approver1UserId, approver2UserId],
      },
      { userId: authorUserId, callerDb: testAppDb }
    );

    expect(submitRes.success).toBe(true);
    if (!submitRes.success) return;
    expect(submitRes.data.cycleNumber).toBe(1);
    expect(submitRes.data.lifecycleState).toBe("PENDING_APPROVAL");
    expect(submitRes.data.stepsCount).toBe(2);

    const cycleId = submitRes.data.cycleId;

    // Check step states: Step 1 = PENDING, Step 2 = WAITING
    const steps = await testAdminDb
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.approvalCycleId, cycleId))
      .orderBy(approvalSteps.stepOrder);

    expect(steps.length).toBe(2);
    expect(steps[0].status).toBe("PENDING");
    expect(steps[0].assignedApproverId).toBe(approver1UserId);
    expect(steps[1].status).toBe("WAITING");
    expect(steps[1].assignedApproverId).toBe(approver2UserId);

    // 3. Step 1 sign-off by Approver 1
    const app1Res = await executeApprovalDecisionAction(
      {
        tenantId,
        approvalStepId: steps[0].id,
        decision: "APPROVE",
        decisionIntent: "Reviewed and verified cleanroom procedures",
        reauthPassword: defaultPassword,
      },
      { userId: approver1UserId, callerDb: testAppDb }
    );

    expect(app1Res.success).toBe(true);
    if (!app1Res.success) return;
    expect(app1Res.data.stepStatus).toBe("APPROVED");
    expect(app1Res.data.isFinalStep).toBe(false);
    expect(app1Res.data.lifecycleState).toBe("PENDING_APPROVAL");

    // Verify Step 2 is now activated to PENDING
    const [step2AfterApp1] = await testAdminDb
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.id, steps[1].id));
    expect(step2AfterApp1.status).toBe("PENDING");

    // 4. Step 2 (Final) sign-off by Approver 2
    const app2Res = await executeApprovalDecisionAction(
      {
        tenantId,
        approvalStepId: steps[1].id,
        decision: "APPROVE",
        decisionIntent: "Quality sign-off complete and approved",
        reauthPassword: defaultPassword,
      },
      { userId: approver2UserId, callerDb: testAppDb }
    );

    expect(app2Res.success).toBe(true);
    if (!app2Res.success) return;
    expect(app2Res.data.isFinalStep).toBe(true);
    expect(app2Res.data.cycleStatus).toBe("APPROVED");
    expect(app2Res.data.lifecycleState).toBe("APPROVED");

    // Verify document_versions state is APPROVED
    const [approvedVer] = await testAdminDb
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, versionId));
    expect(approvedVer.lifecycleState).toBe("APPROVED");

    // Verify Audit Logs appended
    const versionLogs = await testAdminDb
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.entityId, versionId)))
      .orderBy(auditLogs.sequenceNumber);

    const eventTypes = versionLogs.map((l) => l.eventType);
    expect(eventTypes).toContain("WORKFLOW_SUBMITTED");
    expect(eventTypes).toContain("DOCUMENT_APPROVED");
  });

  // ============================================================================
  // Test 2: Out-of-Order Sequential Step Rejection (BR-SEQ-02, 409)
  // ============================================================================
  it("rejects out-of-order approval attempt with HTTP 409 APPROVAL_STEP_NOT_ACTIVE (BR-SEQ-02)", async () => {
    const createRes = await createDocumentAction(
      {
        tenantId,
        documentCode: `SOP-SEQ-${Date.now()}`,
        title: "Sequential Gating Test SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "Sequential validation content.",
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    if (!createRes.success) throw new Error("Document setup failed");
    const { versionId } = createRes.data;

    const submitRes = await submitForApprovalAction(
      {
        tenantId,
        versionId,
        approverIds: [approver1UserId, approver2UserId],
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    if (!submitRes.success) throw new Error("Workflow submission failed");

    // Retrieve Step 2 (WAITING)
    const steps = await testAdminDb
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.approvalCycleId, submitRes.data.cycleId))
      .orderBy(approvalSteps.stepOrder);

    expect(steps[1].status).toBe("WAITING");

    // Approver 2 attempts to approve Step 2 before Step 1 is completed
    const prematureRes = await executeApprovalDecisionAction(
      {
        tenantId,
        approvalStepId: steps[1].id,
        decision: "APPROVE",
        decisionIntent: "Premature approval attempt",
        reauthPassword: defaultPassword,
      },
      { userId: approver2UserId, callerDb: testAppDb }
    );

    expect(prematureRes.success).toBe(false);
    if (prematureRes.success) return;
    expect(prematureRes.error.status).toBe(409);
    expect(prematureRes.error.code).toBe("APPROVAL_STEP_NOT_ACTIVE");
  });

  // ============================================================================
  // Test 3: Separation of Duties & Self-Approval Prevention (BR-APP-01, DEC-03, 403)
  // ============================================================================
  it("blocks self-approval with HTTP 403 SELF_APPROVAL_PROHIBITED (DEC-03, BR-APP-01)", async () => {
    const createRes = await createDocumentAction(
      {
        tenantId,
        documentCode: `SOP-SOD-${Date.now()}`,
        title: "Self Approval Prevention SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "Content for self approval test.",
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    if (!createRes.success) throw new Error("Document setup failed");
    const { versionId } = createRes.data;

    // Case A: Workflow submission with author in approver list is rejected
    const selfSubmitRes = await submitForApprovalAction(
      {
        tenantId,
        versionId,
        approverIds: [authorUserId, approver1UserId],
      },
      { userId: authorUserId, callerDb: testAppDb }
    );

    expect(selfSubmitRes.success).toBe(false);
    if (selfSubmitRes.success) return;
    expect(selfSubmitRes.error.status).toBe(403);
    expect(selfSubmitRes.error.code).toBe("SELF_APPROVAL_PROHIBITED");
  });

  it("permits self-approval when allowSingleAuthorOverride = true and records SELF_APPROVAL_OVERRIDE_USED", async () => {
    // Create single-author tenant
    const [singleTenant] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Single Author Workspace",
        slug: `single-auth-${Date.now()}`,
        allowSingleAuthorOverride: true,
      })
      .returning();
    tenantIds.push(singleTenant.id);

    // Add author as Workspace Admin in this tenant
    await testAdminDb.insert(tenantMemberships).values({
      tenantId: singleTenant.id,
      userId: authorUserId,
      role: "WORKSPACE_ADMIN",
      status: "ACTIVE",
    });

    const createRes = await createDocumentAction(
      {
        tenantId: singleTenant.id,
        documentCode: `SOP-OVR-${Date.now()}`,
        title: "Single Author SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "Solo author organization SOP.",
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    if (!createRes.success) throw new Error("Document setup failed");
    const { versionId } = createRes.data;

    // Submit workflow where author is sole approver
    const submitRes = await submitForApprovalAction(
      {
        tenantId: singleTenant.id,
        versionId,
        approverIds: [authorUserId],
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    expect(submitRes.success).toBe(true);
    if (!submitRes.success) return;

    const [step] = await testAdminDb
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.approvalCycleId, submitRes.data.cycleId));

    // Author signs off their own SOP with override enabled
    const approveRes = await executeApprovalDecisionAction(
      {
        tenantId: singleTenant.id,
        approvalStepId: step.id,
        decision: "APPROVE",
        decisionIntent: "Authorized sole author approval override",
        reauthPassword: defaultPassword,
      },
      { userId: authorUserId, callerDb: testAppDb }
    );

    expect(approveRes.success).toBe(true);
    if (!approveRes.success) return;
    expect(approveRes.data.lifecycleState).toBe("APPROVED");

    // Verify SELF_APPROVAL_OVERRIDE_USED audit log was appended
    const [overrideAudit] = await testAdminDb
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, singleTenant.id),
          eq(auditLogs.eventType, "SELF_APPROVAL_OVERRIDE_USED")
        )
      );
    expect(overrideAudit).toBeDefined();
    expect(overrideAudit.actorUserId).toBe(authorUserId);
  });

  // ============================================================================
  // Test 4: Password Re-Authentication Failure (REQ-FR-401, 401)
  // ============================================================================
  it("rejects sign-off on invalid password with HTTP 401 REAUTH_FAILED (REQ-FR-401)", async () => {
    const createRes = await createDocumentAction(
      {
        tenantId,
        documentCode: `SOP-AUTH-${Date.now()}`,
        title: "Reauth Failure SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "Reauth testing content.",
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    if (!createRes.success) throw new Error("Document setup failed");
    const { versionId } = createRes.data;

    const submitRes = await submitForApprovalAction(
      {
        tenantId,
        versionId,
        approverIds: [approver1UserId],
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    if (!submitRes.success) throw new Error("Workflow submission failed");

    const [step] = await testAdminDb
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.approvalCycleId, submitRes.data.cycleId));

    // Sign off with wrong password
    const failedReauthRes = await executeApprovalDecisionAction(
      {
        tenantId,
        approvalStepId: step.id,
        decision: "APPROVE",
        decisionIntent: "Sign-off attempt with wrong password",
        reauthPassword: "IncorrectPassword!1234",
      },
      { userId: approver1UserId, callerDb: testAppDb }
    );

    expect(failedReauthRes.success).toBe(false);
    if (failedReauthRes.success) return;
    expect(failedReauthRes.error.status).toBe(401);
    expect(failedReauthRes.error.code).toBe("REAUTH_FAILED");

    // Ensure step is still PENDING
    const [stepAfter] = await testAdminDb
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.id, step.id));
    expect(stepAfter.status).toBe("PENDING");
  });

  // ============================================================================
  // Test 5: Canonical SHA-256 Digest Tamper Rejection (DEC-06, 422)
  // ============================================================================
  it("rejects sign-off if document payload was tampered with HTTP 422 INTEGRITY_HASH_MISMATCH (DEC-06)", async () => {
    const createRes = await createDocumentAction(
      {
        tenantId,
        documentCode: `SOP-HASH-${Date.now()}`,
        title: "Integrity Verification SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "Original pristine content.",
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    if (!createRes.success) throw new Error("Document setup failed");
    const { versionId } = createRes.data;

    const submitRes = await submitForApprovalAction(
      {
        tenantId,
        versionId,
        approverIds: [approver1UserId],
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    if (!submitRes.success) throw new Error("Workflow submission failed");

    const [step] = await testAdminDb
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.approvalCycleId, submitRes.data.cycleId));

    // Tamper with markdownContent in DB directly
    await testAdminDb
      .update(documentVersions)
      .set({ markdownContent: "TAMPERED CONTENT INSERTED DIRECTLY" })
      .where(eq(documentVersions.id, versionId));

    // Approver attempts sign-off
    const tamperRes = await executeApprovalDecisionAction(
      {
        tenantId,
        approvalStepId: step.id,
        decision: "APPROVE",
        decisionIntent: "Sign-off attempt on tampered version",
        reauthPassword: defaultPassword,
      },
      { userId: approver1UserId, callerDb: testAppDb }
    );

    expect(tamperRes.success).toBe(false);
    if (tamperRes.success) return;
    expect(tamperRes.error.status).toBe(422);
    expect(tamperRes.error.code).toBe("INTEGRITY_HASH_MISMATCH");
  });

  // ============================================================================
  // Test 6: Workspace Admin Approver Override (BR-APP-04)
  // ============================================================================
  it("allows Workspace Admin to override and reassign approver (BR-APP-04)", async () => {
    const createRes = await createDocumentAction(
      {
        tenantId,
        documentCode: `SOP-OVR-ADM-${Date.now()}`,
        title: "Admin Override Test SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "Admin override workflow content.",
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    if (!createRes.success) throw new Error("Document setup failed");
    const { versionId } = createRes.data;

    const submitRes = await submitForApprovalAction(
      {
        tenantId,
        versionId,
        approverIds: [approver1UserId],
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    if (!submitRes.success) throw new Error("Workflow submission failed");

    const [step] = await testAdminDb
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.approvalCycleId, submitRes.data.cycleId));

    // Non-admin attempting override gets 403
    const nonAdminOverride = await adminOverrideApproverAction(
      {
        tenantId,
        approvalStepId: step.id,
        newApproverId: approver3UserId,
        justification: "Unauthorized override attempt",
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    expect(nonAdminOverride.success).toBe(false);
    if (!nonAdminOverride.success) {
      expect(nonAdminOverride.error.status).toBe(403);
    }

    // Workspace Admin overrides Approver 1 -> Approver 3
    const overrideRes = await adminOverrideApproverAction(
      {
        tenantId,
        approvalStepId: step.id,
        newApproverId: approver3UserId,
        justification: "Primary approver unavailable on leave (BR-APP-04)",
      },
      { userId: adminUserId, callerDb: testAppDb }
    );

    expect(overrideRes.success).toBe(true);
    if (!overrideRes.success) return;
    expect(overrideRes.data.newApproverId).toBe(approver3UserId);
    expect(overrideRes.data.previousApproverId).toBe(approver1UserId);

    // Step now assigned to Approver 3 with overriddenFromApproverId recorded
    const [updatedStep] = await testAdminDb
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.id, step.id));
    expect(updatedStep.assignedApproverId).toBe(approver3UserId);
    expect(updatedStep.overriddenFromApproverId).toBe(approver1UserId);

    // Approver 3 can now sign off!
    const app3SignRes = await executeApprovalDecisionAction(
      {
        tenantId,
        approvalStepId: step.id,
        decision: "APPROVE",
        decisionIntent: "Approved by delegated replacement approver",
        reauthPassword: defaultPassword,
      },
      { userId: approver3UserId, callerDb: testAppDb }
    );
    expect(app3SignRes.success).toBe(true);
  });

  // ============================================================================
  // Test 7: Workflow Recall
  // ============================================================================
  it("allows author to recall pending approval workflow back to DRAFT", async () => {
    const createRes = await createDocumentAction(
      {
        tenantId,
        documentCode: `SOP-RCL-${Date.now()}`,
        title: "Recall SOP Workflow",
        contentFormat: "MARKDOWN",
        markdownContent: "Content for recall testing.",
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    if (!createRes.success) throw new Error("Document setup failed");
    const { versionId } = createRes.data;

    const submitRes = await submitForApprovalAction(
      {
        tenantId,
        versionId,
        approverIds: [approver1UserId],
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    if (!submitRes.success) throw new Error("Workflow submission failed");

    // Author recalls the workflow
    const recallRes = await recallApprovalAction(
      {
        tenantId,
        versionId,
        reason: "Need to update chemical safety data sheets before review",
      },
      { userId: authorUserId, callerDb: testAppDb }
    );

    expect(recallRes.success).toBe(true);
    if (!recallRes.success) return;
    expect(recallRes.data.lifecycleState).toBe("DRAFT");
    expect(recallRes.data.cycleStatus).toBe("RECALLED");

    // Verify step status is INVALIDATED
    const [step] = await testAdminDb
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.approvalCycleId, submitRes.data.cycleId));
    expect(step.status).toBe("INVALIDATED");

    // Verify APPROVAL_RECALLED audit log
    const [recallAudit] = await testAdminDb
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.eventType, "APPROVAL_RECALLED")
        )
      );
    expect(recallAudit).toBeDefined();
  });

  // ============================================================================
  // Test 8: Mid-Approval Invalidation & Concurrent Edit vs Sign-Off Race (AC-02)
  // ============================================================================
  it("rejects mid-approval edit without confirmInvalidateApprovals (409 INVALIDATION_CONFIRMATION_REQUIRED)", async () => {
    const createRes = await createDocumentAction(
      {
        tenantId,
        documentCode: `SOP-INV-${Date.now()}`,
        title: "Invalidation Warning SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "Pre-invalidation text.",
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    if (!createRes.success) throw new Error("Document setup failed");
    const { versionId } = createRes.data;

    await submitForApprovalAction(
      {
        tenantId,
        versionId,
        approverIds: [approver1UserId],
      },
      { userId: authorUserId, callerDb: testAppDb }
    );

    // Edit without confirmInvalidateApprovals
    const unconfirmedEdit = await updateDocumentVersionAction(
      {
        tenantId,
        versionId,
        rowVersion: 2,
        contentMarkdown: "Attempted edit without confirmation",
      },
      { userId: authorUserId, callerDb: testAppDb }
    );

    expect(unconfirmedEdit.success).toBe(false);
    if (unconfirmedEdit.success) return;
    expect(unconfirmedEdit.error.status).toBe(409);
    expect(unconfirmedEdit.error.code).toBe("INVALIDATION_CONFIRMATION_REQUIRED");
  });

  it("handles concurrent edit vs sign-off race cleanly via FOR UPDATE locks (AC-02)", async () => {
    const createRes = await createDocumentAction(
      {
        tenantId,
        documentCode: `SOP-RACE-${Date.now()}`,
        title: "Concurrency Race Test SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "Original content before concurrency race.",
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    if (!createRes.success) throw new Error("Document setup failed");
    const { versionId } = createRes.data;

    const submitRes = await submitForApprovalAction(
      {
        tenantId,
        versionId,
        approverIds: [approver1UserId],
      },
      { userId: authorUserId, callerDb: testAppDb }
    );
    if (!submitRes.success) throw new Error("Workflow submission failed");

    const [step] = await testAdminDb
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.approvalCycleId, submitRes.data.cycleId));

    // Fire edit and sign-off concurrently via Promise.allSettled
    const [editOutcome, signOutcome] = await Promise.allSettled([
      updateDocumentVersionAction(
        {
          tenantId,
          versionId,
          rowVersion: 2,
          contentMarkdown: "Edited content while approval was pending",
          confirmInvalidateApprovals: true,
        },
        { userId: authorUserId, callerDb: testAppDb }
      ),
      executeApprovalDecisionAction(
        {
          tenantId,
          approvalStepId: step.id,
          decision: "APPROVE",
          decisionIntent: "Approved concurrently during edit",
          reauthPassword: defaultPassword,
        },
        { userId: approver1UserId, callerDb: testAppDb }
      ),
    ]);

    expect(editOutcome.status).toBe("fulfilled");
    expect(signOutcome.status).toBe("fulfilled");

    const editRes = (editOutcome as PromiseFulfilledResult<any>).value;
    const signRes = (signOutcome as PromiseFulfilledResult<any>).value;

    // Concurrency Invariant: Exactly one must succeed and the other must fail with 409
    const editSucceeded = editRes.success;
    const signSucceeded = signRes.success;

    expect(editSucceeded !== signSucceeded).toBe(true);

    if (editSucceeded) {
      // Edit won the lock: cycle invalidated, version reset to DRAFT, sign-off failed with 409
      expect(signRes.success).toBe(false);
      expect(signRes.error.status).toBe(409);
      expect(signRes.error.code).toBe("APPROVAL_CYCLE_INVALIDATED");

      const [finalVer] = await testAdminDb
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.id, versionId));
      expect(finalVer.lifecycleState).toBe("DRAFT");
      expect(finalVer.versionMinor).toBe(1);
      expect(finalVer.markdownContent).toBe("Edited content while approval was pending");

      const [finalCycle] = await testAdminDb
        .select()
        .from(approvalCycles)
        .where(eq(approvalCycles.id, submitRes.data.cycleId));
      expect(finalCycle.status).toBe("INVALIDATED");
    } else {
      // Sign-off won the lock: doc became APPROVED, edit failed with 409 VERSION_IMMUTABLE
      expect(editRes.success).toBe(false);
      expect(editRes.error.status).toBe(409);
      expect(editRes.error.code).toBe("VERSION_IMMUTABLE");

      const [finalVer] = await testAdminDb
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.id, versionId));
      expect(finalVer.lifecycleState).toBe("APPROVED");
      expect(finalVer.markdownContent).toBe("Original content before concurrency race.");
    }
  });
});
