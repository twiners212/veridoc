# VeriDoc — Product Requirements Document (PRD)

> **App name:** VeriDoc — Document & SOP Approval Workspace. “VeriDoc” is the canonical product name throughout this package.

> **Status:** Slice 1 (Core Lifecycle MVP) — Requirements Baseline  
> **Primary Source:** Product Specification v3.0 (`CONFIRMED`)[cite: 2]  
> **Decision Authority:** Product Decision & Validation Log v3.0 (`CONFIRMED`)[cite: 1]  
> **Related Docs:** `README.md`, `docs/BUSINESS_LOGIC.md`, `docs/USER_FLOWS.md`, `docs/DECISIONS.md`

---

## 1. Product Goals & Positioning

### 1.1 Strategic Goals (`CONFIRMED`)
1. **Enforce Deterministic SOP Lifecycle Control:** Replace unstructured cloud storage (SharePoint, Google Drive) with strict gating across `Draft`, `Pending Approval`, `Approved`, `Published`, `Superseded`, and `Retired` states[cite: 2].
2. **Eliminate Unvetted Mid-Approval Changes:** Guarantee document version integrity via `SHA-256` payload hashing (`DEC-06`) and automatic approval invalidation upon edit (`DEC-04`)[cite: 1, 2].
3. **Deliver Audit Readiness in Minutes:** Provide hash-verified digital sign-offs, append-only hash-chained audit logs (`DEC-08`), and read-acknowledgment completion reports[cite: 1, 2].
4. **Enable Scalable Frontline Adoption:** Support high-volume, mobile-first read acknowledgments without punitive per-reader seat pricing (`DEC-01`, `DEC-07`)[cite: 1, 2].

### 1.2 Target Market (`CONFIRMED`)
* **Primary:** Mid-market manufacturing, logistics, healthcare operations, biotech services, and specialty food/beverage processors ($10M–$250M ARR; 50–1,000 employees)[cite: 2].
* **Secondary:** Growth-stage technology companies requiring ISO 27001 or SOC 2 Type II document control workflows[cite: 2].

---

## 2. Personas & Role Mapping (`CONFIRMED`)

The platform defines four primary target personas mapped to five RBAC roles[cite: 2]. Canonical role mapping (display name ↔ database enum — use the enum in code, the display name in UI): `Workspace Admin` ↔ `WORKSPACE_ADMIN`, `Quality Manager` ↔ `QUALITY_MANAGER`, `Document Author` ↔ `DOCUMENT_AUTHOR`, `Approver / Reviewer` ↔ `APPROVER_REVIEWER`, `Reader` ↔ `READER`. There is no `Viewer` role; `Reader` is the only read-only role.

| Persona | Primary RBAC Role(s) | Core Goals | Key Pain Points |
| :--- | :--- | :--- | :--- |
| **Elena — Quality & Compliance Manager** | `Quality Manager` (Primary Owner) | Enforce standardized SOP control, ensure audit readiness, maintain clear version lineages[cite: 2]. | Manual follow-ups for approvals/signatures; tracking read receipts in spreadsheets[cite: 2]. |
| **Marcus — Operations Director / Dept Lead** | `Approver / Reviewer`, `Document Author` | Rapidly update operational procedures without gridlock; maintain clear accountability[cite: 2]. | Missing approvers stalling rollouts; lack of visibility into approval status[cite: 2]. |
| **David — Frontline / Operational Worker** | `Reader` | Access current SOPs on mobile/tablet and acknowledge updates with minimal login friction[cite: 2]. | Cluttered UIs, losing track of updated procedures, complex desktop-only tools[cite: 2]. |
| **Sarah — IT System Administrator** | `Workspace Admin` | Enforce RBAC, maintain secure audit logs, minimize seat-licensing waste (and SSO in Slice 3)[cite: 2]. | Per-seat pricing penalties for passive readers; complex QMS deployment cycles[cite: 2]. |

---

## 3. Functional Requirements

> **Tagging Convention:**  
> * `CONFIRMED` — Directly defined in Product Specification v3.0 or Decision Log v3.0.  
> * `PROPOSED` — Derived implementation requirement or ID assigned for traceability.  
> * `UNRESOLVED` / `PARTIALLY VALIDATED` — Requires product confirmation or refinement.

