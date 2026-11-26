import { config } from "dotenv";
import { createHash } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, DEMO_TENANT } from "../src/lib/auth/demo-accounts";
import * as schema from "../src/db/schema";

config({ path: ".env.local" });
config();

function normalizeMarkdown(content?: string | null): string {
  if (!content) return "";
  return content.normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonStringify(item ?? null)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const pairs: string[] = [];
  for (const key of keys) {
    const val = (value as Record<string, unknown>)[key];
    if (val !== undefined) {
      pairs.push(`${JSON.stringify(key)}:${canonicalJsonStringify(val)}`);
    }
  }
  return `{${pairs.join(",")}}`;
}

function computeDocumentSha256(params: {
  markdownContent?: string | null;
  fileSha256?: string | null;
  documentCode: string;
  tenantId: string;
  title: string;
  versionLabel: string;
}): string {
  const normalizedMarkdown = normalizeMarkdown(params.markdownContent);
  const fileSha256 = params.fileSha256 ?? "";
  const canonicalMetadataJson = canonicalJsonStringify({
    document_code: params.documentCode,
    tenant_id: params.tenantId,
    title: params.title,
    version_label: params.versionLabel,
  });
  return createHash("sha256")
    .update(`${normalizedMarkdown}${fileSha256}${canonicalMetadataJson}`, "utf8")
    .digest("hex");
}

function computeAuditHash(params: {
  salt: string;
  prevHash: string;
  tenantId: string;
  sequenceNumber: number;
  eventType: string;
  entityId: string;
  payloadJson: Record<string, unknown>;
}): string {
  const canonicalPayload = canonicalJsonStringify(params.payloadJson);
  const data = `${params.salt}${params.prevHash}${params.tenantId}${params.sequenceNumber}${params.eventType}${params.entityId}${canonicalPayload}`;
  return createHash("sha256").update(data, "utf8").digest("hex");
}

const IDS = {
  groupShiftA: "c0000000-0000-4000-8000-000000000001",
  groupQa: "c0000000-0000-4000-8000-000000000002",
  docDraft: "d0000000-0000-4000-8000-000000000001",
  verDraft: "e0000000-0000-4000-8000-000000000001",
  docPending: "d0000000-0000-4000-8000-000000000002",
  verPending: "e0000000-0000-4000-8000-000000000002",
  cyclePending: "f0000000-0000-4000-8000-000000000002",
  stepPending1: "f1000000-0000-4000-8000-000000000021",
  stepPending2: "f1000000-0000-4000-8000-000000000022",
  docApproved: "d0000000-0000-4000-8000-000000000003",
  verApproved: "e0000000-0000-4000-8000-000000000003",
  cycleApproved: "f0000000-0000-4000-8000-000000000003",
  stepApproved1: "f1000000-0000-4000-8000-000000000031",
  docPublished1: "d0000000-0000-4000-8000-000000000004",
  verPublished1: "e0000000-0000-4000-8000-000000000004",
  cyclePublished1: "f0000000-0000-4000-8000-000000000004",
  stepPublished1: "f1000000-0000-4000-8000-000000000041",
  docPublished2: "d0000000-0000-4000-8000-000000000005",
  verPublished2: "e0000000-0000-4000-8000-000000000005",
  cyclePublished2: "f0000000-0000-4000-8000-000000000005",
  stepPublished2: "f1000000-0000-4000-8000-000000000051",
  docPublished3: "d0000000-0000-4000-8000-000000000006",
  verPublished3: "e0000000-0000-4000-8000-000000000006",
  cyclePublished3: "f0000000-0000-4000-8000-000000000006",
  stepPublished3: "f1000000-0000-4000-8000-000000000061",
  assignReader1: "f2000000-0000-4000-8000-000000000001",
  assignReader2: "f2000000-0000-4000-8000-000000000002",
  assignReader3: "f2000000-0000-4000-8000-000000000004",
  assignQm1: "f2000000-0000-4000-8000-000000000003",
} as const;

