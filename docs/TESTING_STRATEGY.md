# VeriDoc — Testing & Quality Assurance Strategy
> **App name:** VeriDoc — Document & SOP Approval Workspace.

> **Status:** Slice 1 (Core Lifecycle MVP) — QA Baseline  
> **Primary Source:** Product Specification v3.0 (`CONFIRMED`)[cite: 2]  
> **Decision Authority:** Product Decision & Validation Log v3.0 (`CONFIRMED`)[cite: 1]  
> **Related Docs:** `docs/PRODUCT_REQUIREMENTS.md`, `docs/BUSINESS_LOGIC.md`, `docs/DATABASE_SCHEMA.md`, `docs/SECURITY.md`, `docs/IMPLEMENTATION_PLAN.md`

---

## 1. Testing Philosophy & Tooling (`PROPOSED`)

Because the **VeriDoc** enforces compliance-oriented governance invariants (multi-tenant isolation, separation of duties, atomic approval invalidation, cryptographic integrity, and append-only audit trails)[cite: 2], testing prioritizes **behavioral and database-level proof** over superficial line-coverage metrics.

### 1.1 Testing Stack (`PROPOSED`)
| Layer | Tooling | Execution Environment | Folder |
| :--- | :--- | :--- | :--- |
| **Unit Tests** | **Vitest** | Node.js (in-memory, fast) | `tests/unit/` |
| **Integration & DB Tests** | **Vitest** + Drizzle ORM | Real PostgreSQL (local Supabase / Docker) using `app_user` (`NOBYPASSRLS`) | `tests/integration/` |
| **End-to-End (E2E) Tests** | **Playwright** | Next.js production/dev build + PostgreSQL + local Storage | `tests/e2e/` |
| **Static Verification** | `tsc --noEmit` + ESLint | CI & Pre-commit | Root scripts |

### 1.2 Core Testing Rules (`PROPOSED`)
1. **Never Mock PostgreSQL for Security or Concurrency:** RLS isolation, `FOR UPDATE` row locking, partial unique indexes, `REVOKE` privileges, and PL/pgSQL triggers MUST execute against a real migrated PostgreSQL instance.
2. **Test Through Authoritative Boundaries:** Security and RBAC tests MUST invoke Server Actions and Route Handlers directly (bypassing UI button states) to prove client-side controls are never relied upon as security boundaries (`docs/SECURITY.md`).
3. **Deterministic Multi-Tenant Fixtures:** Every integration and E2E suite seeds two isolated workspaces (`Tenant A` and `Tenant B`), each containing users for all five RBAC roles (`Workspace Admin`, `Quality Manager`, `Document Author`, `Approver / Reviewer`, `Reader`)[cite: 2].

---

## 2. Unit Testing (`tests/unit/` — `PROPOSED`)

Targets pure, deterministic domain logic with zero database or network I/O:

* **Cryptographic Hashing (`DEC-06`):**
  * Verifies `SHA-256` canonical digest determinism (`NFC` UTF-8 normalization, LF `\n` line endings, sorted JSON metadata keys)[cite: 2].
  * Proves a single-bit change in text, binary hash, or controlled metadata produces a different digest[cite: 2].
