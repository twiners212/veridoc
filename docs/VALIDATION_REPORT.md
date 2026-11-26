# VeriDoc — Engineering Documentation Validation & Readiness Report
> **App name:** VeriDoc — Document & SOP Approval Workspace.

> **Project:** VeriDoc[cite: 2]  
> **Target Implementation Scope:** Slice 1 — Core Lifecycle MVP[cite: 2]  
> **Overall Readiness Verdict:** **`READY WITH OPEN QUESTIONS`**  
> **Sources Audited:**  
> * Source A: `document_sop_approval_workspace_1.md` (PRD & Strategy v2.0, refined into Product Specification v3.0 as embodied in this 16-file baseline)[cite: 2]  
> * Source B: Product Decision & Validation Log v3.0 (`DEC-01`–`DEC-08`), as embodied in `docs/DECISIONS.md` in this baseline[cite: 1]. The v3.0 spec/log are the governing documents for this baseline; they are not separate files in the flat delivery package — the 16 files below are their engineering embodiment, and `docs/` paths in the text map to the flat files as noted in README.md §1.  
> **Documentation Package Audited:** All 16 Markdown deliverables (`README.md` through `VALIDATION_REPORT.md`).

---

## 1. Executive Readiness Assessment

### Verdict: **`READY WITH OPEN QUESTIONS`**

The 16-file engineering documentation package is **architecturally complete, internally consistent, and ready for Google Antigravity implementation** starting immediately with **Phase 0 (Bootstrap)**, **Phase 1 (Database Schema, Forced RLS & Better Auth)**, and **Phase 2 (RBAC, Hybrid Quotas & Hash-Chained Audit Core)**.

It is classified as **`READY WITH OPEN QUESTIONS`** rather than unconditionally `READY` solely because:
1. **T-01 (`.docx`) and OQ-02 (`BR-VER-03`) were resolved in this revision** — Slice 1 is PDF-only and the minor-edit bypass is disabled in Slice 1 (see DECISIONS.md §3–§4). They are no longer open questions; they are recorded here so the change is auditable.
2. **Standard technical defaults (`PROPOSED` ADRs `ADR-01`–`ADR-08`)**—such as transactional email vendor selection and reader engagement thresholds—require quick engineering sign-off prior to their respective phases.

None of these open items block Phase 0, Phase 1, or Phase 2 execution. This report was rewritten in the same revision that fixed findings F-01–F-23 from the cross-document audit (23 Nov 2026); its §5 claims were corrected to match the fixed package and must not be read as a validation of the pre-fix package.

---

## 2. Source Analysis Summary

Both mandatory source inputs were analyzed and reconciled under the Source Authority hierarchy:

| Source Document | Role in Documentation Package | Key Inputs Extracted | Authority Rules Applied |
| :--- | :--- | :--- | :--- |
| **Source A: Product Specification v3.0** (via `document_sop_approval_workspace_1.md`, PRD & Strategy v2.0, refined to v3.0)[cite: 2] | Primary authority for current product requirements, workflows, personas, RBAC matrix, NFRs, and MVP slicing[cite: 2]. | `UC-01`–`UC-04`, `REQ-FR-101`–`603` and `REQ-NFR-001`–`006`, `BR-APP-01`–`04`, 6 lifecycle states, 5 RBAC roles, semantic versioning, `SHA-256` formula, digital sign-off metadata, 3 implementation slices, `< 1.5s` performance benchmark, compliance boundaries, and Section 21 open questions[cite: 2]. | Slice 1 boundaries (§14, §20) enforced strictly; Slice 2 & Slice 3 deferred cleanly[cite: 2]. |
| **Source B: Product Decision & Validation Log v3.0** (via `docs/DECISIONS.md`, `DEC-01`–`DEC-08`)[cite: 1] | Authoritative source for decision rationale, validation classifications, and disproven/unresolved governance guardrails[cite: 1]. | `DEC-01` through `DEC-08` with exact classifications (`VALIDATED`, `PARTIALLY VALIDATED`, `DISPROVEN`, `UNRESOLVED`, `PRODUCT DECISION`)[cite: 1]. | Zero `DISPROVEN` assumptions (`DEC-01` per-user reader pricing, `DEC-02` Part 11 claims) revived; zero `UNRESOLVED` items (`DEC-07` native offline apps) converted into confirmed requirements[cite: 1]. |