### 3.1 Authoring, Uploads & Comparison
| ID | Requirement | Slice | Status | Source / Decision |
| :--- | :--- | :---: | :---: | :--- |
| **REQ-FR-101** | **Document Import:** Accept external PDF uploads up to 50MB in Slice 1[cite: 2]. *(Decided in this revision — T-01 RESOLVED: Slice 1 is PDF-only. `.docx` upload is NOT in Slice 1; it is deferred to Slice 2 with visual diffing (DEC-05). Spec v3.0 §7.1 originally listed `.docx` and `.pdf`; §§14 & 20 scope Slice 1 to PDF only, and that scoping governs.)* | Slice 1 (`.pdf` only) | `CONFIRMED` | Spec §7.1, §14, §20[cite: 2]; T-01 RESOLVED in DECISIONS.md §3 |
| **REQ-FR-102** | **Structured Markdown/Rich-Text Authoring:** Provide an integrated web editor supporting structured Markdown/Rich Text (headings, tables, callouts)[cite: 2]. | Slice 1 | `CONFIRMED` | Spec §7.1[cite: 2] |
| **REQ-FR-103** | **Format Standardization:** Render external uploads into a deterministic PDF/A preview format for viewing and sign-off[cite: 2]. *(In Slice 1, uploaded PDFs are rendered directly; `.docx`-to-PDF/A conversion is a Slice 2 capability, tied to REQ-FR-101 as deferred.)* | Slice 1 (PDF view) / Slice 2 (`.docx` render) | `CONFIRMED` | Spec §7.1, §17[cite: 2] |
| **REQ-FR-104a** | **Textual Markdown Diffing:** Provide textual diffing between native Markdown/Rich-Text document revisions[cite: 2]. | Slice 1 | `PARTIALLY VALIDATED` | Spec §7.1, `DEC-05`[cite: 1, 2] |
| **REQ-FR-104b** | **Visual Side-by-Side Comparison:** Provide visual/side-by-side comparison for uploaded `.docx` and cross-format revisions[cite: 2]. | Slice 2 | `CONFIRMED` (Deferred) | Spec §7.1, §14, `DEC-05`[cite: 1, 2] |

### 3.2 Workflow & Approval Management
| ID | Requirement | Slice | Status | Source / Decision |
| :--- | :--- | :---: | :---: | :--- |
| **REQ-FR-201a** | **Sequential Approval Workflows:** Support configurable multi-stage sequential approval chains (e.g., EH&S Lead → Operations VP)[cite: 2]. | Slice 1 | `CONFIRMED` | Spec §6, §7.2, §14[cite: 2] |
| **REQ-FR-201b** | **Parallel Approval Steps:** Support parallel approval stages within workflows[cite: 2]. | Slice 2 | `CONFIRMED` (Deferred) | Spec §7.2, §14[cite: 2] |
| **REQ-FR-202** | **Quorum / Threshold Approvals:** Support threshold rules (e.g., "Any 2 of 3 Quality Managers must approve")[cite: 2]. | Slice 2 | `CONFIRMED` (Deferred) | Spec §7.2, §14[cite: 2] |
| **REQ-FR-203** | **Approver Delegation Rules:** Allow approvers or Workspace Admins to configure temporary approval delegation to a peer with equal or higher RBAC permissions[cite: 2]. | Slice 2 | `CONFIRMED` (Deferred) | Spec §7.2, §9.3, §14[cite: 2] |
| **REQ-FR-204** | **Overdue Escalation:** Send reminders after 48 hours of inactivity and optional manager escalation after 96 hours[cite: 2]. | Slice 2 | `CONFIRMED` (Deferred) | Spec §7.2, §14[cite: 2] |
| **REQ-FR-205** | **Separation of Duties (`BR-APP-01`):** Prevent authors from approving their own submitted documents under standard policy (`DEC-03`)[cite: 1, 2]. Optional workspace-level "Single-Author Small-Org Override" flag (disabled by default)[cite: 2]. | Slice 1 | `VALIDATED` | Spec §9.1, `DEC-03`[cite: 1, 2] |
| **REQ-FR-206** | **Atomic Approval Invalidation (`BR-APP-02`):** Editing a document payload or critical metadata while in `Pending Approval` MUST atomically return the document to `Draft`, invalidate all collected approvals for that cycle, and log `APPROVAL_INVALIDATED_BY_EDIT`[cite: 2]. | Slice 1 | `VALIDATED` | Spec §9.2, `DEC-04`[cite: 1, 2] |
| **REQ-FR-207** | **Admin Approver Override (`BR-APP-04`):** Allow only a `Workspace Admin` to reassign an approval step when an approver is deactivated/unavailable, emitting an `ADMIN_APPROVER_OVERRIDE` audit record[cite: 2]. | Slice 1 | `CONFIRMED` | Spec §9.3, §19[cite: 2] |

