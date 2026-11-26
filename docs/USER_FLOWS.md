# VeriDoc — User Flows & Interaction Diagrams

> **App name:** VeriDoc — Document & SOP Approval Workspace. “VeriDoc” is the canonical product name throughout this package.

> **Status:** Slice 1 (Core Lifecycle MVP) — User Journey Baseline  
> **Primary Source:** Product Specification v3.0 (`CONFIRMED`)  
> **Decision Authority:** Product Decision & Validation Log v3.0 (`CONFIRMED`)[cite: 1]  
> **Related Docs:** `docs/PRODUCT_REQUIREMENTS.md`, `docs/BUSINESS_LOGIC.md`, `docs/DESIGN_SYSTEM.md`, `docs/API_SPECIFICATION.md`

---

## 1. Role-to-Flow Matrix (`CONFIRMED`)

| RBAC Role | Primary Workspace Flows (Slice 1) | Seat Type (`DEC-01`) |
| :--- | :--- | :--- |
| **Workspace Admin** | Tenant setup, user/role & group management, seat quota monitoring, Admin Approver Override (`BR-APP-04`), SOP governance & Audit Packet export. | Creator Seat |
| **Quality Manager** | Approval oversight, publishing & target audience rollout, minor administrative edit bypass (`PARTIALLY VALIDATED`), completion dashboard tracking, Audit Packet export (`UC-04`). | Creator Seat |
| **Document Author** | Markdown authoring / PDF upload, sequential workflow setup, submission (`SHA-256`), revision creation, textual Markdown diffing (`DEC-05`), recall/edit. | Creator Seat |
| **Approver / Reviewer** | Sequential approval queue, SOP & diff review, password re-authentication, digest-bound approval or rejection with reason. | Creator Seat |
| **Reader** | Mobile-first PWA access (`DEC-07`), viewing published SOPs, engagement verification, binding read acknowledgment (`UC-02`). | Operational Reader Pack |

---

## 2. Workspace Admin Flow (`CONFIRMED`)

The **Workspace Admin** (e.g., Sarah, IT System Administrator) configures the tenant, manages RBAC roles and user groups, monitors Creator vs. Reader Pack capacity (`DEC-01`), resolves stalled approvals via `BR-APP-04`, and exports audit evidence.

