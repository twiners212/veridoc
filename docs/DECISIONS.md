# VeriDoc — Product & Architectural Decision Records

> **App name:** VeriDoc — Document & SOP Approval Workspace. “VeriDoc” is the canonical product name throughout this package.

> **Status:** Slice 1 (Core Lifecycle MVP) — Decision Baseline  
> **Decision Authority:** Product Decision & Validation Log v3.0 (`CONFIRMED`)[cite: 1]  
> **Requirements Authority:** Product Specification v3.0 (`CONFIRMED`)[cite: 2]  
> **Related Docs:** `README.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/BUSINESS_LOGIC.md`, `docs/ARCHITECTURE.md`, `VALIDATION_REPORT.md`

---

## 1. Classification & Authority Rules (`CONFIRMED`)

This document maintains a strict separation between **Authoritative Product Decisions (`DEC-01`–`DEC-08`)** imported from the Product Decision & Validation Log[cite: 1] and **Proposed Technical Architecture Decisions (`ADR-01`–`ADR-08`)** introduced during engineering design.

### Preserved Decision Classifications[cite: 1]
* **`VALIDATED`:** Supported by direct market research, customer feedback, or validation findings[cite: 1].
* **`PARTIALLY VALIDATED`:** Supported by initial evidence, but subject to operational refinement[cite: 1].
* **`DISPROVEN`:** Original assumption contradicted by validation evidence; corrective action taken[cite: 1]. Must NEVER be reinterpreted as an active requirement.
* **`UNRESOLVED`:** Insufficient data available; categorized for future research[cite: 1]. Must NEVER be silently converted into a confirmed requirement.
* **`PRODUCT DECISION`:** Deliberate strategic or architectural choice made by product leadership[cite: 1].
* **`PROPOSED`:** Engineering or technical default recommended by architecture documentation; requires team confirmation and is distinct from confirmed product decisions.

---

## 2. Authoritative Product Decisions (`DEC-01` through `DEC-08`)

### DEC-01: Pricing Model Strategy
* **Classification:** **`DISPROVEN`** (Original per-seat assumption) $\rightarrow$ **`PRODUCT DECISION`** (Revised Hybrid model)[cite: 1].
* **Item:** Per-User Seat Pricing vs. Hybrid Creator + Reader Tier Model[cite: 1].
* **Rationale:** Validation findings proved that charging $15/user/month for non-desk or frontline operational workers causes high churn and limits organization-wide adoption[cite: 1]. Operational companies refuse to pay high monthly seat fees for workers who only acknowledge SOPs periodically[cite: 1, 2].
* **Source Reference:** Product Decision & Validation Log (`DEC-01`, VALIDATION_REPORT.md §4 (Decision Coverage Audit))[cite: 1]; Product Specification v3.0 §16 (Creator Seats at $25–$45/creator/month + Operational Reader Packs at $99 / $299 / $699 flat tiers for 100 / 500 / 2,000 readers)[cite: 2]. The 2,000-reader tier exceeds the 50–1,000-employee core target deliberately: it covers contractors, temps and multi-site workforces beyond headcount. `creator_seat_limit DEFAULT 10` in DATABASE_SCHEMA.md §4.2 is a development/seed default, not a commercial tier.
* **Slice 1 Implementation Implications:**
  * Separate `creator_seat_limit` and `reader_pack_limit` columns on `tenants` (`docs/DATABASE_SCHEMA.md`).
  * `inviteWorkspaceMemberAction` counts `WORKSPACE_ADMIN`, `QUALITY_MANAGER`, `DOCUMENT_AUTHOR`, and `APPROVER_REVIEWER` against Creator Seats, and `READER` exclusively against Reader Packs (`REQ-FR-603`, `402 SEAT_QUOTA_EXCEEDED`).
  * **Prohibited:** Never implement universal per-user seat billing that penalizes passive readers.

---