### 3.3 Document Lifecycle, Versioning & Integrity
| ID | Requirement | Slice | Status | Source / Decision |
| :--- | :--- | :---: | :---: | :--- |
| **REQ-FR-301** | **Lifecycle State Management:** Enforce valid state transitions across `Draft`, `Pending Approval`, `Approved`, `Published`, `Superseded`, and `Retired`[cite: 2]. | Slice 1 | `CONFIRMED` | Spec §8[cite: 2] |
| **REQ-FR-302** | **Semantic Versioning:** Assign draft revisions (`v0.1`, `v0.2`), major published releases (`v1.0`, `v2.0`), and minor revisions (`v1.1`, `v1.2`)[cite: 2]. | Slice 1 | `CONFIRMED` | Spec §10.1[cite: 2] |
| **REQ-FR-303** | **Minor Administrative Edit Policy:** In Slice 1, minor revisions (`v1.1`) do **NOT** bypass full re-approval. A `Quality Manager` may flag a revision as a minor administrative edit, but it still goes through the full sequential approval cycle; the flag and justification are recorded for audit only[cite: 2]. The bypass itself (`publishMinorAdminEditAction`) is **NOT built in Slice 1** — it is a post-Slice-1 decision (see DECISIONS.md §4 OQ-02). | Slice 1 | `PARTIALLY VALIDATED` | Spec §10.1, §21[cite: 2] |
| **REQ-FR-304** | **SHA-256 Payload Hashing:** Compute a `SHA-256` digest of `(Text Content || Binary Attachments || Canonical Metadata)` upon workflow submission and bind approvals and acknowledgments to that exact digest[cite: 2]. | Slice 1 | `PRODUCT DECISION` | Spec §10.2, `DEC-06`[cite: 1, 2] |
| **REQ-FR-305** | **Version Immutability & Superseding:** Published versions are immutable; creating a revision generates a new working draft, and publishing it automatically transitions the prior active version to `Superseded`[cite: 2]. | Slice 1 | `CONFIRMED` | Spec §6, §8.1[cite: 2] |

### 3.4 Digital Sign-Offs & Audit Trail
| ID | Requirement | Slice | Status | Source / Decision |
| :--- | :--- | :---: | :---: | :--- |
| **REQ-FR-401** | **Sign-Off Re-Authentication:** Require re-authentication at the moment of approval sign-off[cite: 2]. *(Slice 1 `PROPOSED`: password re-entry via Better Auth; Slice 3: SAML SSO + WebAuthn MFA[cite: 2].)* | Slice 1 | `CONFIRMED` / `PROPOSED` (method) | Spec §11.1[cite: 2] |
| **REQ-FR-402** | **Sign-Off Metadata Capture:** Record Full Name, User ID, User Role, IP Address, UTC Timestamp, `SHA-256` Document Digest, and explicit Approval/Rejection Reason on every sign-off[cite: 2]. | Slice 1 | `CONFIRMED` | Spec §11.1[cite: 2] |
| **REQ-FR-403** | **Append-Only Hash-Chained Audit Trail:** Store all governance events in append-only tables with application-level cryptographic hash chaining[cite: 2]. | Slice 1 | `PARTIALLY VALIDATED` | Spec §11.2, `DEC-08`[cite: 1, 2] |
| **REQ-FR-404** | **Audit Packet Export:** Allow `Workspace Admin` and `Quality Manager` roles to export an Audit Packet containing version history, sign-off records, `SHA-256` digests, and reader acknowledgment logs[cite: 2]. *(Slice 1 `PROPOSED`: JSON + printable PDF summary.)* | Slice 1 | `CONFIRMED` / `PROPOSED` (format) | Spec §6 (`UC-04`), §13[cite: 2] |