```mermaid
flowchart TD
    A[Sign In via Better Auth] --> B[Workspace Admin Dashboard]
    B --> C{Select Admin Action}
    C -->|User & Group Mgmt| D[Invite User & Assign RBAC Role]
    D --> E{Check Seat Quota DEC-01}
    E -->|Quota Available| F[Create User & Assign Department/Site/Group]
    E -->|Quota Exceeded| G[Block & Show Pack Upgrade Notice]
    F --> H[Append USER_ROLE_ASSIGNED Audit Log]

    C -->|Workspace Governance| I[Configure Settings e.g., Single-Author Override Flag]
    I --> J[Save Setting & Append WORKSPACE_SETTING_UPDATED Audit Log]

    C -->|Blocked Approval Override BR-APP-04| K[View Stalled Approval Step]
    K --> L[Select Eligible Replacement Approver]
    L --> M[Enter Mandatory Override Justification]
    M --> N{Validate RBAC & Separation of Duties BR-APP-01}
    N -->|Valid| O[Reassign Step & Append ADMIN_APPROVER_OVERRIDE Audit Log]
    N -->|Invalid| P[Reject Reassignment 403/422]

    C -->|Audit Export| Q[Select SOP or Date Range]
    Q --> R[Export Hash-Verified Audit Packet UC-04]
Step-by-Step SummaryUser Provisioning & Group Assignment: Admin invites users and assigns one of the five RBAC roles (Workspace Admin, Quality Manager, Document Author, Approver / Reviewer, Reader) plus target audience attributes (Department, Site Location, Job Role, Custom Groups).   Quota Check (DEC-01): System counts Creator Seats separately from Operational Reader Pack tiers (100 / 500 / 2,000 readers).   Admin Approver Override (BR-APP-04): When an approver is deactivated or unavailable, only the Workspace Admin can reassign the pending step to an eligible peer while still enforcing BR-APP-01 (separation of duties) and logging ADMIN_APPROVER_OVERRIDE.   Governance Settings: Admin manages workspace-level flags (such as the disabled-by-default allow_single_author_override flag from BR-APP-01).   3. Quality Manager Flow (CONFIRMED)The Quality Manager (e.g., Elena) oversees SOP lifecycle compliance, publishes approved SOPs to frontline teams, monitors read-acknowledgment completion rates, and generates external Audit Packets (UC-04).   Cuplikan kodeflowchart TD
    A[Sign In] --> B[Quality Governance Dashboard]
    B --> C{Select Task}

    C -->|Publish Approved SOP| D[Open APPROVED Document Version]
    D --> E[Configure Target Groups & Completion Deadline e.g. 7 Days]
    E --> F[Set Immediate or Scheduled Effective Date]
    F --> G[Confirm Publication]
    G --> H[Atomic TX: Set PUBLISHED, Supersede Prior Version, Create Read Assignments, Log Audit]
    H --> I[Notify Assigned Readers]

    C -->|Monitor Compliance| J[View Completion & Overdue Dashboard]
    J --> K[Filter by SOP, Department, or Overdue Status]

    C -->|Minor Admin Edit (flag only, full approval still required) PARTIALLY VALIDATED| L[Open Draft Revision v1.1]
    L --> M[Flag as Minor Administrative Edit BR-VER-03 (audit metadata only)]
    M --> N[Provide Mandatory Audit Justification]
    N --> O[Submit for Full Sequential Approval & Log MINOR_EDIT_FLAGGED]

    C -->|External Audit Inspection UC-04| P[Select Document & Version Range]
    P --> Q[Verify Audit Hash Chain Integrity DEC-08]
    Q --> R[Download Audit Packet JSON / Printable PDF]
Step-by-Step SummaryPublishing & Rollout (UC-02): Opens an APPROVED SOP, defines target audience groups (Department, Site, Job Role, or Custom Group) and deadline (e.g., 7 days), and publishes. The system atomically supersedes any prior active version and dispatches reader notifications.   Completion Tracking: Tracks percentage of readers who acknowledged each active SOP and identifies overdue workers.   Minor Administrative Edit (PARTIALLY VALIDATED, BR-VER-03 — NO bypass in Slice 1): For non-substantive typo fixes (v1.1, v1.2), the Quality Manager may flag the revision as minor with a mandatory written justification recorded in the audit trail, but the revision still requires full sequential approval in Slice 1.   Audit Packet Export (UC-04): Generates a cryptographically bound Audit Packet containing version lineage, SHA-256 digests, sign-off records, invalidation history, and time-stamped read acknowledgments.   4. Document Author Flow (CONFIRMED)The Document Author creates or revises SOPs using the structured Markdown/Rich-Text editor or PDF upload, compares Markdown revisions (DEC-05), configures the sequential approval chain, and submits the version for review (UC-01, UC-03).   Cuplikan kodeflowchart TD
    A[Sign In] --> B[Documents Library]
    B --> C{New SOP or Revision?}
    C -->|New SOP| D[Create Document Container e.g., SOP-SAF-004 v0.1]
    C -->|Revise Published SOP| E[Clone Published Version into New Draft Revision UC-03]
    D --> F{Authoring Mode}
    E --> F
    F -->|Web Editor| G[Edit Structured Markdown / Rich Text]
    F -->|File Upload| H[Upload PDF <= 50MB]
    G --> I[Optional: View Textual Markdown Diff vs Prior Version DEC-05]
    H --> J[Server Validates Magic Bytes & Stores in Private Bucket]
    I --> K[Configure Sequential Approval Chain Step 1 -> Step N]
    J --> K
    K --> L[Click Submit for Approval]
    L --> M{Server Validation}
    M -->|Self-Approval Violation BR-APP-01| N[Show Error: Author Cannot Be Sole Approver]
    M -->|Valid| O[Compute SHA-256 Digest & Lock Payload DEC-06]
    O --> P[Transition to PENDING_APPROVAL & Notify Step 1 Approver]
Step-by-Step SummaryDrafting (REQ-FR-101, REQ-FR-102): Author writes structured Markdown (headings, tables, callouts) or uploads a PDF up to 50MB.   Revision Comparison (DEC-05): When revising a Markdown SOP, the author can inspect a textual diff against the previous version.   Workflow Configuration (REQ-FR-201a): Author selects an ordered sequence of approvers (Step 1 → Step 2 → ... → Step N).   Submission (DEC-06): On submit, the server validates separation of duties (BR-APP-01), computes the SHA-256 payload digest, locks the draft against silent edits, transitions state to PENDING_APPROVAL, and notifies Step 1's approver.   Post-Submission Edit / Recall (DEC-04): If the author needs to modify a PENDING_APPROVAL SOP, the UI warns that editing will immediately invalidate all collected approvals and return the document to DRAFT.   5. Approver / Reviewer Flow (CONFIRMED)The Approver / Reviewer (e.g., Marcus, Operations Director) reviews assigned SOPs in strict sequential order, verifies content and changes, re-authenticates, and executes a digest-bound sign-off or rejection (UC-01).   Cuplikan kodesequenceDiagram
    actor Approver
    participant UI as Next.js App
    participant Server as Approval Service (Server)
    participant Auth as Better Auth
    participant DB as Supabase PostgreSQL

    Approver->>UI: Open Pending Approval Queue
    UI->>Server: Fetch Active Assigned Steps
    Server-->>UI: Return SOPs where Approver is Current Active Step
    Approver->>UI: Open SOP Preview (Markdown/PDF + Textual Diff)
    Approver->>UI: Choose Approve or Reject + Enter Reason/Intent
    UI->>Approver: Prompt Password Re-Authentication (Slice 1 PROPOSED)
    Approver->>UI: Submit Re-Auth Credentials + Sign-Off Intent
    UI->>Server: Execute Sign-Off Mutation
    Server->>Auth: Verify Password Re-Authentication
    Auth-->>Server: Verified
    Server->>DB: BEGIN TX & SELECT document_version FOR UPDATE
    Server->>Server: Validate RBAC, Active Step, Separation of Duties (BR-APP-01), & SHA-256 Match (DEC-06)
    alt Approve Action
        Server->>DB: Record Sign-Off (Name, Role, IP, UTC, SHA-256, Intent)
        alt More Sequential Steps Remain
            Server->>DB: Activate Next Step (step_order + 1)
        else Final Step Approved
            Server->>DB: Transition Version to APPROVED
        end
        Server->>DB: Append Hash-Chained Audit Log (APPROVAL_GRANTED)
    else Reject Action
        Server->>DB: Mark Cycle REJECTED & Transition Version to DRAFT
        Server->>DB: Append Hash-Chained Audit Log (APPROVAL_REJECTED)
    end
    Server->>DB: COMMIT TX
    Server-->>UI: Return Confirmation & Receipt
Step-by-Step SummaryQueue Filtering: Approver only sees actionable items where their step is the current active step in the sequence (BR-SEQ-02). Future steps appear as read-only "Waiting on Previous Approver" (PROPOSED).Review & Diff: Approver reviews the rendered Markdown or private signed-URL PDF preview and optional textual Markdown diff[cite: 2].Re-Authentication & Intent (REQ-FR-401, REQ-FR-402): Approver enters their sign-off intent (or mandatory rejection feedback) and completes password re-authentication[cite: 2].Atomic Commit: Server verifies BR-APP-01 (not author) and DEC-06 (SHA-256 match), writes the immutable sign-off record, advances the workflow or transitions to APPROVED / DRAFT, and appends the hash-chained audit entry.   6. Reader Flow — Mobile-First PWA (CONFIRMED)The Reader (e.g., David, Frontline / Operational Worker) accesses assigned SOPs from a smartphone, tablet, or desktop browser via the responsive PWA (DEC-07) and completes mandatory read acknowledgments (UC-02).   Cuplikan kodeflowchart TD
    A[Receive Email / In-App Notification] --> B[Open Mobile PWA Link]
    B --> C{Authenticated Session?}
    C -->|No| D[Sign In via Password or Magic Link PROPOSED]
    C -->|Yes| E[My Assigned SOPs Queue]
    D --> E
    E --> F[Tap Assigned Published SOP]
    F --> G[Server Issues Short-Lived Signed URL for PDF / Renders Markdown]
    G --> H[Reader Views SOP Content]
    H --> I{Engagement Gate Met? >= 90% Scroll / All Pages & >= 10s PROPOSED}
    I -->|No| J[Acknowledge Button Disabled with Progress Prompt]
    J --> H
    I -->|Yes| K[Enable Binding Button: 'I Acknowledge That I Have Read & Understand This SOP']
    K --> L[Reader Taps Acknowledge]
    L --> M[Server Records User ID, UTC Timestamp, Version, & SHA-256 Digest DEC-06]
    M --> N[Append READ_ACKNOWLEDGED Audit Log & Update Completion Dashboard]
    N --> O[Display Acknowledgment Receipt]
Step-by-Step SummaryLow-Friction Access (DEC-07): Frontline worker opens the notification link on mobile/tablet in the responsive PWA[cite: 1, 2].Controlled Viewing: Published SOP renders cleanly for small viewports (responsive Markdown or mobile-friendly PDF viewer via short-lived signed URL)[cite: 2].Verification Gate (REQ-FR-502): Viewer tracks scroll depth / page progress and minimum dwell time before unlocking the acknowledgment action[cite: 2].Binding Acknowledgment (REQ-FR-503): Tapping "I Acknowledge That I Have Read & Understand This SOP" records the user ID, UTC timestamp, document version, and exact SHA-256 digest, immediately updating Quality Manager dashboards[cite: 2].7. Error, Concurrency & Exception Flows (CONFIRMED / PROPOSED)7.1 Mid-Approval Edit Invalidation Flow (DEC-04 — VALIDATED, BR-APP-02)Cuplikan kodesequenceDiagram
    actor Author
    participant UI as Next.js App
    participant Server as Document Service
    participant DB as Supabase PostgreSQL
    actor Approver1 as Approver 1 (Already Signed)

    Author->>UI: Click "Edit Document" on PENDING_APPROVAL SOP
    UI->>Author: Display Blocking Warning Modal ("Editing will invalidate all collected approvals")
    Author->>UI: Confirm Edit & Save Changes
    UI->>Server: Update Document Payload
    Server->>DB: BEGIN TX & SELECT document_version FOR UPDATE
    Server->>DB: Mark Active Approval Cycle & Prior Steps INVALIDATED
    Server->>DB: Update Payload, Increment Revision (v0.1 -> v0.2), Set State = DRAFT
    Server->>DB: Append APPROVAL_INVALIDATED_BY_EDIT Audit Log
    Server->>DB: COMMIT TX
    Server-->>Approver1: Send Notification (Previous Sign-Off Invalidated)
    Server-->>UI: Redirect to Editable Draft v0.2
7.2 Exception Handling MatrixScenarioTriggerSystem Response & HTTP/Action Code (PROPOSED)Audit EventSelf-Approval Attempt (DEC-03, BR-APP-01)Author attempts to approve their own document without active small-org override[cite: 1, 2].Reject immediately with 403 Forbidden (SELF_APPROVAL_PROHIBITED); display clear governance policy message.SECURITY_POLICY_VIOLATION (PROPOSED)Concurrent Edit vs. Sign-Off RaceApprover submits sign-off at the exact millisecond Author commits an edit.Second transaction fails on row lock / state check with 409 Conflict (APPROVAL_CYCLE_INVALIDATED or VERSION_LOCKED); UI prompts reload.None (aborted TX)Out-of-Order Sequential ApprovalApprover 2 attempts to approve before Approver 1 completes sign-off (BR-SEQ-02).Reject with 409 Conflict (APPROVAL_STEP_NOT_ACTIVE).NoneInactive / Deactivated ApproverAssigned approver account is disabled mid-cycle (BR-APP-04)[cite: 2].Workflow pauses in PENDING_APPROVAL with BLOCKED_INACTIVE_APPROVER badge; alerts Workspace Admin to execute override[cite: 2].ADMIN_APPROVER_OVERRIDE (upon Admin action)[cite: 2]SHA-256 Digest Mismatch (DEC-06)Stored payload hash does not match re-computed payload hash during sign-off or publish[cite: 1, 2].Abort transaction with 422 Unprocessable Entity (INTEGRITY_HASH_MISMATCH); block sign-off and alert Workspace Admin / Quality Manager.INTEGRITY_HASH_MISMATCH (PROPOSED)Invalid PDF Upload (REQ-FR-101)File exceeds 50MB, is 0 bytes, or fails %PDF- magic-byte inspection[cite: 2].Reject upload with 400 Bad Request (INVALID_FILE_PAYLOAD); do not persist object to Supabase Storage.NoneCross-Tenant or Unauthorized Role AccessUser attempts to fetch another tenant's SOP or invoke an unauthorized action (e.g., Reader trying to publish).Server policy + PostgreSQL RLS deny access; return 404 Not Found (for cross-tenant resources to prevent existence enumeration) or 403 Forbidden (for insufficient role).UNAUTHORIZED_ACCESS_ATTEMPT (PROPOSED)