### DEC-02: Universal FDA 21 CFR Part 11 Compliance Claim
* **Classification:** **`DISPROVEN`**[cite: 1].
* **Item:** Out-of-the-box Part 11 Compliance for initial MVP launch[cite: 1].
* **Rationale:** FDA Part 11 compliance requires complex system validation (IQ/OQ/PQ protocols), strict biometrics/two-component electronic signatures, and customer-specific operational controls[cite: 1]. Claiming universal compliance in an MVP is inaccurate and introduces legal liability[cite: 1].
* **Source Reference:** Product Decision & Validation Log (`DEC-02`, VALIDATION_REPORT.md §4 (Decision Coverage Audit))[cite: 1]; Product Specification v3.0 §18.1 & §14 (Slice 3)[cite: 2].
* **Slice 1 Implementation Implications:**
  * Product UI, documentation, and Audit Packet exports MUST position the platform as assisting with **ISO 9001**, **ISO 27001**, **SOC 2 Type II**, and **GMP** document control guidelines[cite: 2].
  * Enhanced FDA 21 CFR Part 11 validation packages and PKI signature integrations are strictly deferred to Slice 3[cite: 2].
  * **Prohibited:** Never display *"FDA 21 CFR Part 11 Certified/Compliant"* claims in MVP UI, marketing copy, or exports (enforced by `e2e/compliance-copy-guard.spec.ts`).

---

### DEC-03: Separation of Duties & Self-Approval Prevention
* **Classification:** **`VALIDATED`**[cite: 1].
* **Item:** Restricting authors from approving their own submitted SOPs[cite: 1].
* **Rationale:** Quality management standards (ISO 9001:2015, GMP) require independent verification of operational procedures[cite: 1]. Allowing self-approval undermines governance integrity[cite: 1].
* **Source Reference:** Product Decision & Validation Log (`DEC-03`, VALIDATION_REPORT.md §4 (Decision Coverage Audit))[cite: 1]; Product Specification v3.0 §9.1 (`BR-APP-01`)[cite: 2].
* **Slice 1 Implementation Implications:**
  * Enforced at workflow submission, inside `executeApprovalDecisionAction` (`403 SELF_APPROVAL_PROHIBITED`), and via a PostgreSQL `BEFORE INSERT OR UPDATE` trigger on `approval_steps` (join via `approval_cycles` to `document_versions.author_id`; see DATABASE_SCHEMA.md §5.3) (`docs/DATABASE_SCHEMA.md` §5.3).
  * See Tension `T-02` below regarding the opt-in "Single-Author Small-Org Override" flag from Spec §9.1[cite: 2].

---

### DEC-04: Active Approval Reset on Document Modification
* **Classification:** **`VALIDATED`**[cite: 1].
* **Item:** Automatically invalidating active approval workflows if a document draft is edited mid-approval[cite: 1].
* **Rationale:** If an author modifies document payload text while approver 1 has signed off but approver 2 has not, approver 1's sign-off becomes invalid for the new text[cite: 1]. Resetting the workflow to `Draft` and clearing prior approvals guarantees integrity[cite: 1].
* **Source Reference:** Product Decision & Validation Log (`DEC-04`, Validation Report Sections 4 & 5)[cite: 1]; Product Specification v3.0 §9.2 (`BR-APP-02`)[cite: 2].
* **Slice 1 Implementation Implications:**
  * Treated as a critical atomic invariant inside `updateDocumentVersionAction` and PDF `/upload` using PostgreSQL `SELECT ... FOR UPDATE` row locks (`docs/BUSINESS_LOGIC.md` §3.2).
  * Marks active `approval_cycles` and collected `approval_steps` as `INVALIDATED` (preserving history; never hard-deleted), increments draft revision (`v0.1 → v0.2`), transitions version to `DRAFT`, and appends `APPROVAL_INVALIDATED_BY_EDIT`[cite: 2].
  * UI displays a blocking `InvalidationWarningModal` requiring `confirmInvalidateApprovals: true`.

---

### DEC-05: Implementation Slicing for Document Comparison (Diffing)
* **Classification:** **`PARTIALLY VALIDATED`**[cite: 1].
* **Item:** Deferring visual cross-format `.docx` vs `.pdf` comparison to Slice 2[cite: 1].
* **Rationale:** While diffing is highly valued by quality managers, building a robust visual diffing engine across arbitrary document formats introduces significant technical complexity[cite: 1]. Textual Markdown diffing meets Slice 1 MVP requirements without delaying launch[cite: 1].
* **Source Reference:** Product Decision & Validation Log (`DEC-05`, VALIDATION_REPORT.md §4 (Decision Coverage Audit))[cite: 1]; Product Specification v3.0 §7.1 (`REQ-FR-104`) & §14[cite: 2].
* **Slice 1 Implementation Implications:**
  * Slice 1 implements textual Markdown line/word diffing (`GET /api/documents/[documentId]/diff` + `MarkdownDiffViewer`).
  * Diff requests for binary PDF versions return `422 UNSUPPORTED_DIFF_FORMAT` in Slice 1.
  * Visual side-by-side `.docx` and cross-format diffing is deferred to Slice 2[cite: 1, 2].