### 3.5 Read Acknowledgment & Dashboards
| ID | Requirement | Slice | Status | Source / Decision |
| :--- | :--- | :---: | :---: | :--- |
| **REQ-FR-501** | **Target Audience Assignment:** Assign published SOPs to users by Department, Site Location, Job Role, or Custom User Groups with configurable completion deadlines (e.g., 7 days)[cite: 2]. | Slice 1 | `CONFIRMED` | Spec §12.1[cite: 2] |
| **REQ-FR-502** | **Reader Notification & Verification:** Notify assigned readers (in-app/email), track minimum scroll depth or viewing time in the viewer, and require an explicit binding click: *"I Acknowledge That I Have Read & Understand This SOP"*[cite: 2]. | Slice 1 | `CONFIRMED` | Spec §12.2[cite: 2] |
| **REQ-FR-503** | **Acknowledgment Record Binding:** Persist User ID, UTC Timestamp, Document Version, and `SHA-256` digest of the acknowledged version[cite: 2]. | Slice 1 | `CONFIRMED` | Spec §12.2, `DEC-06`[cite: 1, 2] |
| **REQ-FR-504** | **Completion Dashboards:** Provide visibility into pending approvals, overdue read acknowledgments, and department/document completion percentages[cite: 2]. | Slice 1 | `CONFIRMED` | Spec §14[cite: 2] |

### 3.6 Access Control, Multi-Tenancy & Commercial Tiering
| ID | Requirement | Slice | Status | Source / Decision |
| :--- | :--- | :---: | :---: | :--- |
| **REQ-FR-601** | **Multi-Tenant Workspaces:** Isolate all workspace data logically by `tenant_id` with database-level RLS enforcement[cite: 2]. | Slice 1 | `CONFIRMED` | Spec §17[cite: 2] |
| **REQ-FR-602** | **RBAC Enforcement:** Enforce the 5-role permission matrix (`Workspace Admin`, `Quality Manager`, `Document Author`, `Approver / Reviewer`, `Reader`) strictly server-side[cite: 2]. | Slice 1 | `CONFIRMED` | Spec §13[cite: 2] |
| **REQ-FR-603** | **Hybrid Creator + Reader Seat Tracking:** Differentiate billable **Creator Seats** (Admin, Quality Manager, Author, Approver) from **Operational Reader Packs** (100 / 500 / 2,000 reader tiers) in workspace quota tracking (`DEC-01`)[cite: 1, 2]. *(Billing gateway integration is `PROPOSED` as manual/config-driven in Slice 1.)* | Slice 1 (Quota tracking) | `PRODUCT DECISION` | Spec §16, `DEC-01`[cite: 1, 2] |

---

## 4. Non-Functional Requirements

| ID | Category | Requirement | Status | Source |
| :--- | :--- | :--- | :---: | :--- |
| **REQ-NFR-001** | **Performance** | Document preview rendering and `SHA-256` digest generation MUST complete in `< 1.5 seconds` for standard files up to 20MB, and in `< 5 seconds` for files from 20MB to the 50MB upload maximum, using streaming hashing without buffering the whole file in memory[cite: 2]. | `CONFIRMED` | Spec §17[cite: 2] |
| **REQ-NFR-002** | **Security & Isolation** | All tenant data MUST be isolated via `tenant_id` scoping and PostgreSQL Row-Level Security (RLS)[cite: 2]. Client-side validation MUST never be relied upon as a security boundary. | `CONFIRMED` | Spec §17[cite: 2] |
| **REQ-NFR-003** | **Encryption** | Document binaries MUST be stored in AES-256 encrypted private object storage (Supabase Storage) accessed via short-lived server-issued signed URLs[cite: 2]. All transit traffic MUST use TLS. | `CONFIRMED` | Spec §17[cite: 2] |
| **REQ-NFR-004** | **Data Integrity & Concurrency** | State transitions, approval invalidations, and audit log appends MUST execute atomically inside PostgreSQL transactions to prevent race conditions. | `PROPOSED` | Spec §9.2, §11.2[cite: 2] |
| **REQ-NFR-005** | **Usability & Mobile PWA** | Reader workflows MUST operate as a responsive, mobile-first Progressive Web App (PWA) suitable for tablets and smartphones (`DEC-07`)[cite: 1, 2]. | `CONFIRMED` (Slice 1) / `UNRESOLVED` (Offline Native) | Spec §4.2, §21, `DEC-07`[cite: 1, 2] |
| **REQ-NFR-006** | **Compliance Accuracy** | Product UI, exports, and documentation MUST NOT claim out-of-the-box FDA 21 CFR Part 11 certification (`DEC-02`), eIDAS QES, or absolute tamper-proofness (`DEC-08`)[cite: 1, 2]. | `CONFIRMED` | Spec §11.2, §18.1, `DEC-02`, `DEC-08`[cite: 1, 2] |

