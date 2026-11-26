import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { withTenantContext } from "@/db/context";
import {
  tenants,
  users,
  documents,
  documentVersions,
  approvalCycles,
  approvalSteps,
  auditLogs,
} from "@/db/schema";
import {
  testAppDb,
  testAdminDb,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";

describe("Database Schema Invariants & Triggers (PostgreSQL)", () => {
  let tenantId: string;
  let authorUserId: string;
  let approverUserId: string;

  beforeAll(async () => {
    // Seed tenant and users using adminDb (superuser)
    const [t] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Test Invariants Workspace",
        slug: `test-invariants-${Date.now()}`,
      })
      .returning();
    tenantId = t.id;

    const [u1] = await testAdminDb
      .insert(users)
      .values({
        name: "Author User",
        email: `author-${Date.now()}@veridoc.test`,
      })
      .returning();
    authorUserId = u1.id;

    const [u2] = await testAdminDb
      .insert(users)
      .values({
        name: "Approver User",
        email: `approver-${Date.now()}@veridoc.test`,
      })
      .returning();
    approverUserId = u2.id;
  });

  afterAll(async () => {
    await cleanupTestTenants([tenantId]);
    await cleanupTestUsers([authorUserId, approverUserId]);
  });

  it("enforces single published version per document via partial unique index (BR-VER-01)", async () => {
    const doc = await withTenantContext(
      tenantId,
      async (tx) => {
        const [d] = await tx
          .insert(documents)
          .values({
            tenantId,
            documentCode: `SOP-PUB-${Date.now()}`,
            createdBy: authorUserId,
          })
          .returning();

        // Version 1.0 PUBLISHED
        await tx.insert(documentVersions).values({
          tenantId,
          documentId: d.id,
          versionMajor: 1,
          versionMinor: 0,
          title: "SOP V1.0",
          contentFormat: "MARKDOWN",
          markdownContent: "# Content V1",
          documentSha256: "a".repeat(64),
          lifecycleState: "PUBLISHED",
          authorId: authorUserId,
        });

        return d;
      },
      testAppDb
    );

    // Attempting to insert a second PUBLISHED version for the same document must violate uq_one_published_version_per_doc
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          await tx.insert(documentVersions).values({
            tenantId,
            documentId: doc.id,
            versionMajor: 2,
            versionMinor: 0,
            title: "SOP V2.0",
            contentFormat: "MARKDOWN",
            markdownContent: "# Content V2",
            documentSha256: "b".repeat(64),
            lifecycleState: "PUBLISHED",
            authorId: authorUserId,
          });
        },
        testAppDb
      )
    ).rejects.toThrow(/uq_one_published_version_per_doc/);
  });

  it("blocks modification of controlled content once PUBLISHED via immutability trigger (BR-VER-02)", async () => {
    const ver = await withTenantContext(
      tenantId,
      async (tx) => {
        const [doc] = await tx
          .insert(documents)
          .values({
            tenantId,
            documentCode: `SOP-IMMUTABLE-${Date.now()}`,
            createdBy: authorUserId,
          })
          .returning();

        const [v] = await tx
          .insert(documentVersions)
          .values({
            tenantId,
            documentId: doc.id,
            versionMajor: 1,
            versionMinor: 0,
            title: "Controlled SOP",
            contentFormat: "MARKDOWN",
            markdownContent: "# Immutable Body",
            documentSha256: "c".repeat(64),
            lifecycleState: "PUBLISHED",
            authorId: authorUserId,
          })
          .returning();
        return v;
      },
      testAppDb
    );

    // Attempting to update markdown_content once PUBLISHED must trigger exception
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          await tx
            .update(documentVersions)
            .set({ markdownContent: "# Tampered Content" })
            .where(eq(documentVersions.id, ver.id));
        },
        testAppDb
      )
    ).rejects.toThrow(/DOCUMENT_VERSION_IMMUTABLE/);

    // Attempting to update title once PUBLISHED must trigger exception
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          await tx
            .update(documentVersions)
            .set({ title: "Tampered Title" })
            .where(eq(documentVersions.id, ver.id));
        },
        testAppDb
      )
    ).rejects.toThrow(/DOCUMENT_VERSION_IMMUTABLE/);
  });

  it("prevents self-approval via database trigger on UPDATE (DEC-03, BR-APP-01)", async () => {
    const { cycle, step } = await withTenantContext(
      tenantId,
      async (tx) => {
        const [doc] = await tx
          .insert(documents)
          .values({
            tenantId,
            documentCode: `SOP-SELFAPP-UPD-${Date.now()}`,
            createdBy: authorUserId,
          })
          .returning();

        const [ver] = await tx
          .insert(documentVersions)
          .values({
            tenantId,
            documentId: doc.id,
            versionMajor: 0,
            versionMinor: 1,
            title: "Draft SOP",
            contentFormat: "MARKDOWN",
            documentSha256: "d".repeat(64),
            lifecycleState: "PENDING_APPROVAL",
            authorId: authorUserId, // Author is authorUserId
          })
          .returning();

        const [c] = await tx
          .insert(approvalCycles)
          .values({
            tenantId,
            documentVersionId: ver.id,
            cycleNumber: 1,
            submittedBy: authorUserId,
            submittedSha256: "d".repeat(64),
            status: "IN_PROGRESS",
            allowSelfApprovalOverride: false, // Override disabled
          })
          .returning();

        const [s] = await tx
          .insert(approvalSteps)
          .values({
            tenantId,
            approvalCycleId: c.id,
            stepOrder: 1,
            assignedApproverId: authorUserId,
            status: "PENDING",
          })
          .returning();

        return { cycle: c, step: s };
      },
      testAppDb
    );

    // Attempt to approve by author when allowSelfApprovalOverride = false must fail
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          await tx
            .update(approvalSteps)
            .set({
              status: "APPROVED",
              actedByUserId: authorUserId,
              actedByFullName: "Author User",
              actedByRole: "DOCUMENT_AUTHOR",
              signedDocumentSha256: "d".repeat(64),
              decisionIntent: "I approve my own work",
              actedAt: new Date(),
            })
            .where(eq(approvalSteps.id, step.id));
        },
        testAppDb
      )
    ).rejects.toThrow(/SELF_APPROVAL_VIOLATION/);

    // Approval by a DIFFERENT user (approverUserId) must succeed
    const approvedStep = await withTenantContext(
      tenantId,
      async (tx) => {
        const [updated] = await tx
          .update(approvalSteps)
          .set({
            status: "APPROVED",
            actedByUserId: approverUserId,
            actedByFullName: "Approver User",
            actedByRole: "APPROVER_REVIEWER",
            signedDocumentSha256: "d".repeat(64),
            decisionIntent: "Approved by legitimate approver",
            actedAt: new Date(),
          })
          .where(eq(approvalSteps.id, step.id))
          .returning();
        return updated;
      },
      testAppDb
    );

    expect(approvedStep.status).toBe("APPROVED");
  });

  it("prevents self-approval via database trigger on direct INSERT (DEC-03, BR-APP-01)", async () => {
    const cycle = await withTenantContext(
      tenantId,
      async (tx) => {
        const [doc] = await tx
          .insert(documents)
          .values({
            tenantId,
            documentCode: `SOP-SELFAPP-INS-${Date.now()}`,
            createdBy: authorUserId,
          })
          .returning();

        const [ver] = await tx
          .insert(documentVersions)
          .values({
            tenantId,
            documentId: doc.id,
            versionMajor: 0,
            versionMinor: 1,
            title: "Draft SOP for Direct Insert",
            contentFormat: "MARKDOWN",
            documentSha256: "d".repeat(64),
            lifecycleState: "PENDING_APPROVAL",
            authorId: authorUserId,
          })
          .returning();

        const [c] = await tx
          .insert(approvalCycles)
          .values({
            tenantId,
            documentVersionId: ver.id,
            cycleNumber: 1,
            submittedBy: authorUserId,
            submittedSha256: "d".repeat(64),
            status: "IN_PROGRESS",
            allowSelfApprovalOverride: false,
          })
          .returning();

        return c;
      },
      testAppDb
    );

    // Attempt to directly INSERT an already-APPROVED step with author as actor must fail
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          await tx.insert(approvalSteps).values({
            tenantId,
            approvalCycleId: cycle.id,
            stepOrder: 1,
            assignedApproverId: authorUserId,
            status: "APPROVED",
            actedByUserId: authorUserId,
            actedByFullName: "Author User",
            actedByRole: "DOCUMENT_AUTHOR",
            signedDocumentSha256: "d".repeat(64),
            decisionIntent: "Author approval insert",
            actedAt: new Date(),
          });
        },
        testAppDb
      )
    ).rejects.toThrow(/SELF_APPROVAL_VIOLATION/);
  });

  it("permits self-approval when allow_self_approval_override is explicitly true (BR-APP-01 override)", async () => {
    await withTenantContext(
      tenantId,
      async (tx) => {
        const [doc] = await tx
          .insert(documents)
          .values({
            tenantId,
            documentCode: `SOP-OVERRIDE-${Date.now()}`,
            createdBy: authorUserId,
          })
          .returning();

        const [ver] = await tx
          .insert(documentVersions)
          .values({
            tenantId,
            documentId: doc.id,
            versionMajor: 0,
            versionMinor: 1,
            title: "Draft SOP With Override",
            contentFormat: "MARKDOWN",
            documentSha256: "e".repeat(64),
            lifecycleState: "PENDING_APPROVAL",
            authorId: authorUserId,
          })
          .returning();

        const [cycle] = await tx
          .insert(approvalCycles)
          .values({
            tenantId,
            documentVersionId: ver.id,
            cycleNumber: 1,
            submittedBy: authorUserId,
            submittedSha256: "e".repeat(64),
            status: "IN_PROGRESS",
            allowSelfApprovalOverride: true, // Override enabled
          })
          .returning();

        const [step] = await tx
          .insert(approvalSteps)
          .values({
            tenantId,
            approvalCycleId: cycle.id,
            stepOrder: 1,
            assignedApproverId: authorUserId,
            status: "PENDING",
          })
          .returning();

        // With override enabled, author approval must succeed
        const [approvedStep] = await tx
          .update(approvalSteps)
          .set({
            status: "APPROVED",
            actedByUserId: authorUserId,
            actedByFullName: "Author User",
            actedByRole: "DOCUMENT_AUTHOR",
            signedDocumentSha256: "e".repeat(64),
            decisionIntent: "Self-approval with small-org override",
            selfApprovalOverrideUsed: true,
            actedAt: new Date(),
          })
          .where(eq(approvalSteps.id, step.id))
          .returning();

        expect(approvedStep.status).toBe("APPROVED");
      },
      testAppDb
    );
  });

  it("enforces immutable append-only audit trail via REVOKE and trigger (DEC-08)", async () => {
    const log = await withTenantContext(
      tenantId,
      async (tx) => {
        const [l] = await tx
          .insert(auditLogs)
          .values({
            tenantId,
            sequenceNumber: Date.now(),
            eventType: "WORKFLOW_SUBMITTED",
            entityType: "DOCUMENT_VERSION",
            entityId: authorUserId,
            actorUserId: authorUserId,
            payloadJson: { test: true },
            prevHash: "0".repeat(64),
            entryHash: "f".repeat(64),
          })
          .returning();
        return l;
      },
      testAppDb
    );

    expect(log).toBeDefined();

    // Attempting to UPDATE audit_logs as veridoc_app_user must fail (REVOKE + trigger)
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          await tx
            .update(auditLogs)
            .set({ eventType: "TAMPERED_EVENT" })
            .where(eq(auditLogs.id, log.id));
        },
        testAppDb
      )
    ).rejects.toThrow(/permission denied|AUDIT_LOG_IMMUTABLE/);

    // Attempting to DELETE from audit_logs as veridoc_app_user must fail (REVOKE + trigger)
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          await tx.delete(auditLogs).where(eq(auditLogs.id, log.id));
        },
        testAppDb
      )
    ).rejects.toThrow(/permission denied|AUDIT_LOG_IMMUTABLE/);
  });

  it("enforces REVOKE DELETE on controlled lifecycle tables for veridoc_app_user", async () => {
    const ver = await withTenantContext(
      tenantId,
      async (tx) => {
        const [doc] = await tx
          .insert(documents)
          .values({
            tenantId,
            documentCode: `SOP-REVOKE-DEL-${Date.now()}`,
            createdBy: authorUserId,
          })
          .returning();

        const [v] = await tx
          .insert(documentVersions)
          .values({
            tenantId,
            documentId: doc.id,
            versionMajor: 0,
            versionMinor: 1,
            title: "Delete Target",
            contentFormat: "MARKDOWN",
            documentSha256: "1".repeat(64),
            lifecycleState: "DRAFT",
            authorId: authorUserId,
          })
          .returning();
        return v;
      },
      testAppDb
    );

    // Attempting to DELETE document_versions as veridoc_app_user must fail with permission denied
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          await tx.delete(documentVersions).where(eq(documentVersions.id, ver.id));
        },
        testAppDb
      )
    ).rejects.toThrow(/permission denied/);
  });

  it("enforces single active IN_PROGRESS cycle per version via partial unique index (uq_one_active_cycle_per_version)", async () => {
    const { version } = await withTenantContext(
      tenantId,
      async (tx) => {
        const [doc] = await tx
          .insert(documents)
          .values({
            tenantId,
            documentCode: `SOP-CYCLE-${Date.now()}`,
            createdBy: authorUserId,
          })
          .returning();

        const [v] = await tx
          .insert(documentVersions)
          .values({
            tenantId,
            documentId: doc.id,
            versionMajor: 0,
            versionMinor: 1,
            title: "Cycle Test SOP",
            contentFormat: "MARKDOWN",
            documentSha256: "2".repeat(64),
            lifecycleState: "PENDING_APPROVAL",
            authorId: authorUserId,
          })
          .returning();

        // First IN_PROGRESS cycle
        await tx.insert(approvalCycles).values({
          tenantId,
          documentVersionId: v.id,
          cycleNumber: 1,
          submittedBy: authorUserId,
          submittedSha256: "2".repeat(64),
          status: "IN_PROGRESS",
        });

        return { version: v };
      },
      testAppDb
    );

    // Attempting to insert a second IN_PROGRESS cycle on same version must fail uq_one_active_cycle_per_version
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          await tx.insert(approvalCycles).values({
            tenantId,
            documentVersionId: version.id,
            cycleNumber: 2,
            submittedBy: authorUserId,
            submittedSha256: "2".repeat(64),
            status: "IN_PROGRESS",
          });
        },
        testAppDb
      )
    ).rejects.toThrow(/uq_one_active_cycle_per_version/);
  });

  it("enforces legal lifecycle transitions and blocks illegal state downgrades in fn_document_versions_immutable", async () => {
    const { doc, version } = await withTenantContext(
      tenantId,
      async (tx) => {
        const [d] = await tx
          .insert(documents)
          .values({
            tenantId,
            documentCode: `SOP-TRANS-${Date.now()}`,
            createdBy: authorUserId,
          })
          .returning();

        const [v] = await tx
          .insert(documentVersions)
          .values({
            tenantId,
            documentId: d.id,
            versionMajor: 1,
            versionMinor: 0,
            title: "Transition Test SOP",
            contentFormat: "MARKDOWN",
            documentSha256: "3".repeat(64),
            lifecycleState: "APPROVED",
            authorId: authorUserId,
          })
          .returning();

        return { doc: d, version: v };
      },
      testAppDb
    );

    // 1. APPROVED -> DRAFT is illegal and must be rejected
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          await tx
            .update(documentVersions)
            .set({ lifecycleState: "DRAFT" })
            .where(eq(documentVersions.id, version.id));
        },
        testAppDb
      )
    ).rejects.toThrow(/ILLEGAL_STATE_TRANSITION/);

    // 2. Legal transition: APPROVED -> PUBLISHED succeeds
    const published = await withTenantContext(
      tenantId,
      async (tx) => {
        const [updated] = await tx
          .update(documentVersions)
          .set({
            lifecycleState: "PUBLISHED",
            publishedAt: new Date(),
            publishedBy: approverUserId,
          })
          .where(eq(documentVersions.id, version.id))
          .returning();
        return updated;
      },
      testAppDb
    );
    expect(published.lifecycleState).toBe("PUBLISHED");

    // 3. Modifying author_id or contentFormat on PUBLISHED version must be rejected
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          await tx
            .update(documentVersions)
            .set({ authorId: approverUserId })
            .where(eq(documentVersions.id, version.id));
        },
        testAppDb
      )
    ).rejects.toThrow(/DOCUMENT_VERSION_IMMUTABLE/);

    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          await tx
            .update(documentVersions)
            .set({ contentFormat: "PDF" })
            .where(eq(documentVersions.id, version.id));
        },
        testAppDb
      )
    ).rejects.toThrow(/DOCUMENT_VERSION_IMMUTABLE/);

    // 4. PUBLISHED -> DRAFT is illegal and must be rejected
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          await tx
            .update(documentVersions)
            .set({ lifecycleState: "DRAFT" })
            .where(eq(documentVersions.id, version.id));
        },
        testAppDb
      )
    ).rejects.toThrow(/ILLEGAL_STATE_TRANSITION/);

    // 5. Legal transition: PUBLISHED -> SUPERSEDED succeeds
    const superseded = await withTenantContext(
      tenantId,
      async (tx) => {
        const [updated] = await tx
          .update(documentVersions)
          .set({ lifecycleState: "SUPERSEDED" })
          .where(eq(documentVersions.id, version.id))
          .returning();
        return updated;
      },
      testAppDb
    );
    expect(superseded.lifecycleState).toBe("SUPERSEDED");

    // 6. Transitioning out of terminal SUPERSEDED state is illegal
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          await tx
            .update(documentVersions)
            .set({ lifecycleState: "PUBLISHED" })
            .where(eq(documentVersions.id, version.id));
        },
        testAppDb
      )
    ).rejects.toThrow(/ILLEGAL_STATE_TRANSITION/);
  });

  it("enforces database check constraints on PDF uploads and sign-offs", async () => {
    // 1. File size > 50MB (52428800 bytes) must fail chk_file_size_bytes
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          const [doc] = await tx
            .insert(documents)
            .values({
              tenantId,
              documentCode: `SOP-CHK-${Date.now()}`,
              createdBy: authorUserId,
            })
            .returning();

          await tx.insert(documentVersions).values({
            tenantId,
            documentId: doc.id,
            versionMajor: 0,
            versionMinor: 1,
            title: "Oversized PDF",
            contentFormat: "PDF",
            fileStorageKey: "tenant/test.pdf",
            fileMimeType: "application/pdf",
            fileSizeBytes: 52428801, // 50MB + 1 byte
            authorId: authorUserId,
          });
        },
        testAppDb
      )
    ).rejects.toThrow(/chk_file_size_bytes/);

    // 2. Non-PDF MIME type must fail chk_file_mime_type
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          const [doc] = await tx
            .insert(documents)
            .values({
              tenantId,
              documentCode: `SOP-MIME-${Date.now()}`,
              createdBy: authorUserId,
            })
            .returning();

          await tx.insert(documentVersions).values({
            tenantId,
            documentId: doc.id,
            versionMajor: 0,
            versionMinor: 1,
            title: "Docx file upload",
            contentFormat: "PDF",
            fileStorageKey: "tenant/test.docx",
            fileMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            fileSizeBytes: 1024,
            authorId: authorUserId,
          });
        },
        testAppDb
      )
    ).rejects.toThrow(/chk_file_mime_type/);

    // 3. Sign-off with empty decision_intent must fail chk_sign_off_completeness
    await expect(
      withTenantContext(
        tenantId,
        async (tx) => {
          const [doc] = await tx
            .insert(documents)
            .values({
              tenantId,
              documentCode: `SOP-BLANK-${Date.now()}`,
              createdBy: authorUserId,
            })
            .returning();

          const [v] = await tx
            .insert(documentVersions)
            .values({
              tenantId,
              documentId: doc.id,
              versionMajor: 0,
              versionMinor: 1,
              title: "Draft SOP Blank Intent",
              contentFormat: "MARKDOWN",
              documentSha256: "4".repeat(64),
              lifecycleState: "PENDING_APPROVAL",
              authorId: authorUserId,
            })
            .returning();

          const [cycle] = await tx
            .insert(approvalCycles)
            .values({
              tenantId,
              documentVersionId: v.id,
              cycleNumber: 1,
              submittedBy: authorUserId,
              submittedSha256: "4".repeat(64),
              status: "IN_PROGRESS",
            })
            .returning();

          await tx.insert(approvalSteps).values({
            tenantId,
            approvalCycleId: cycle.id,
            stepOrder: 1,
            assignedApproverId: approverUserId,
            status: "APPROVED",
            actedByUserId: approverUserId,
            actedByFullName: "Approver User",
            actedByRole: "APPROVER_REVIEWER",
            signedDocumentSha256: "4".repeat(64),
            decisionIntent: "   ", // whitespace only
            actedAt: new Date(),
          });
        },
        testAppDb
      )
    ).rejects.toThrow(/chk_sign_off_completeness/);
  });
});