---

### DEC-06: Cryptographic Payload Binding via SHA-256
* **Classification:** **`PRODUCT DECISION`**[cite: 1].
* **Item:** Generating SHA-256 digests for document payloads and binding sign-off records to the hash digest[cite: 1].
* **Rationale:** SHA-256 hashing provides non-repudiation and cryptographic proof of document integrity at the exact moment of approval and acknowledgment, giving technical auditors clear evidence of document control[cite: 1].
* **Source Reference:** Product Decision & Validation Log (`DEC-06`, VALIDATION_REPORT.md §4 (Decision Coverage Audit))[cite: 1]; Product Specification v3.0 §10.2, §11.1, §12.2, §17[cite: 2].
* **Slice 1 Implementation Implications:**
  * Computed server-side via Node.js `crypto.createHash('sha256')` over `(Text Content || Binary Attachments || Canonical Metadata)`[cite: 2] within the `< 1.5s` performance budget for files up to 20MB (`REQ-NFR-001`)[cite: 2].
  * Stored immutably on `document_versions.document_sha256`, `approval_cycles.submitted_sha256`, `approval_steps.signed_document_sha256`, and `read_acknowledgments.document_sha256`.
  * Verified before every sign-off; mismatches abort with `422 INTEGRITY_HASH_MISMATCH`.

---

### DEC-07: Progressive Web App (PWA) vs. Native Mobile App for Frontline Readers
* **Classification:** **`UNRESOLVED`**[cite: 1].
* **Item:** Requiring dedicated iOS/Android native applications for frontline SOP acknowledgments[cite: 1].
* **Rationale:** Validation indicates frontline workers need mobile access, but it is unclear whether a responsive, mobile-first PWA is sufficient or if offline-native applications are necessary for shop-floor environments lacking connectivity[cite: 1].
* **Direction Recorded:** Build a responsive PWA in Slice 1; evaluate offline native apps based on operational feedback in Slice 3[cite: 1, 2].
* **Source Reference:** Product Decision & Validation Log (`DEC-07`, Product Specification v3.0 §21 (open questions; see VALIDATION_REPORT.md §9))[cite: 1]; Product Specification v3.0 §4.2 & §21[cite: 2].
* **Slice 1 Implementation Implications:**
  * Slice 1 ships an installable, mobile-first responsive PWA (`public/manifest.json`, `44px` touch targets, zero-clutter reader view) assuming live connectivity.
  * Sensitive SOP PDFs and signed URLs are NOT cached offline in Slice 1 to preserve immediate access revocation (`docs/SECURITY.md` §5.2).
  * Native iOS/Android apps and offline synchronization remain `UNRESOLVED` and out of Slice 1 scope[cite: 1, 2].

---

### DEC-08: Audit Trail Immutability Architecture
* **Classification:** **`PARTIALLY VALIDATED`**[cite: 1].
* **Item:** Technical implementation of audit log immutability claims[cite: 1].
* **Rationale:** Marketing audit logs as "100% unalterable" without technical qualification reduces credibility with security auditors[cite: 1]. Immutability is implemented via database append-only models and application hash-chaining, subject to platform security boundaries[cite: 1, 2].
* **Source Reference:** Product Decision & Validation Log (`DEC-08`, VALIDATION_REPORT.md §4 (Decision Coverage Audit))[cite: 1]; Product Specification v3.0 §11.2[cite: 2].
* **Slice 1 Implementation Implications:**
  * Enforced via `REVOKE UPDATE, DELETE ON audit_logs FROM app_user`, a PostgreSQL `BEFORE UPDATE OR DELETE` immutability trigger, and per-tenant serialized `SHA-256` hash chaining (`sequence_number`, `prev_hash`, `entry_hash`). Canonical audit hash formula (single source of truth, all files): `entry_hash = SHA-256(AUDIT_HASH_SALT || prev_hash || tenant_id || sequence_number || event_type || entity_id || canonical_payload_json)`, where `AUDIT_HASH_SALT` is the optional deployment domain separator from README §7 (empty string if unset) and `canonical_payload_json` is the deterministic key-sorted JSON payload. `created_at` is stored separately and is NOT an input to the hash, so the chain can be recomputed and verified independently. The genesis entry (sequence_number = 1) uses a 64-char zero `prev_hash`.
  * Audit Packet exports (`UC-04`) verify chain continuity and transparently state that cloud/DBA superuser access remains governed by infrastructure IAM controls[cite: 1, 2].
  * **Prohibited:** Never market or label the audit log as universally or 100% tamper-proof[cite: 1].