---

## 5. MVP Boundaries & Out-of-Scope Features

### 5.1 Slice 1 Active Scope (Build Now) (`CONFIRMED`)
* Multi-tenant workspace creation, Better Auth email/password authentication, and 5-role RBAC[cite: 2].
* Structured Markdown/Rich-Text editor, PDF upload (up to 50MB), and textual Markdown diffing[cite: 2].
* Sequential approval workflows, separation of duties (`DEC-03`), Admin approver override, and atomic invalidation on edit (`DEC-04`)[cite: 1, 2].
* `SHA-256` payload hashing (`DEC-06`) and append-only hash-chained audit trail (`DEC-08`)[cite: 1, 2].
* Published SOP distribution to target groups, binding read acknowledgments, completion dashboards, and Audit Packet export[cite: 2].
* Responsive mobile-first PWA (`DEC-07`) and Creator vs. Reader quota modeling (`DEC-01`)[cite: 1, 2].

### 5.2 Explicitly Deferred (Slice 2 & Slice 3 — Do NOT Build in MVP) (`CONFIRMED`)
* **Slice 2:** Parallel approvals, quorum/threshold approvals ("2 of 3"), approver delegation engine, automated 48h/96h overdue escalations, visual side-by-side `.docx` diffing (`DEC-05`)[cite: 1, 2].
* **Slice 3:** SAML 2.0 SSO, SCIM user provisioning, webhook subscriptions, public Enterprise REST API, FDA 21 CFR Part 11 validation package (`DEC-02`), hardware PKI certificate sign-offs, and offline native iOS/Android apps (`DEC-07`)[cite: 1, 2].

### 5.3 Permanently Out of Scope / Disproven (`CONFIRMED`)
* **Universal Per-User Seat Pricing (`DEC-01` — `DISPROVEN`):** Rejected; never price frontline readers at full creator seat rates[cite: 1, 2].
* **Out-of-the-Box FDA 21 CFR Part 11 Compliance Claims (`DEC-02` — `DISPROVEN`):** Prohibited in MVP[cite: 1, 2].
* **Full Enterprise QMS Modules:** CAPA, non-conformance tracking, calibration, or training LMS suites[cite: 2].
* **Generic Contract E-Signature Suite:** External counterparty contract signing (DocuSign/Adobe Sign replacement) or eIDAS QES[cite: 2].
* **Real-Time Multi-Cursor Collaborative Editing:** Simultaneous Google Docs-style editing is not part of the controlled SOP authoring model[cite: 2].

---

## 6. Slice 1 Acceptance Criteria (`CONFIRMED` / `PROPOSED`)

### AC-01: Structured SOP Creation & Sequential Approval (`UC-01`)
* **Given** an authenticated `Document Author` creates a Markdown SOP or uploads a PDF (`v0.1`), configures a sequential approval chain (`Approver A → Approver B`), and submits it:
* **Then** the document transitions to `Pending Approval`, becomes locked for editing, computes and stores a `SHA-256` digest, and notifies `Approver A`[cite: 2].
* **And** if the author attempts to approve their own document under standard policy, the server rejects the request (`403 Forbidden`) (`DEC-03`)[cite: 1, 2].
* **And** `Approver B` cannot approve before `Approver A` completes sign-off.
* **And** upon re-authentication and approval by both approvers, the document transitions to `Approved` with two digest-bound sign-off records and hash-chained audit entries[cite: 2].

### AC-02: Atomic Invalidation on Mid-Approval Edit (`UC-03`, `DEC-04`)
* **Given** a document is in `Pending Approval` and `Approver A` has already signed off:
* **When** an authorized editor edits the document content, attachment, or critical metadata:
* **Then** within a single database transaction, the document transitions back to `Draft`, `Approver A`'s sign-off is marked invalidated for that cycle, the version increments (`v0.1 → v0.2`), and an `APPROVAL_INVALIDATED_BY_EDIT` audit entry is appended[cite: 2].