---

## 3. Requirements Coverage Audit

| Requirement Group | Source Reference | Mapped Documentation Artifacts | Slice 1 Status |
| :--- | :--- | :--- | :---: |
| **Authoring, PDF Uploads & Textual Diff** (`REQ-FR-101`–`104a`) | Spec §7.1, §14, `DEC-05`[cite: 1, 2] | `PRODUCT_REQUIREMENTS.md`, `API_SPECIFICATION.md`, `SECURITY.md`, `DESIGN_SYSTEM.md`, `IMPLEMENTATION_PLAN.md` | Covered (`.docx` deferred to Slice 2; T-01 RESOLVED in this revision) |
| **Sequential Approvals, Separation of Duties & Admin Override** (`REQ-FR-201a`, `205`, `207`, `BR-APP-01`, `BR-APP-04`) | Spec §7.2, §9.1, §9.3, §14, `DEC-03`[cite: 1, 2] | `BUSINESS_LOGIC.md`, `USER_FLOWS.md`, `DATABASE_SCHEMA.md`, `API_SPECIFICATION.md`, `SECURITY.md`, `TESTING_STRATEGY.md` | Fully Covered |
| **Atomic Approval Invalidation on Edit** (`REQ-FR-206`, `BR-APP-02`) | Spec §9.2, `DEC-04`[cite: 1, 2] | `BUSINESS_LOGIC.md`, `USER_FLOWS.md`, `ARCHITECTURE.md`, `API_SPECIFICATION.md`, `SECURITY.md`, `TESTING_STRATEGY.md` | Fully Covered |
| **Lifecycle, Semantic Versioning & `SHA-256` Integrity** (`REQ-FR-301`–`305`) | Spec §8, §10, §17, `DEC-06`[cite: 1, 2] | `BUSINESS_LOGIC.md`, `DATABASE_SCHEMA.md`, `SECURITY.md`, `TESTING_STRATEGY.md` | Fully Covered (`BR-VER-03` tagged `PARTIALLY VALIDATED`) |
| **Digital Sign-Offs, Hash-Chained Audit Trail & Audit Packet** (`REQ-FR-401`–`404`, `UC-04`) | Spec §6, §11, `DEC-08`[cite: 1, 2] | `BUSINESS_LOGIC.md`, `DATABASE_SCHEMA.md`, `API_SPECIFICATION.md`, `SECURITY.md`, `TESTING_STRATEGY.md` | Fully Covered |
| **Read Acknowledgments, Target Groups, PWA & Dashboards** (`REQ-FR-501`–`504`, `UC-02`) | Spec §6, §12, §14, `DEC-07`[cite: 1, 2] | `USER_FLOWS.md`, `DATABASE_SCHEMA.md`, `API_SPECIFICATION.md`, `DESIGN_SYSTEM.md`, `IMPLEMENTATION_PLAN.md` | Fully Covered |
| **Multi-Tenancy, 5-Role RBAC & Hybrid Quotas** (`REQ-FR-601`–`603`) | Spec §13, §16, §17, `DEC-01`[cite: 1, 2] | `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_SPECIFICATION.md`, `SECURITY.md`, `TESTING_STRATEGY.md` | Fully Covered |
| **Performance, Security & Compliance NFRs** (`REQ-NFR-001`–`006`) | Spec §11.2, §17, §18, `DEC-02`, `DEC-08`[cite: 1, 2] | `PRODUCT_REQUIREMENTS.md`, `ARCHITECTURE.md`, `SECURITY.md`, `TESTING_STRATEGY.md`, `AGENTS.md` | Fully Covered |
| **Deferred Capabilities** (Parallel/Quorum, Delegation, 48h/96h Escalation, `.docx` Visual Diff, SSO/SCIM, Webhooks, Part 11, Native Apps) | Spec §7.1–7.2, §14, §20, `DEC-02`, `DEC-05`, `DEC-07`[cite: 1, 2] | Explicitly excluded from Slice 1 across `README.md`, `PRODUCT_REQUIREMENTS.md`, `IMPLEMENTATION_PLAN.md`, `AGENTS.md`, `DECISIONS.md` | Properly Deferred |