---

## 3. Cross-Document Tensions & Apparent Contradictions

Consistent with Source Authority rules, apparent tensions between Product Specification v3.0 and the Decision Log are explicitly documented rather than silently resolved:

| Tension ID | Source A (Spec v3.0) | Source B / Internal Spec Contrast | Classification | Current Slice 1 Handling (`PROPOSED` Default) |
| :--- | :--- | :--- | :---: | :--- |
| **T-01** | §7.1 `REQ-FR-101` originally listed `.docx` and `.pdf` uploads up to 50MB; `REQ-FR-103` mandates PDF/A preview rendering[cite: 2]. | §14 (Slice 1) and §20 (Phase 1) scope Slice 1 to **PDF uploads** and defer `.docx` comparison to Slice 2 (`DEC-05`)[cite: 1, 2]. | `RESOLVED — CONFIRMED (PDF-only Slice 1)` | **Decided in this revision: Slice 1 is PDF-only** (`application/pdf`, `%PDF-` magic bytes) per §14[cite: 2]. `.docx` upload + headless PDF/A conversion is deferred to Slice 2 with visual diffing (DEC-05). No product sign-off is outstanding on this point. |
| **T-02** | §9.1 `BR-APP-01` allows an explicit workspace-level *"Single-Author Small-Org Override"* flag to bypass self-approval prevention[cite: 2]. | `DEC-03` (`VALIDATED`) strictly validates self-approval prevention without mentioning an override exception[cite: 1]. | `CONFIRMED` (with governance guard) | Preserved both: `tenants.allow_single_author_override` defaults to `false`, can only be toggled by `WORKSPACE_ADMIN`, and every overridden sign-off is flagged (`self_approval_override_used = true`) and audited (`SELF_APPROVAL_OVERRIDE_USED`). |

---

## 4. Open & Unresolved Product Questions (`UNRESOLVED` / `PARTIALLY VALIDATED`)

| Question ID | Topic | Classification | Source | Handling & Target Gate |
| :--- | :--- | :---: | :--- | :--- |
| **OQ-01** | **Native Offline Mobile App Necessity:** Is a responsive PWA sufficient, or do disconnected shop-floor environments require native iOS/Android offline apps?[cite: 1, 2] | `UNRESOLVED` | `DEC-07`, Spec §21[cite: 1, 2] | Build responsive PWA in Slice 1; evaluate native offline apps in Slice 3 using operational feedback[cite: 1, 2]. |
| **OQ-02** | **Granular Minor Versioning Policy (`BR-VER-03`):** Should minor administrative edits (e.g., typo fixes `v1.1`) bypass full re-approval if toggled by a `Quality Manager` with logged audit justification?[cite: 2] | `PARTIALLY VALIDATED` — **Decided for Slice 1: NO bypass** | Spec §10.1, §21[cite: 2] | **Decided in this revision: bypass is DISABLED in Slice 1.** Minor revisions require full sequential approval. `publishMinorAdminEditAction` is NOT built in Slice 1. The DB flag/justification columns are audit metadata only (always `false` unless a future decision enables the bypass post-Slice-1). |
| **OQ-03** | **Third-Party PKI Hardware Token Integration:** Does the mid-market target demand hardware digital certificate tokens for internal sign-offs?[cite: 2] | `UNRESOLVED` | Spec §21[cite: 2] | Deferred to Slice 3 research[cite: 2]; Slice 1 uses Better Auth password re-authentication (`PROPOSED`). |
| **OQ-04** | **Slice 1 `.docx` Upload Inclusion (`T-01`):** Should `.docx` uploads be excluded from Slice 1 (matching §14) or included (matching `REQ-FR-101`)?[cite: 2] | `RESOLVED` | Spec §7.1 vs. §14[cite: 2] | **Resolved: excluded from Slice 1.** PDF-only in Slice 1; `.docx` in Slice 2. No further confirmation required. |