const LOTO_MARKDOWN = `# SOP-MFG-001: Lockout / Tagout (LOTO) Hazardous Energy Control

## 1. Purpose
This Standard Operating Procedure establishes the minimum requirements for isolating, locking, and tagging hazardous energy sources before any service, maintenance, cleaning, or setup is performed on production equipment at Apex Manufacturing.

## 2. Scope
Applies to all Shift A Operations technicians, maintenance personnel, line supervisors, and authorized contractors working on electrical, pneumatic, hydraulic, thermal, chemical, or mechanical energy systems.

## 3. Roles & Responsibilities
- **Authorized Employees:** Execute energy isolation, apply personal locks/tags, and verify zero-energy state prior to work.
- **Affected Employees:** Observe lockout boundaries and never attempt to energize locked-out equipment.
- **Quality & Safety Supervisors:** Audit LOTO logs weekly and verify training acknowledgments.

## 4. Required Personal Protective Equipment (PPE)
1. ANSI Z87.1 rated safety glasses with side shields.
2. Arc-rated insulated gloves when verifying electrical isolation above 50V.
3. Composite-toe safety footwear and hearing protection in high-decibel zones.

## 5. Step-by-Step Energy Isolation Procedure
### 5.1 Preparation & Notification
Notify all affected operators in the work cell that equipment will be de-energized. Review the machine-specific energy isolation placard mounted on the primary control cabinet.

### 5.2 Equipment Shutdown
Use normal stopping controls (stop button, HMI cycle stop, or selector switch) to bring all moving components to a complete halt. Never rely on emergency stop interlocks as a primary energy isolation device.

### 5.3 Energy Source Isolation
Open the main electrical disconnect switch, close upstream pneumatic isolation valves, and bleed trapped hydraulic or air pressure through designated relief ports until gauges read zero.

### 5.4 Lockout & Tagout Application
Attach an individually keyed red LOTO padlock and a signed danger tag bearing the technician's full name, date, and expected completion time to every energy isolating device.

### 5.5 Stored Energy Dissipation & Zero-Energy Verification
Block or restrain elevated mechanical parts, discharge capacitors, and attempt a deliberate start test at the operator station to confirm zero energy before crossing any machine guard boundary.

## 6. Returning Equipment to Service
1. Inspect the work area to confirm all tools, test leads, and temporary blocks are removed.
2. Reinstall all machine guards and safety interlocks.
3. Verify all personnel are clear of pinch points and notify affected operators.
4. Remove personal LOTO locks and tags (only the employee who applied a lock may remove it).
5. Restore energy and verify normal operating parameters in the maintenance log.

## 7. References & Records
- OSHA 29 CFR 1910.147 — Control of Hazardous Energy
- Apex Manufacturing Equipment Isolation Placard Registry
- Deviation & Near-Miss Reporting Protocol (SOP-QA-002)`;