---

## 4. Decision Coverage Audit (`DEC-01` through `DEC-08`)

| ID | Original Classification Preserved[cite: 1] | Verified Enforcement Across Docs | Status |
| :--- | :--- | :--- | :---: |
| **`DEC-01`** | `DISPROVEN` (per-seat) $\rightarrow$ `PRODUCT DECISION` (Hybrid)[cite: 1] | `tenants.creator_seat_limit` vs. `reader_pack_limit` (`DATABASE_SCHEMA.md`), `402 SEAT_QUOTA_EXCEEDED` (`API_SPECIFICATION.md`), prohibited in `AGENTS.md`. | Pass |
| **`DEC-02`** | `DISPROVEN` (out-of-the-box FDA Part 11)[cite: 1] | Explicit non-claims in `README.md`, `PRODUCT_REQUIREMENTS.md`, `SECURITY.md`, `DESIGN_SYSTEM.md`, `AGENTS.md`; automated `compliance-copy-guard.spec.ts` (`TESTING_STRATEGY.md`). | Pass |
| **`DEC-03`** | `VALIDATED` (Self-approval prevention)[cite: 1] | `BR-APP-01` enforced in `src/server/policies/` (`403 SELF_APPROVAL_PROHIBITED`), PostgreSQL `BEFORE UPDATE` trigger (`DATABASE_SCHEMA.md`), and DB/workflow tests (`TESTING_STRATEGY.md`). | Pass |
| **`DEC-04`** | `VALIDATED` (Approval invalidation on edit)[cite: 1] | `BR-APP-02` atomic `FOR UPDATE` transaction (`BUSINESS_LOGIC.md`, `ARCHITECTURE.md`, `API_SPECIFICATION.md`), `InvalidationWarningModal` (`DESIGN_SYSTEM.md`), and concurrency race test (`TESTING_STRATEGY.md`). | Pass |
| **`DEC-05`** | `PARTIALLY VALIDATED` (Markdown diff Slice 1; `.docx` Slice 2)[cite: 1] | Textual Markdown diff (`GET /api/documents/[documentId]/diff`, `MarkdownDiffViewer`); `422 UNSUPPORTED_DIFF_FORMAT` for PDFs; visual `.docx` diff deferred to Slice 2. | Pass |
| **`DEC-06`** | `PRODUCT DECISION` (`SHA-256` payload binding)[cite: 1] | Canonical digest formula (`BUSINESS_LOGIC.md`), DB `CHECK` constraints (`DATABASE_SCHEMA.md`), verification on sign-off (`422 INTEGRITY_HASH_MISMATCH`), bound to approvals & acknowledgments. | Pass |
| **`DEC-07`** | `UNRESOLVED` (PWA Slice 1; Native offline deferred)[cite: 1] | Responsive mobile-first PWA (`DESIGN_SYSTEM.md`), no offline sensitive binary caching (`SECURITY.md`), native apps explicitly excluded from Slice 1 (`AGENTS.md`, `DECISIONS.md`). | Pass |
| **`DEC-08`** | `PARTIALLY VALIDATED` (Append-only + hash chain + infra boundaries)[cite: 1] | `REVOKE UPDATE, DELETE`, immutability trigger, `pg_advisory_xact_lock` hash chaining (`DATABASE_SCHEMA.md`, `ARCHITECTURE.md`), and transparent cloud/DBA boundary disclosure (`SECURITY.md`, `AGENTS.md`). | Pass |

---

## 5. Cross-Document Consistency Verification

All 16 files were audited against 8 consistency dimensions:

| Dimension | Verification Check | Result |
| :--- | :--- | :---: |
| **1. Terminology & Roles** | Exact 5 RBAC roles (`WORKSPACE_ADMIN`, `QUALITY_MANAGER`, `DOCUMENT_AUTHOR`, `APPROVER_REVIEWER`, `READER`) and 6 lifecycle states (`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `PUBLISHED`, `SUPERSEDED`, `RETIRED`) match identically across `PRODUCT_REQUIREMENTS.md`, `BUSINESS_LOGIC.md`, `USER_FLOWS.md`, `DATABASE_SCHEMA.md`, `API_SPECIFICATION.md`, `SECURITY.md`, and `DESIGN_SYSTEM.md`. | Consistent |
| **2. Database ↔ Business Logic** | Every invariant has a corresponding PostgreSQL constraint, partial unique index, or trigger in `DATABASE_SCHEMA.md`, except where explicitly noted as server-only: `BR-SEQ-03` (no consecutive duplicate approvers) is enforced in `submitForApprovalAction` only, and `BR-VER-03` in Slice 1 is flag-only (no bypass action). `BR-APP-01` is enforced by a `BEFORE INSERT OR UPDATE` trigger (§5.3). | Consistent (with stated server-only exceptions) |
| **3. Architecture ↔ Database ↔ Security** | Better Auth ↔ Supabase PostgreSQL RLS bridge (`withTenantContext()` + `SET LOCAL` + `app_user` `NOBYPASSRLS` + fail-closed `NULLIF`) is aligned identically across `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `SECURITY.md`, `DEVELOPMENT_GUIDELINES.md`, and `AGENTS.md`. | Consistent |
| **4. API ↔ Error Taxonomy ↔ Testing** | Every `DomainErrorCode` (`400`–`500`) in `API_SPECIFICATION.md` §7 is defined in the API and asserted in `TESTING_STRATEGY.md` where applicable. `USER_FLOWS.md` §7.2 covers the main exception flows (self-approval, race, out-of-order, deactivated approver, hash mismatch, invalid upload, cross-tenant access), not every code — the full code-to-test mapping is in `TESTING_STRATEGY.md` §§3–8. | Consistent (with stated scope) |
| **5. UI/UX ↔ Security & Compliance** | Mobile Reader PWA (`DESIGN_SYSTEM.md`) aligns with no-offline-SOP-caching (`SECURITY.md`), engagement thresholds (`BUSINESS_LOGIC.md`), and prohibited compliance copy rules (`DEC-02`, `DEC-08`). | Consistent |
| **6. Scope ↔ Implementation Plan** | Phases 0–6 in `IMPLEMENTATION_PLAN.md` and checklists in `PROGRESS_TRACKER.md` cover 100% of Slice 1 deliverables with zero Slice 2/3 dependencies. | Consistent |
| **7. Tech Stack Discipline** | All 16 files strictly use the requested stack (`Next.js App Router`, `TypeScript`, `Supabase PostgreSQL`, `Drizzle ORM`, `Better Auth`, `TanStack Query`, `Tailwind CSS`, `shadcn/ui`, `Zod`, `Supabase Storage`, `Vercel`) with zero unapproved dependencies. | Consistent |
| **8. AI Agent Instructions** | `AGENTS.md` enforces the exact layer boundaries, security rules, prohibited shortcuts, and Slice 1 constraints documented across `docs/`. | Consistent |

---

## 6. Contradictions & Source Tensions Identified

No contradictions were silently resolved. Both source tensions are documented in `docs/DECISIONS.md` §3 and `docs/PROGRESS_TRACKER.md` §4. T-01 is RESOLVED in this revision (see below); T-02 remains a confirmed tension with a governance guard:

1. **`T-01` (`RESOLVED — PDF-only Slice 1`) — `.docx` Upload Scope in Slice 1:**
   * *Conflict (as originally specified):* Spec §7.1 (`REQ-FR-101`) originally listed `.docx` and `.pdf` uploads up to 50MB and `REQ-FR-103` requires PDF/A preview rendering[cite: 2], whereas Spec §14 (Slice 1) and §20 (Phase 1) scope Slice 1 to **PDF uploads** and defer `.docx` comparison to Slice 2 (`DEC-05`)[cite: 1, 2].
   * *Documentation Handling:* **Decided: Slice 1 is PDF-only** (`application/pdf`, `%PDF-` magic bytes) per §14[cite: 2], to avoid introducing heavy headless LibreOffice/Chromium conversion infrastructure on Vercel serverless in MVP. `.docx` is deferred to Slice 2. REQ-FR-101 was amended accordingly; no confirmation is outstanding.
2. **`T-02` (`CONFIRMED` with Governance Guard) — Strict `DEC-03` vs. `BR-APP-01` Small-Org Override:**
   * *Contrast:* `DEC-03` (`VALIDATED`) strictly validates self-approval prevention[cite: 1], while Spec §9.1 (`BR-APP-01`) includes an opt-in *"Single-Author Small-Org Override"* workspace flag[cite: 2].
   * *Documentation Handling:* Preserved both by defaulting `tenants.allow_single_author_override = false`, restricting configuration to `WORKSPACE_ADMIN`, and explicitly flagging/auditing (`SELF_APPROVAL_OVERRIDE_USED`) any overridden sign-off.

---

## 7. Missing Information & Technical Defaults Proposed

Where the source documents intentionally omitted implementation-level detail, reasonable defaults were clearly labeled **`PROPOSED`** (`ADR-01`–`ADR-08` in `docs/DECISIONS.md`):

* **Sign-Off Re-Authentication Method in Slice 1 (`ADR-05`):** Spec §11.1 requires re-authentication at sign-off and shows SAML SSO + WebAuthn MFA in its illustration[cite: 2], while deferring SAML SSO to Slice 3[cite: 2]. Proposed Better Auth password re-entry for Slice 1.
* **Canonical `SHA-256` Metadata Format (`docs/BUSINESS_LOGIC.md` §4.2):** Spec §10.2 specifies `SHA-256(Text Content || Binary Attachments || Canonical Metadata)`[cite: 2]. Canonical form used in all files: `SHA-256(normalized_markdown || file_sha256 || canonical_metadata_json)`, with deterministic key-sorted JSON `{ document_code, title, version_label, tenant_id }`, `NFC` UTF-8 and LF `\n` normalisation (BUSINESS_LOGIC.md §4.2). Audit chain: `entry_hash = SHA-256(AUDIT_HASH_SALT || prev_hash || tenant_id || sequence_number || event_type || entity_id || canonical_payload_json)` — `created_at` is NOT a hash input (SECURITY.md §7.1).
* **Reader Engagement Threshold (`ADR-08`):** Spec §12.2 requires tracking minimum scroll depth / viewing time[cite: 2] without specifying exact numbers. Proposed `>= 90%` scroll (or all PDF pages) AND `>= 10 seconds` dwell time.
* **Audit Packet Export Format (`docs/API_SPECIFICATION.md` §6.2):** Spec §6 (`UC-04`) requires exporting an Audit Packet[cite: 2] without specifying file formats. Proposed structured `JSON` + printable `PDF` summary.
* **Transactional Email Provider (`docs/ARCHITECTURE.md` §8.2):** Spec §12.2 requires email/in-app notifications[cite: 2]. Proposed abstracting behind `INotificationProvider` (e.g., Resend or Postmark).
* **Signed Storage URL TTL & Rate Limits (`docs/SECURITY.md` §5.2, §8.2):** Proposed `120s` signed URL expiry and explicit per-endpoint rate limits.

---

## 8. Key Technical Risks & Mitigations

| Risk | Severity | Root Cause | Documented Mitigation |
| :--- | :---: | :--- | :--- |
| **RLS Context Leakage Across Pooled Connections** | Critical | Better Auth runs outside Supabase Auth; using session-scoped `SET` over Supavisor/PgBouncer would leak `tenant_id` across concurrent requests. | Mandatory `withTenantContext()` wrapper executing transaction-scoped `SET LOCAL` (`set_config(..., true)`), `app_user` (`NOBYPASSRLS`), forced RLS, and `M1` pooler-isolation tests (`ARCHITECTURE.md`, `TESTING_STRATEGY.md`). |
| **Concurrent Edit vs. Sign-Off Race (`DEC-04`)** | Critical | Approver signing off at the same moment an Author edits could approve unvetted content[cite: 1, 2]. | PostgreSQL `SELECT ... FOR UPDATE` row locks on `document_versions` + `approval_cycles`, `expectedRowVersion` check, and automated `Promise.allSettled` race test (`BUSINESS_LOGIC.md`, `TESTING_STRATEGY.md`). |
| **Audit Chain Forking Under Concurrency (`DEC-08`)** | High | Two simultaneous mutations in the same tenant reading the same `prev_hash` would break the hash chain. | Tenant-scoped `pg_advisory_xact_lock(hashtext(tenant_id::text))` + `UNIQUE (tenant_id, sequence_number)` (`DATABASE_SCHEMA.md`, `ARCHITECTURE.md`). |
| **Serverless Memory/Latency on 20MB–50MB PDFs** | Medium | Buffering large PDFs in memory on Vercel serverless could breach the `< 1.5s` (20MB) target (`REQ-NFR-001`)[cite: 2]. | Streaming Node.js `crypto.createHash('sha256')` during upload validation and `M3` automated 20MB benchmark test (`ARCHITECTURE.md`, `TESTING_STRATEGY.md`). |
| **Compliance Claim Drift in UI/Exports (`DEC-02`, `DEC-08`)** | High | AI agents or developers inadvertently adding "FDA Part 11 Compliant" or "100% Tamper-Proof" badges[cite: 1, 2]. | Explicit prohibitions in `AGENTS.md` and `DESIGN_SYSTEM.md`, backed by automated `e2e/compliance-copy-guard.spec.ts` (`TESTING_STRATEGY.md`). |

---

## 9. Outstanding Decisions & Recommendations Before Coding

### Immediate Actions (Do NOT Block Phase 0–2)
1. **Begin Phase 0, Phase 1, and Phase 2 Immediately:** The foundation (Next.js + Drizzle + Supabase PostgreSQL + forced RLS + Better Auth + 5-role RBAC + Hybrid Seat Quotas + Hash-Chained Audit Core) has zero unresolved blockers.
2. **Provision Dedicated Supabase `app_user` Role Early:** Configure `DATABASE_URL` (`app_user`, `NOBYPASSRLS`) separately from `DIRECT_DATABASE_URL` (migration role) during Phase 0 setup so RLS is verified realistically from the very first integration test.

### Required Product Confirmations (Targeted Gates)
| Priority | Decision Needed | Deadline Gate | Recommended Default |
| :---: | :--- | :--- | :--- |
| **1** | **`T-01` (`.docx` uploads in Slice 1) — RESOLVED in this revision:** Slice 1 is PDF-only (per Spec §14); `.docx` upload + visual diffing together in Slice 2 (`DEC-05`)[cite: 1, 2]. | Resolved | **PDF-only** — no further action. |
| **2** | **`OQ-02` (`BR-VER-03` Minor Administrative Edit Bypass) — RESOLVED in this revision:** Bypass is DISABLED in Slice 1; minor revisions require full sequential approval[cite: 2]. | Resolved | **No bypass in Slice 1.** A future bypass is a post-Slice-1 decision only. |
| **3** | **Confirm `PROPOSED` Technical Defaults (`ADR-05`, `ADR-08`, Email Vendor):** Sign off on Better Auth password re-auth for Slice 1, `>= 90%` scroll & `>= 10s` dwell engagement threshold, and transactional email vendor (e.g., Resend / Postmark). | Before **Phase 4 (`M4`)** | Approve defaults as documented in `docs/DECISIONS.md` §5. |

### Post-Slice 1 Research Items (Remain `UNRESOLVED` — Out of Scope)
* **Native Offline Mobile App (`DEC-07` / `OQ-01`):** Evaluate after Slice 1 responsive PWA launch based on real shop-floor connectivity feedback[cite: 1, 2].
* **Third-Party PKI Hardware Tokens (`OQ-03`):** Evaluate during Slice 3 Enterprise & Compliance planning[cite: 2].