---

## 5. Proposed Technical Architecture Decisions (`PROPOSED` — Distinct from Product Decisions)

These technical choices were proposed during engineering documentation to satisfy the confirmed product requirements and technology stack direction. They are **not** historical product decisions and may be adjusted by engineering leadership prior to Phase 0/1 coding.

| ADR ID | Technical Choice (`PROPOSED`) | Rationale | Alternatives Considered | Trade-Offs & Integration Constraints |
| :--- | :--- | :--- | :--- | :--- |
| **ADR-01** | **Modular Monolith on Next.js App Router + TypeScript + Vercel** | Enables single-database ACID transactions across lifecycle transitions, invalidations (`DEC-04`), and audit appends (`DEC-08`) with fast MVP velocity[cite: 1, 2]. | Microservices, separate NestJS/Express API | Requires strict `server-only` and ESLint import boundaries to prevent presentation-to-DB coupling. |
| **ADR-02** | **Better Auth ↔ PostgreSQL Forced RLS via `withTenantContext()` (`SET LOCAL`) & `app_user` (`NOBYPASSRLS`)** | Bridges Better Auth sessions to Supabase PostgreSQL RLS safely across Supavisor/PgBouncer connection pools without relying on Supabase Auth's `auth.uid()`. | Supabase Auth, application-only `WHERE tenant_id` filtering | Every tenant query MUST execute inside `withTenantContext()`; fail-closed `NULLIF` ensures omitted wrappers return 0 rows. |
| **ADR-03** | **Drizzle ORM + Composite `(tenant_id, id)` Foreign Keys & PL/pgSQL Immutability Triggers** | Provides type-safe SQL-first queries with explicit transaction control while guaranteeing cross-tenant FK immunity and database-level enforcement of `DEC-03`, `BR-VER-01`, `BR-VER-02`, and `DEC-08`[cite: 1, 2]. | Prisma ORM, application-only invariants | Custom SQL migrations are required alongside Drizzle schema migrations for RLS policies, `REVOKE`, and triggers. |
| **ADR-04** | **Server Actions (`ActionResult<T>`) for Mutations + Route Handlers for Auth, Uploads, Signed URLs, Exports & TanStack Reads** | Keeps workspace mutations type-safe and ergonomic while supporting binary streaming (`<= 50MB` PDFs)[cite: 2], Better Auth handlers, and paginated TanStack Query reads cleanly. | Pure REST API, tRPC | Requires maintaining a consistent `DomainError` mapping layer across both entry surfaces. |
| **ADR-05** | **Slice 1 Sign-Off Re-Authentication via Better Auth Password Re-Entry (`REQ-FR-401`)** | Satisfies sign-off re-authentication[cite: 2] without pulling Slice 3 SAML 2.0 SSO or WebAuthn MFA dependencies into Slice 1[cite: 2]. | Email OTP re-auth, WebAuthn in Slice 1 | Password must be verified via constant-time hash comparison and strictly scrubbed from all logs. |
| **ADR-06** | **Per-Tenant Serialized Audit Hash Chaining via `pg_advisory_xact_lock`** | Prevents concurrent transactions within the same tenant from forking `prev_hash` or colliding on `sequence_number` (`DEC-08`)[cite: 1, 2]. | Async queue-based audit writer (eventual consistency) | Slightly serializes concurrent writes within the same tenant; acceptable for mid-market SOP write throughput and guarantees gapless ACID audit logs. |
| **ADR-07** | **Private Supabase Storage Bucket + Short-Lived Signed URLs (`120s` TTL) + Streaming Node.js `SHA-256`** | Meets AES-256 rest encryption and `< 1.5s` hashing budget for 20MB files (`REQ-NFR-001`)[cite: 2] while preventing unauthorized direct file access. | Public signed-hash URLs, AWS S3 directly | Signed URLs must never be cached by the PWA Service Worker so access revocation remains immediate. |
| **ADR-08** | **Reader Engagement Gate Default (`>= 90%` Scroll / All PDF Pages & `>= 10s` Dwell)** | Operationalizes Spec §12.2's viewing verification[cite: 2] without blocking short 1-page SOPs. | Time-only timer, no gate | Client-tracked metrics are validated server-side (`422 ENGAGEMENT_THRESHOLD_NOT_MET`) as a reasonable operational control, not a cryptographic proof of human comprehension. |