* **Audit Hash Chaining (`DEC-08`):**
  * Verifies `entry_hash` computation from `(AUDIT_HASH_SALT || prev_hash || tenant_id || sequence_number || event_type || entity_id || canonical_payload_json)` (created_at is NOT a hash input)`[cite: 2].
  * Proves the chain verifier returns `verified: false` when any entry payload is mutated, reordered, or deleted (gap in `sequence_number`).
* **Semantic Versioning Calculator (`REQ-FR-302`):**
  * Verifies `v0.1 → v0.2` (draft increment/invalidation), `v0.x → v1.0` (first major publish), `v1.0 → v2.0` (major revision), and `v1.0 → v1.1` (minor revision)[cite: 2].
* **Textual Markdown Diff Engine (`DEC-05`):**
  * Verifies accurate line/word insertions, deletions, and unchanged hunks for Markdown strings[cite: 1, 2].
* **Zod Validation Schemas (`docs/API_SPECIFICATION.md`):**
  * Verifies boundary enforcement for document codes, approval chain sizes (`1..10`), mandatory sign-off intent (`5..1000` chars), engagement gate thresholds (`>= 90%` scroll, `>= 10s` dwell), and PDF size limits (`0 < size <= 50MB`)[cite: 2].
* **File Magic-Byte & Markdown Sanitizer Helpers:**
  * Verifies `%PDF-` header detection and neutralization of `<script>`, `<iframe>`, `on*`, and `javascript:` payloads in Markdown.

---

## 3. Integration Testing (`tests/integration/` — `PROPOSED`)

Tests the full server stack (`Entry → Zod → Policy → Service → withTenantContext() → PostgreSQL`) without browser overhead:

* **Document Authoring & PDF Upload Pipeline:**
  * Creating Markdown SOPs, cloning `PUBLISHED` versions into revisions, uploading valid PDFs (`<= 50MB`)[cite: 2], generating short-lived signed URLs (`120s` TTL), and rejecting non-Markdown diff requests with `422 UNSUPPORTED_DIFF_FORMAT` (`DEC-05`)[cite: 1, 2].
* **Performance Benchmark (`REQ-NFR-001`):**
  * Streams a 20MB test PDF through upload validation and `SHA-256` computation; asserts completion in `< 1.5 seconds`[cite: 2].
* **Hybrid Seat Quota Enforcement (`DEC-01`):**
  * Inviting Creator roles (`Workspace Admin`, `Quality Manager`, `Document Author`, `Approver / Reviewer`) counts only against `creator_seat_limit`; inviting `Reader` accounts counts only against `reader_pack_limit`; exceeding either returns `402 SEAT_QUOTA_EXCEEDED`[cite: 1, 2].
* **Audit Packet Export (`UC-04`):**
  * Exports JSON and PDF Audit Packets and verifies inclusion of version lineage, `SHA-256` digests, sign-off metadata, invalidation history, read acknowledgments, and `chainVerified: true`[cite: 2].

---

## 4. Database Testing (`tests/integration/db/` — `PROPOSED`)

Directly verifies PostgreSQL schema invariants, RLS policies, privileges, and triggers defined in `docs/DATABASE_SCHEMA.md`:

| Test Case | Target Mechanism | Expected Result |
| :--- | :--- | :--- |
| **Fail-Closed RLS** | Query `document_versions` as `app_user` without `SET LOCAL app.current_tenant_id`. | Returns `0` rows; `INSERT` fails with RLS policy violation. |
| **Pooler Isolation** | Reuse same connection across sequential `withTenantContext(TenantA)` and `withTenantContext(TenantB)` transactions. | Zero tenant context leakage between transactions (`SET LOCAL` resets on commit). |
| **Cross-Tenant FK Immunity** | Attempt to insert a `document_versions` row referencing Tenant A's `tenant_id` and Tenant B's `document_id`. | Fails with composite foreign-key violation. |
| **Single Published Version (`BR-VER-01`)** | Attempt to set two versions of the same document to `PUBLISHED`. | Fails with `uq_one_published_version_per_doc` unique index violation. |
| **Published Immutability Trigger (`BR-VER-02`)** | Attempt SQL `UPDATE` on `markdown_content` or `document_sha256` while `lifecycle_state = 'PUBLISHED'`. | Trigger raises exception and rolls back transaction. |
| **Append-Only Audit Trail (`DEC-08`)** | Attempt SQL `UPDATE` and `DELETE` on `audit_logs` as `app_user`[cite: 1, 2]. | Fails with permission denied (`REVOKE`) and immutability trigger error. |
| **Self-Approval DB Trigger (`DEC-03`)** | Attempt direct SQL `UPDATE` setting `approval_steps.status = 'APPROVED'` where `acted_by_user_id = author_id` and `allow_self_approval_override = false`, and attempt a direct SQL `INSERT` of an already-`APPROVED` step with the author as actor[cite: 1, 2]. | Trigger aborts the transaction in both the INSERT and UPDATE cases. |
| **Concurrent Audit Serialization** | Fire 10 parallel transactions appending audit logs for Tenant A simultaneously. | `pg_advisory_xact_lock` serializes writes into contiguous `sequence_number` `1..10` with valid unbroken `prev_hash -> entry_hash` links. |

---

## 5. Authorization Testing (`tests/integration/authz/` — `PROPOSED`)

Exhaustively tests the 5-role RBAC matrix (`REQ-FR-602`, `docs/SECURITY.md` §3.1)[cite: 2] and tenant isolation (`AC-05`):

* **Role Matrix Sweep:** For every Server Action and Route Handler, execute requests as each of the 5 roles (`WORKSPACE_ADMIN`, `QUALITY_MANAGER`, `DOCUMENT_AUTHOR`, `APPROVER_REVIEWER`, `READER`)[cite: 2] and assert exact `200`/`201` vs. `403 FORBIDDEN` outcomes.
* **Cross-Tenant Access Sweep (`AC-05`):** Execute every document, approval, acknowledgment, dashboard, signed-URL, and audit export endpoint using a valid Tenant A session with Tenant B entity UUIDs; assert `404 NOT_FOUND` (zero existence leakage).
* **Live Membership & Deactivation Check:** Downgrade an active approver to `READER` or set `status = 'DEACTIVATED'` mid-workflow; assert immediate `403 FORBIDDEN` on subsequent sign-off attempts.
* **Visibility Scoping:** Verify `Reader` can fetch signed preview URLs ONLY for `PUBLISHED` versions and receives `403`/`404` for `DRAFT` and `PENDING_APPROVAL` versions[cite: 2].

---

## 6. Workflow State Transition & Concurrency Testing (`tests/integration/workflows/` — `PROPOSED`)

Validates the complete state machine in `docs/BUSINESS_LOGIC.md`:

| Test Scenario | Rule / Decision | Assertion |
| :--- | :--- | :--- |
| **Happy Path Sequential Approval (`AC-01`)** | `BR-SEQ-01`, `BR-SEQ-02` | `DRAFT -> PENDING_APPROVAL -> Step 1 Approved -> Step 2 Approved -> APPROVED -> PUBLISHED`. |
| **Out-of-Order Approval Attempt** | `BR-SEQ-02` | Approver 2 attempting sign-off while Step 1 is `PENDING` fails with `409 APPROVAL_STEP_NOT_ACTIVE`. |
| **Self-Approval Prevention** | `DEC-03`, `BR-APP-01`[cite: 1, 2] | Author attempting to approve own SOP fails with `403 SELF_APPROVAL_PROHIBITED`; succeeds ONLY when `allow_single_author_override = true`, emitting `SELF_APPROVAL_OVERRIDE_USED`. |
| **Mid-Approval Edit Invalidation (`AC-02`)** | `DEC-04`, `BR-APP-02`[cite: 1, 2] | After Approver 1 signs off, editing content/PDF atomically marks cycle & Step 1 `INVALIDATED`, increments revision (`v0.1 -> v0.2`), transitions to `DRAFT`, and logs `APPROVAL_INVALIDATED_BY_EDIT`. |
| **Concurrent Edit vs. Sign-Off Race** | `DEC-04`, `REQ-NFR-004`[cite: 1, 2] | Launch `updateDocumentVersionAction` and `executeApprovalDecisionAction` concurrently via `Promise.allSettled`; assert exactly one succeeds and the other fails with `409 Conflict` (`APPROVAL_CYCLE_INVALIDATED` or `VERSION_LOCKED`), never leaving an approved unvetted edit. |
| **Rejection & Recall Flows** | `docs/BUSINESS_LOGIC.md` §1.2 | Rejection requires reason, closes cycle `REJECTED`, returns to `DRAFT`; recall closes cycle `RECALLED` and invalidates prior steps. |
| **Admin Approver Override** | `BR-APP-04`[cite: 2] | Only `WORKSPACE_ADMIN` can reassign a stalled step; non-admins get `403`; logs `ADMIN_APPROVER_OVERRIDE` with justification and still enforces `BR-APP-01`. |
| **Publish & Supersede** | `BR-VER-01`, `REQ-FR-305`[cite: 2] | Publishing `v2.0` atomically transitions `v1.0` to `SUPERSEDED`, expires `v1.0`'s pending assignments (`EXPIRED_SUPERSEDED`), and creates `v2.0` assignments. |
| **Minor Admin Edit — NO Bypass in Slice 1** | `BR-VER-03` (`PARTIALLY VALIDATED`) | `QUALITY_MANAGER` flagging `v1.1` as minor still requires full sequential approval; there is no `publishMinorAdminEditAction` in Slice 1, and a direct publish attempt without approval fails. |
| **Read Acknowledgment Idempotency** | `BR-ACK-01`, `DEC-06`[cite: 1, 2] | First valid acknowledgment persists `user_id`, UTC timestamp, and exact `document_sha256`; duplicate request is rejected cleanly; premature request (`< 90%` scroll or `< 10s`) fails with `422 ENGAGEMENT_THRESHOLD_NOT_MET`. |

---

## 7. End-to-End (E2E) Testing (`tests/e2e/` — `PROPOSED`)

Implemented with **Playwright** against a live Next.js + PostgreSQL environment covering all core Slice 1 use cases (`UC-01`–`UC-04`)[cite: 2]:

1. **`e2e/uc01-author-and-sequential-approval.spec.ts` (`AC-01`):** Author creates Markdown SOP → configures 2-step sequential chain → submits → Approver 1 re-authenticates & approves → Approver 2 re-authenticates & approves → version reaches `APPROVED` with visible `SHA-256` digest chip[cite: 2].
2. **`e2e/uc03-invalidation-and-diff.spec.ts` (`AC-02`):** Author edits a `PENDING_APPROVAL` SOP after Approver 1 signed → confirms `InvalidationWarningModal` → version resets to `DRAFT` (`v0.2`) → Author inspects `MarkdownDiffViewer` (`DEC-05`)[cite: 1, 2].
3. **`e2e/uc02-publish-and-mobile-reader-pwa.spec.ts` (`AC-03`, `DEC-07`):** Quality Manager publishes SOP to "Shift A Operations" → Playwright mobile viewport (`375×812`) logs in as `Reader` → verifies Acknowledge button is disabled until scroll & dwell threshold are met → clicks *"I Acknowledge That I Have Read & Understand This SOP"* → Quality Manager dashboard updates to `100%`[cite: 1, 2].
4. **`e2e/uc04-audit-packet-export.spec.ts` (`AC-04`):** Quality Manager opens Audit Trail, exports Audit Packet (`JSON`), and verifies unbroken hash chain and complete sign-off/acknowledgment evidence[cite: 2].
5. **`e2e/compliance-copy-guard.spec.ts` (`DEC-02`, `DEC-08`):** Automated smoke check scanning primary UI pages and exported Audit Packets to verify prohibited claims (*"FDA 21 CFR Part 11 Certified"*, *"100% Tamper-Proof"*) never appear[cite: 1, 2].

---

## 8. Security Testing (`tests/integration/security/` — `PROPOSED`)

Automates all 11 pre-release items from `docs/SECURITY.md` §9:
* **Sign-Off Re-Authentication Failure (`REQ-FR-401`):** Wrong password returns `401 REAUTH_FAILED` and triggers rate limiting after 5 failed attempts[cite: 2].
* **SHA-256 Tamper Detection (`DEC-06`):** Simulated DB payload drift (stored payload no longer matching the stored digest) aborts sign-off with `422 INTEGRITY_HASH_MISMATCH`[cite: 1, 2]. The client supplies no digest in Slice 1.
* **Malicious File Upload Rejection:** Uploading `.html`/`.exe` renamed to `.pdf`, 0-byte files, and `> 50MB` payloads returns `400 INVALID_FILE_PAYLOAD`[cite: 2].
* **Markdown XSS Neutralization:** Playwright test renders SOP containing `<script>window.__xss=1</script>` and `[click](javascript:alert(1))` and asserts `window.__xss === undefined`.
* **HTTP Security Headers Verification:** Asserts `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Content-Security-Policy` headers on workspace responses.

---

## 9. Regression Testing & CI Release Gates (`PROPOSED`)

### 9.1 Regression Policy
* Every bug fix in lifecycle transitions, RBAC, RLS, hashing, or audit chaining MUST include a regression test reproducing the defect before the fix is merged.
* All `DEC-01` through `DEC-08` invariants are tagged `@critical-invariant` and run on every pull request[cite: 1].

### 9.2 Mandatory CI Pipeline Gates (GitHub Actions)
| Gate | Command | Trigger | Blocks Merge? |
| :--- | :--- | :--- | :---: |
| **Type & Lint Check** | `pnpm typecheck && pnpm lint` | Every PR | **Yes** |
| **Unit Suite** | `pnpm test:unit` | Every PR | **Yes** |
| **DB, RLS, Workflow & Security Suite** | `pnpm db:migrate && pnpm test:integration` | Every PR | **Yes** |
| **Playwright E2E Suite (Desktop + Mobile PWA)** | `pnpm build && pnpm test:e2e` | PR to `main` & Pre-Release | **Yes** |