const GDP_MARKDOWN = `# SOP-QA-002: Good Documentation Practices (GDP) & Deviation Logging

## 1. Purpose
This procedure defines mandatory documentation standards across manufacturing, inspection, and quality assurance workflows so every operational record remains accurate, attributable, legible, contemporaneous, and complete.

## 2. Scope
Applies to all production operators, quality technicians, document authors, approvers, and supervisors generating or reviewing controlled records at Apex Manufacturing.

## 3. Core Recordkeeping Principles
- **Attributable:** Every entry must identify the individual performing the action along with the date and UTC or local plant timestamp.
- **Legible & Permanent:** Electronic entries must be captured directly in controlled systems; paper backups must use indelible ink with no correction fluid.
- **Contemporaneous:** Record measurements, batch adjustments, and inspection results at the time the activity occurs—never backdate or pre-fill records.
- **Original & Accurate:** Preserve original observations. If an error occurs in a controlled record, annotate the correction with reason and initials without obscuring prior data.

## 4. Controlled Document Lifecycle Rules
### 4.1 Drafts vs. Effective Documents
Only documents in **PUBLISHED** state are authorized for shop-floor execution. Drafts and versions pending approval must never be printed or used on active production lines.

### 4.2 Mid-Approval Change Control
Any edit to controlled content or metadata while a version is pending approval automatically invalidates in-flight signatures and returns the version to **DRAFT** for re-verification.

### 4.3 Version Supersession
When a revised SOP is published, the prior effective version transitions to **SUPERSEDED** and new read assignments are issued to the designated target audience groups.

## 5. Deviation Logging Procedure
1. Immediately halt the affected step if an out-of-tolerance condition or procedural departure occurs.
2. Open a Deviation Record referencing the exact Document Code and Version Label.
3. Document the observed condition, containment actions taken, and affected lot or serial numbers.
4. Escalate critical safety or product-impacting deviations to the Quality Manager within 2 hours.
5. Complete root-cause analysis and corrective/preventive action verification before batch release.

## 6. Verification & Retention
All controlled SOP sign-offs, read acknowledgments, and audit packets are bound to canonical SHA-256 content digests and retained in accordance with the Apex Quality Manual.`;

const LAB_MARKDOWN = `# SOP-LAB-003: Cleanroom Environmental Monitoring & Swab Sampling

## 1. Purpose
Define daily viable and non-viable particulate monitoring, surface swabbing, and excursion escalation rules for ISO Class 7 manufacturing suites.

## 2. Sampling Schedule
1. Perform airborne particle counts prior to Shift A line startup.
2. Collect contact plate and swab samples from high-touch stainless surfaces after sanitization.
3. Log sample plate IDs, incubation timestamps, and operator initials directly into the controlled laboratory ledger.

## 3. Excursion Action Limits
- Alert Limit: >= 5 CFU/plate — notify Quality Assurance and repeat sanitization verification.
- Action Limit: >= 15 CFU/plate — halt line release immediately and open a Quality Deviation record per SOP-QA-002.`;