### AC-03: Publication & Mandatory Read Acknowledgment (`UC-02`)
* **Given** a `Quality Manager` or `Workspace Admin` publishes an `Approved` document (`v1.0`) and assigns it to "Shift A Operations" with a 7-day deadline:
* **Then** the document becomes `Published`, any prior active version transitions to `Superseded`, and assigned `Reader` users see the pending task in the mobile PWA[cite: 2].
* **When** a `Reader` views the SOP (meeting scroll/view threshold) and clicks *"I Acknowledge That I Have Read & Understand This SOP"*:
* **Then** the system records the acknowledgment bound to the exact `v1.0` `SHA-256` digest, updates the completion dashboard, and appends an audit log entry[cite: 2].

### AC-04: External Audit Packet Verification (`UC-04`)
* **Given** a `Quality Manager` requests an Audit Packet for an SOP:
* **Then** the system generates an export containing version lineage, `SHA-256` digests, all sign-off metadata (actor, role, timestamp, IP, intent, digest), invalidation history, and time-stamped reader acknowledgments[cite: 2].
* **And** audit chain verification confirms no gaps or broken hashes in the exported sequence (`DEC-08`)[cite: 1, 2].

### AC-05: Strict Tenant & Role Isolation (`REQ-NFR-002`)
* **Given** two separate workspaces (Tenant A and Tenant B):
* **Then** no API call, Server Action, direct URL, or database query executed under a Tenant A session can read, modify, or generate signed storage URLs for any Tenant B document, audit log, or user record.

---

## 7. Requirement Traceability Matrix

| Requirement ID | Use Case | Product Decision | Business Rule | Slice | Downstream Docs |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `REQ-FR-101`–`103` | `UC-01` | — | — | 1 (PDF only; `.docx` Slice 2) | `ARCHITECTURE.md`, `API_SPECIFICATION.md`, `SECURITY.md` |
| `REQ-FR-104a` | `UC-03` | `DEC-05` (`PARTIALLY VALIDATED`) | — | 1 | `ARCHITECTURE.md`, `DESIGN_SYSTEM.md` |
| `REQ-FR-104b` | `UC-03` | `DEC-05` (`PARTIALLY VALIDATED`) | — | 2 | `DECISIONS.md` |
| `REQ-FR-201a`, `207` | `UC-01` | — | `BR-APP-04` | 1 | `BUSINESS_LOGIC.md`, `DATABASE_SCHEMA.md` |
| `REQ-FR-201b`–`204` | `UC-01` | — | `BR-APP-03` | 2 | `BUSINESS_LOGIC.md`, `DECISIONS.md` |
| `REQ-FR-205` | `UC-01` | `DEC-03` (`VALIDATED`) | `BR-APP-01` | 1 | `BUSINESS_LOGIC.md`, `SECURITY.md`, `TESTING_STRATEGY.md` |
| `REQ-FR-206` | `UC-03` | `DEC-04` (`VALIDATED`) | `BR-APP-02` | 1 | `BUSINESS_LOGIC.md`, `DATABASE_SCHEMA.md`, `TESTING_STRATEGY.md` |
| `REQ-FR-301`–`305` | `UC-01`, `UC-03` | `DEC-06` (`PRODUCT DECISION`) | — | 1 | `BUSINESS_LOGIC.md`, `DATABASE_SCHEMA.md`, `SECURITY.md` |
| `REQ-FR-401`–`404` | `UC-01`, `UC-04` | `DEC-02`, `DEC-06`, `DEC-08` | — | 1 | `SECURITY.md`, `DATABASE_SCHEMA.md`, `API_SPECIFICATION.md` |
| `REQ-FR-501`–`504` | `UC-02`, `UC-04` | `DEC-06`, `DEC-07` | — | 1 | `USER_FLOWS.md`, `DESIGN_SYSTEM.md`, `API_SPECIFICATION.md` |
| `REQ-FR-601`–`603` | All | `DEC-01` (`DISPROVEN` → `PRODUCT DECISION`) | — | 1 | `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `SECURITY.md` |
| `REQ-NFR-001`–`006` | All | `DEC-02`, `DEC-07`, `DEC-08` | — | 1 | `ARCHITECTURE.md`, `SECURITY.md`, `TESTING_STRATEGY.md` |