async function main() {
  const connectionString =
    process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Missing DIRECT_DATABASE_URL or DATABASE_URL in environment (.env.local)."
    );
  }

  const client = postgres(connectionString, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });
  const salt = process.env.AUDIT_HASH_SALT || "";

  try {
    const adminUser = DEMO_ACCOUNTS.find((a) => a.role === "WORKSPACE_ADMIN")!;
    const qmUser = DEMO_ACCOUNTS.find((a) => a.role === "QUALITY_MANAGER")!;
    const authorUser = DEMO_ACCOUNTS.find((a) => a.role === "DOCUMENT_AUTHOR")!;
    const approverUser = DEMO_ACCOUNTS.find((a) => a.role === "APPROVER_REVIEWER")!;
    const readerUser = DEMO_ACCOUNTS.find((a) => a.role === "READER")!;

    // 1. Seed Tenant
    await db
      .insert(schema.tenants)
      .values({
        id: DEMO_TENANT.id,
        name: DEMO_TENANT.name,
        slug: DEMO_TENANT.slug,
        creatorSeatLimit: 10,
        readerPackLimit: 500,
        allowSingleAuthorOverride: false,
      })
      .onConflictDoNothing({ target: schema.tenants.id });

    // 2. Seed 5 Demo Users, Credential Accounts, and ACTIVE Memberships
    const passwordHash = await hashPassword(DEMO_PASSWORD);

    for (const account of DEMO_ACCOUNTS) {
      await db
        .insert(schema.users)
        .values({
          id: account.id,
          name: account.name,
          email: account.email,
          emailVerified: true,
        })
        .onConflictDoNothing({ target: schema.users.id });

      const existingCredential = await db
        .select({ id: schema.accounts.id })
        .from(schema.accounts)
        .where(
          and(
            eq(schema.accounts.userId, account.id),
            eq(schema.accounts.providerId, "credential")
          )
        )
        .limit(1);

      if (existingCredential.length === 0) {
        await db.insert(schema.accounts).values({
          userId: account.id,
          accountId: account.id,
          providerId: "credential",
          password: passwordHash,
        });
      }

      await db
        .insert(schema.tenantMemberships)
        .values({
          tenantId: DEMO_TENANT.id,
          userId: account.id,
          role: account.role,
          status: "ACTIVE",
        })
        .onConflictDoNothing({
          target: [schema.tenantMemberships.tenantId, schema.tenantMemberships.userId],
        });
    }

    // 3. Seed Audience Groups & Memberships
    await db
      .insert(schema.audienceGroups)
      .values([
        {
          id: IDS.groupShiftA,
          tenantId: DEMO_TENANT.id,
          name: "Shift A Operations",
          groupType: "DEPARTMENT",
        },
        {
          id: IDS.groupQa,
          tenantId: DEMO_TENANT.id,
          name: "Quality Assurance",
          groupType: "DEPARTMENT",
        },
      ])
      .onConflictDoNothing({ target: schema.audienceGroups.id });

    await db
      .insert(schema.audienceGroupMembers)
      .values([
        { tenantId: DEMO_TENANT.id, groupId: IDS.groupShiftA, userId: readerUser.id },
        { tenantId: DEMO_TENANT.id, groupId: IDS.groupShiftA, userId: authorUser.id },
        { tenantId: DEMO_TENANT.id, groupId: IDS.groupQa, userId: qmUser.id },
        { tenantId: DEMO_TENANT.id, groupId: IDS.groupQa, userId: approverUser.id },
        { tenantId: DEMO_TENANT.id, groupId: IDS.groupQa, userId: readerUser.id },
      ])
      .onConflictDoNothing();

    // 4. Seed Documents & Versions across DRAFT, PENDING_APPROVAL, APPROVED, PUBLISHED
    const draftTitle = "Cleanroom Gowning & Contamination Control";
    const draftMd = `# SOP-ENG-104: Cleanroom Gowning & Contamination Control\n\n## 1. Purpose\nDefines gowning steps for ISO Class 7 cleanroom entry.\n\n## 2. Draft Notes\nInitial draft under authoring review by Marcus Vance.`;

    const pendingTitle = "Hazardous Chemical Handling & Spill Response";
    const pendingMd = `# SOP-SAF-201: Hazardous Chemical Handling & Spill Response\n\n## 1. Purpose\nEstablish safe chemical transfer, secondary containment, and emergency spill response procedures.\n\n## 2. Containment Steps\n1. Evacuate immediate work zone and alert Shift Lead.\n2. Don chemical splash goggles, nitrile gloves, and apron.\n3. Deploy neutralizer and absorbent dike from the nearest spill station.`;
    const pendingSha = computeDocumentSha256({
      markdownContent: pendingMd,
      documentCode: "SOP-SAF-201",
      tenantId: DEMO_TENANT.id,
      title: pendingTitle,
      versionLabel: "v1.0",
    });

    const approvedTitle = "Batch Release Verification Checklist";
    const approvedMd = `# SOP-QA-305: Batch Release Verification Checklist\n\n## 1. Purpose\nFinal quality verification steps required prior to releasing finished manufacturing lots.\n\n## 2. Verification Items\n- Confirm in-process calibration records are current.\n- Confirm all deviations are closed and signed.`;
    const approvedSha = computeDocumentSha256({
      markdownContent: approvedMd,
      documentCode: "SOP-QA-305",
      tenantId: DEMO_TENANT.id,
      title: approvedTitle,
      versionLabel: "v1.0",
    });

    const pub1Title = "Lockout / Tagout (LOTO) Hazardous Energy Control";
    const pub1Sha = computeDocumentSha256({
      markdownContent: LOTO_MARKDOWN,
      documentCode: "SOP-MFG-001",
      tenantId: DEMO_TENANT.id,
      title: pub1Title,
      versionLabel: "v1.0",
    });

    const pub2Title = "Good Documentation Practices (GDP) & Deviation Logging";
    const pub2Sha = computeDocumentSha256({
      markdownContent: GDP_MARKDOWN,
      documentCode: "SOP-QA-002",
      tenantId: DEMO_TENANT.id,
      title: pub2Title,
      versionLabel: "v1.0",
    });

    const pub3Title = "Cleanroom Environmental Monitoring & Swab Sampling";
    const pub3Sha = computeDocumentSha256({
      markdownContent: LAB_MARKDOWN,
      documentCode: "SOP-LAB-003",
      tenantId: DEMO_TENANT.id,
      title: pub3Title,
      versionLabel: "v1.0",
    });

    await db
      .insert(schema.documents)
      .values([
        {
          id: IDS.docDraft,
          tenantId: DEMO_TENANT.id,
          documentCode: "SOP-ENG-104",
          category: "Engineering",
          createdBy: authorUser.id,
        },
        {
          id: IDS.docPending,
          tenantId: DEMO_TENANT.id,
          documentCode: "SOP-SAF-201",
          category: "Safety",
          createdBy: authorUser.id,
        },
        {
          id: IDS.docApproved,
          tenantId: DEMO_TENANT.id,
          documentCode: "SOP-QA-305",
          category: "Quality",
          createdBy: authorUser.id,
        },
        {
          id: IDS.docPublished1,
          tenantId: DEMO_TENANT.id,
          documentCode: "SOP-MFG-001",
          category: "Safety",
          createdBy: authorUser.id,
        },
        {
          id: IDS.docPublished2,
          tenantId: DEMO_TENANT.id,
          documentCode: "SOP-QA-002",
          category: "Quality",
          createdBy: authorUser.id,
        },
        {
          id: IDS.docPublished3,
          tenantId: DEMO_TENANT.id,
          documentCode: "SOP-LAB-003",
          category: "Quality",
          createdBy: authorUser.id,
        },
      ])
      .onConflictDoNothing({ target: schema.documents.id });

    const now = new Date();
    const publishedAt1 = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const publishedAt2 = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
    const publishedAt3 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const signedAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    await db
      .insert(schema.documentVersions)
      .values([
        {
          id: IDS.verDraft,
          tenantId: DEMO_TENANT.id,
          documentId: IDS.docDraft,
          versionMajor: 0,
          versionMinor: 1,
          title: draftTitle,
          contentFormat: "MARKDOWN",
          markdownContent: draftMd,
          lifecycleState: "DRAFT",
          authorId: authorUser.id,
          rowVersion: 1,
        },
        {
          id: IDS.verPending,
          tenantId: DEMO_TENANT.id,
          documentId: IDS.docPending,
          versionMajor: 1,
          versionMinor: 0,
          title: pendingTitle,
          contentFormat: "MARKDOWN",
          markdownContent: pendingMd,
          documentSha256: pendingSha,
          lifecycleState: "PENDING_APPROVAL",
          authorId: authorUser.id,
          rowVersion: 2,
        },
        {
          id: IDS.verApproved,
          tenantId: DEMO_TENANT.id,
          documentId: IDS.docApproved,
          versionMajor: 1,
          versionMinor: 0,
          title: approvedTitle,
          contentFormat: "MARKDOWN",
          markdownContent: approvedMd,
          documentSha256: approvedSha,
          lifecycleState: "APPROVED",
          authorId: authorUser.id,
          rowVersion: 3,
        },
        {
          id: IDS.verPublished1,
          tenantId: DEMO_TENANT.id,
          documentId: IDS.docPublished1,
          versionMajor: 1,
          versionMinor: 0,
          title: pub1Title,
          contentFormat: "MARKDOWN",
          markdownContent: LOTO_MARKDOWN,
          documentSha256: pub1Sha,
          lifecycleState: "PUBLISHED",
          authorId: authorUser.id,
          effectiveDate: publishedAt1,
          publishedAt: publishedAt1,
          publishedBy: qmUser.id,
          rowVersion: 3,
        },
        {
          id: IDS.verPublished2,
          tenantId: DEMO_TENANT.id,
          documentId: IDS.docPublished2,
          versionMajor: 1,
          versionMinor: 0,
          title: pub2Title,
          contentFormat: "MARKDOWN",
          markdownContent: GDP_MARKDOWN,
          documentSha256: pub2Sha,
          lifecycleState: "PUBLISHED",
          authorId: authorUser.id,
          effectiveDate: publishedAt2,
          publishedAt: publishedAt2,
          publishedBy: qmUser.id,
          rowVersion: 3,
        },
        {
          id: IDS.verPublished3,
          tenantId: DEMO_TENANT.id,
          documentId: IDS.docPublished3,
          versionMajor: 1,
          versionMinor: 0,
          title: pub3Title,
          contentFormat: "MARKDOWN",
          markdownContent: LAB_MARKDOWN,
          documentSha256: pub3Sha,
          lifecycleState: "PUBLISHED",
          authorId: authorUser.id,
          effectiveDate: publishedAt3,
          publishedAt: publishedAt3,
          publishedBy: qmUser.id,
          rowVersion: 3,
        },
      ])
      .onConflictDoNothing({ target: schema.documentVersions.id });

    // 5. Seed Approval Cycles & Steps
    await db
      .insert(schema.approvalCycles)
      .values([
        {
          id: IDS.cyclePending,
          tenantId: DEMO_TENANT.id,
          documentVersionId: IDS.verPending,
          cycleNumber: 1,
          submittedBy: authorUser.id,
          submittedSha256: pendingSha,
          status: "IN_PROGRESS",
          allowSelfApprovalOverride: false,
        },
        {
          id: IDS.cycleApproved,
          tenantId: DEMO_TENANT.id,
          documentVersionId: IDS.verApproved,
          cycleNumber: 1,
          submittedBy: authorUser.id,
          submittedSha256: approvedSha,
          status: "APPROVED",
          allowSelfApprovalOverride: false,
          closedAt: signedAt,
        },
        {
          id: IDS.cyclePublished1,
          tenantId: DEMO_TENANT.id,
          documentVersionId: IDS.verPublished1,
          cycleNumber: 1,
          submittedBy: authorUser.id,
          submittedSha256: pub1Sha,
          status: "APPROVED",
          allowSelfApprovalOverride: false,
          closedAt: publishedAt1,
        },
        {
          id: IDS.cyclePublished2,
          tenantId: DEMO_TENANT.id,
          documentVersionId: IDS.verPublished2,
          cycleNumber: 1,
          submittedBy: authorUser.id,
          submittedSha256: pub2Sha,
          status: "APPROVED",
          allowSelfApprovalOverride: false,
          closedAt: publishedAt2,
        },
        {
          id: IDS.cyclePublished3,
          tenantId: DEMO_TENANT.id,
          documentVersionId: IDS.verPublished3,
          cycleNumber: 1,
          submittedBy: authorUser.id,
          submittedSha256: pub3Sha,
          status: "APPROVED",
          allowSelfApprovalOverride: false,
          closedAt: publishedAt3,
        },
      ])
      .onConflictDoNothing({ target: schema.approvalCycles.id });

    await db
      .insert(schema.approvalSteps)
      .values([
        {
          id: IDS.stepPending1,
          tenantId: DEMO_TENANT.id,
          approvalCycleId: IDS.cyclePending,
          stepOrder: 1,
          assignedApproverId: approverUser.id,
          status: "PENDING",
        },
        {
          id: IDS.stepPending2,
          tenantId: DEMO_TENANT.id,
          approvalCycleId: IDS.cyclePending,
          stepOrder: 2,
          assignedApproverId: qmUser.id,
          status: "WAITING",
        },
        {
          id: IDS.stepApproved1,
          tenantId: DEMO_TENANT.id,
          approvalCycleId: IDS.cycleApproved,
          stepOrder: 1,
          assignedApproverId: approverUser.id,
          status: "APPROVED",
          actedByUserId: approverUser.id,
          actedByFullName: approverUser.name,
          actedByRole: approverUser.role,
          actedIpAddress: "127.0.0.1",
          authMethod: "PASSWORD_REAUTH",
          signedDocumentSha256: approvedSha,
          decisionIntent: "I approve SOP-QA-305 v1.0 for batch release verification.",
          selfApprovalOverrideUsed: false,
          actedAt: signedAt,
        },
        {
          id: IDS.stepPublished1,
          tenantId: DEMO_TENANT.id,
          approvalCycleId: IDS.cyclePublished1,
          stepOrder: 1,
          assignedApproverId: approverUser.id,
          status: "APPROVED",
          actedByUserId: approverUser.id,
          actedByFullName: approverUser.name,
          actedByRole: approverUser.role,
          actedIpAddress: "127.0.0.1",
          authMethod: "PASSWORD_REAUTH",
          signedDocumentSha256: pub1Sha,
          decisionIntent: "Verified LOTO isolation sequence against OSHA 1910.147.",
          selfApprovalOverrideUsed: false,
          actedAt: publishedAt1,
        },
        {
          id: IDS.stepPublished2,
          tenantId: DEMO_TENANT.id,
          approvalCycleId: IDS.cyclePublished2,
          stepOrder: 1,
          assignedApproverId: approverUser.id,
          status: "APPROVED",
          actedByUserId: approverUser.id,
          actedByFullName: approverUser.name,
          actedByRole: approverUser.role,
          actedIpAddress: "127.0.0.1",
          authMethod: "PASSWORD_REAUTH",
          signedDocumentSha256: pub2Sha,
          decisionIntent: "Approved GDP & deviation logging controls.",
          selfApprovalOverrideUsed: false,
          actedAt: publishedAt2,
        },
        {
          id: IDS.stepPublished3,
          tenantId: DEMO_TENANT.id,
          approvalCycleId: IDS.cyclePublished3,
          stepOrder: 1,
          assignedApproverId: approverUser.id,
          status: "APPROVED",
          actedByUserId: approverUser.id,
          actedByFullName: approverUser.name,
          actedByRole: approverUser.role,
          actedIpAddress: "127.0.0.1",
          authMethod: "PASSWORD_REAUTH",
          signedDocumentSha256: pub3Sha,
          decisionIntent: "Approved cleanroom environmental monitoring protocol.",
          selfApprovalOverrideUsed: false,
          actedAt: publishedAt3,
        },
      ])
      .onConflictDoNothing({ target: schema.approvalSteps.id });

    // 6. Seed Pending Read Assignments for Reader & QM
    const due7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const due5d = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

    await db
      .insert(schema.readAssignments)
      .values([
        {
          id: IDS.assignReader1,
          tenantId: DEMO_TENANT.id,
          documentVersionId: IDS.verPublished1,
          userId: readerUser.id,
          assignedViaGroupId: IDS.groupShiftA,
          status: "PENDING",
          dueAt: due7d,
        },
        {
          id: IDS.assignReader2,
          tenantId: DEMO_TENANT.id,
          documentVersionId: IDS.verPublished2,
          userId: readerUser.id,
          assignedViaGroupId: IDS.groupQa,
          status: "PENDING",
          dueAt: due5d,
        },
        {
          id: IDS.assignReader3,
          tenantId: DEMO_TENANT.id,
          documentVersionId: IDS.verPublished3,
          userId: readerUser.id,
          assignedViaGroupId: IDS.groupQa,
          status: "PENDING",
          dueAt: due5d,
        },
        {
          id: IDS.assignQm1,
          tenantId: DEMO_TENANT.id,
          documentVersionId: IDS.verPublished1,
          userId: qmUser.id,
          assignedViaGroupId: IDS.groupQa,
          status: "PENDING",
          dueAt: due7d,
        },
      ])
      .onConflictDoNothing({ target: schema.readAssignments.id });

    // 7. Seed Hash-Chained Audit Logs (only when ledger is empty for demo tenant)
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${DEMO_TENANT.id}::text))`
      );

      const [latest] = await tx
        .select({
          sequenceNumber: schema.auditLogs.sequenceNumber,
          entryHash: schema.auditLogs.entryHash,
        })
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.tenantId, DEMO_TENANT.id))
        .orderBy(desc(schema.auditLogs.sequenceNumber))
        .limit(1);

      if (latest) {
        return;
      }

      const entries: Array<{
        eventType: string;
        entityType: string;
        entityId: string;
        actorUserId: string;
        actorRole: typeof adminUser.role;
        payloadJson: Record<string, unknown>;
      }> = [
        {
          eventType: "WORKSPACE_CREATED",
          entityType: "TENANT",
          entityId: DEMO_TENANT.id,
          actorUserId: adminUser.id,
          actorRole: adminUser.role,
          payloadJson: {
            tenantSlug: DEMO_TENANT.slug,
            tenantName: DEMO_TENANT.name,
            creatorSeatLimit: 10,
            readerPackLimit: 500,
          },
        },
        {
          eventType: "WORKFLOW_SUBMITTED",
          entityType: "DOCUMENT_VERSION",
          entityId: IDS.verPending,
          actorUserId: authorUser.id,
          actorRole: authorUser.role,
          payloadJson: {
            documentCode: "SOP-SAF-201",
            versionLabel: "v1.0",
            submittedSha256: pendingSha,
            cycleNumber: 1,
          },
        },
        {
          eventType: "APPROVAL_GRANTED",
          entityType: "APPROVAL_STEP",
          entityId: IDS.stepApproved1,
          actorUserId: approverUser.id,
          actorRole: approverUser.role,
          payloadJson: {
            documentCode: "SOP-QA-305",
            documentVersionId: IDS.verApproved,
            versionLabel: "v1.0",
            signedDocumentSha256: approvedSha,
            isFinalStep: true,
          },
        },
        {
          eventType: "DOCUMENT_PUBLISHED",
          entityType: "DOCUMENT_VERSION",
          entityId: IDS.verPublished1,
          actorUserId: qmUser.id,
          actorRole: qmUser.role,
          payloadJson: {
            documentCode: "SOP-MFG-001",
            documentVersionId: IDS.verPublished1,
            versionLabel: "v1.0",
            documentSha256: pub1Sha,
          },
        },
        {
          eventType: "DOCUMENT_PUBLISHED",
          entityType: "DOCUMENT_VERSION",
          entityId: IDS.verPublished2,
          actorUserId: qmUser.id,
          actorRole: qmUser.role,
          payloadJson: {
            documentCode: "SOP-QA-002",
            documentVersionId: IDS.verPublished2,
            versionLabel: "v1.0",
            documentSha256: pub2Sha,
          },
        },
      ];

      let prevHash = "0".repeat(64);
      let seq = 1;

      for (const item of entries) {
        const entryHash = computeAuditHash({
          salt,
          prevHash,
          tenantId: DEMO_TENANT.id,
          sequenceNumber: seq,
          eventType: item.eventType,
          entityId: item.entityId,
          payloadJson: item.payloadJson,
        });

        await tx.insert(schema.auditLogs).values({
          tenantId: DEMO_TENANT.id,
          sequenceNumber: seq,
          eventType: item.eventType,
          entityType: item.entityType,
          entityId: item.entityId,
          actorUserId: item.actorUserId,
          actorRole: item.actorRole,
          actorIp: "127.0.0.1",
          payloadJson: item.payloadJson,
          prevHash,
          entryHash,
        });

        prevHash = entryHash;
        seq += 1;
      }
    });

    console.log(
      `Seeded demo workspace '${DEMO_TENANT.name}' (${DEMO_TENANT.id}) with ${DEMO_ACCOUNTS.length} accounts and 6 sample SOPs.`
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Failed to seed demo workspace:", err);
  process.exit(1);
});
