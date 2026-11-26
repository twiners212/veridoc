# VeriDoc — AGENTS.md — Global AI Coding Agent Instructions (Google Antigravity)
> **App name:** VeriDoc — Document & SOP Approval Workspace.

> **Project:** VeriDoc[cite: 2]  
> **Active Target:** Slice 1 — Core Lifecycle MVP[cite: 2]  
> **Authority:** This file governs all AI coding agents operating in this repository. When in doubt, defer to the approved engineering documentation in `docs/` and ask for human confirmation before deviating.

---

## 1. Documentation-First Workflow (`PROPOSED` Mandatory Protocol)

Before writing or modifying **any** application code, you MUST follow this sequence:

1. **Read Before Coding:** Inspect the relevant specification files in `docs/` for the phase you are implementing:
   * Product & Scope: `README.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/DECISIONS.md`
   * Domain & UX: `docs/BUSINESS_LOGIC.md`, `docs/USER_FLOWS.md`, `docs/DESIGN_SYSTEM.md`
   * Architecture & Data: `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `docs/API_SPECIFICATION.md`, `docs/SECURITY.md`
   * Execution & QA: `docs/IMPLEMENTATION_PLAN.md`, `docs/TESTING_STRATEGY.md`, `docs/DEVELOPMENT_GUIDELINES.md`, `docs/PROGRESS_TRACKER.md`
2. **Follow the Phase Order:** Implement phases sequentially (`Phase 0` → `Phase 6`) as defined in `docs/IMPLEMENTATION_PLAN.md`. Do not skip foundation phases (RLS, Better Auth, RBAC, Audit Core) to build UI screens early.
3. **Never Silently Override Specs:** If you discover an ambiguity, contradiction, or `UNRESOLVED` item[cite: 2], **STOP** and ask for human confirmation. Note: `.docx` upload support in Slice 1 is NOT unresolved — it is RESOLVED as deferred to Slice 2 (DECISIONS.md §3 T-01); do not re-open it without human confirmation. Never invent unsupported business requirements or silently convert `UNRESOLVED` items into confirmed behavior.
4. **Update Progress After Milestones:** Keep `docs/PROGRESS_TRACKER.md` synchronized as tasks and milestones (`M0`–`M6`) are completed and verified.

---

## 2. Strict Scope Management — Avoid Scope Expansion (`CONFIRMED`)

Your implementation target is **strictly Slice 1: Core Lifecycle MVP**[cite: 2].

### Build ONLY Slice 1 (`CONFIRMED` Active Scope)
* Structured Markdown/Rich-Text web editor and PDF uploads (`<= 50MB`, `%PDF-` magic-byte verified)[cite: 2].
* Textual Markdown diffing (`DEC-05`)[cite: 1, 2].
* Sequential multi-stage approval workflows[cite: 2].
* Separation of duties / self-approval prevention (`DEC-03`, `BR-APP-01`) and Workspace Admin approver override (`BR-APP-04`)[cite: 1, 2].
* Atomic approval invalidation on mid-approval edit (`DEC-04`, `BR-APP-02`)[cite: 1, 2].
* `SHA-256` payload digest binding (`DEC-06`)[cite: 1, 2].
* Append-only, hash-chained audit trail (`DEC-08`) and Audit Packet export (`UC-04`)[cite: 1, 2].
* Target group read acknowledgments, completion dashboards, Hybrid Creator + Reader Pack quotas (`DEC-01`), and responsive mobile-first PWA (`DEC-07`)[cite: 1, 2].

### DO NOT Implement Deferred Scope (`CONFIRMED` Out of Slice 1)
* **Do NOT build Slice 2:** Parallel approvals, quorum/threshold approvals ("2 of 3"), approver delegation (`BR-APP-03`), automated 48h/96h overdue escalations, or visual side-by-side `.docx` diffing (`DEC-05`)[cite: 1, 2].
* **Do NOT build Slice 3:** SAML 2.0 SSO, SCIM provisioning, webhook event subscriptions, public Enterprise REST API, FDA 21 CFR Part 11 validation packages (`DEC-02`), hardware PKI certificate sign-offs, or offline native iOS/Android mobile apps (`DEC-07`)[cite: 1, 2].
* **Do NOT revive DISPROVEN assumptions:** Never implement per-user seat pricing for frontline readers (`DEC-01` — `DISPROVEN`)[cite: 1, 2] and never add UI copy, docs, or exports claiming out-of-the-box FDA 21 CFR Part 11 compliance (`DEC-02` — `DISPROVEN`)[cite: 1, 2].

---

## 3. Architectural Boundaries (`PROPOSED` Non-Negotiable)

Enforce the 5-layer architecture from `docs/ARCHITECTURE.md` and `docs/DEVELOPMENT_GUIDELINES.md`:

1. **Layer Separation:**
   * `src/app/` & `src/components/` (Presentation) → NEVER import `src/db/`, `src/server/services/`, `src/server/policies/`, `src/lib/storage/`, or `src/lib/crypto/`.
   * `src/server/actions/` & `src/app/api/` (Entry) → Thin handlers only: Authenticate → Validate (Zod) → Authorize (`src/server/policies/`) → Execute (`src/server/services/`) → Return `ActionResult<T>` or JSON DTO. NEVER run direct Drizzle queries in routes or actions.
   * `src/server/policies/` (AuthZ) → Read-only permission and separation-of-duties checks against live `ACTIVE` `tenant_memberships`.
   * `src/server/services/` (Domain) → Owns all state transitions, transactions, row locks, hashing, and audit appends.
2. **Server-Only Guard:** Add `import 'server-only';` to `src/db/index.ts`, all `src/server/**` modules, `src/lib/storage/**`, and `src/lib/auth/server.ts`.
3. **Stack Discipline:** Use the approved stack (`Next.js App Router`, `TypeScript`, `Supabase PostgreSQL`, `Drizzle ORM`, `Better Auth`, `TanStack Query`, `Tailwind CSS`, `shadcn/ui`, `Zod`, `Supabase Storage`). Do NOT introduce unapproved dependencies, alternative ORMs, Redux/MobX, or unnecessary abstractions.

---

## 4. Security Requirements (`CONFIRMED` / `PROPOSED`)

1. **Client Validation Is NEVER a Security Boundary:** Always re-validate every input with Zod and re-verify RBAC, tenant membership, and workflow state server-side.
2. **Mandatory Tenant Context Wrapper:** Every tenant-scoped database query MUST execute inside `withTenantContext(session, async (tx) => ...)` using transaction-scoped `SET LOCAL` (`set_config('app.current_tenant_id', tenantId, true)`). NEVER use session-scoped `SET` (breaks connection pooling).
3. **Non-Bypassable RLS Role:** Runtime queries MUST run as `app_user` (`NOBYPASSRLS`) with forced RLS enabled on all tenant-scoped tables. NEVER connect runtime code using superuser or `BYPASSRLS` credentials.
4. **Anti-Enumeration:** Return `404 NOT_FOUND` (not `403`) when a requested resource belongs to another tenant.
5. **Private Storage & Upload Safety:**
   * Keep `SUPABASE_STORAGE_BUCKET` strictly private; issue short-lived signed URLs (`120s` TTL) only after server-side RBAC and lifecycle visibility checks (`Reader` may only access `PUBLISHED` versions)[cite: 2].
   * Validate PDF uploads server-side (`0 < size <= 50MB`, `application/pdf`, `%PDF-` magic bytes)[cite: 2].
   * Never cache SOP PDFs or signed URLs in the PWA Service Worker.
6. **Sanitization & Secrets Hygiene:**
   * Render Markdown SOPs strictly through a sanitized pipeline (`react-markdown` + `rehype-sanitize`); never use unsanitized `dangerouslySetInnerHTML`.
   * Never log `reauthPassword`, session tokens, `BETTER_AUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, or signed URLs.

---

## 5. Business Logic Constraints (`CONFIRMED` Invariants)

Every implementation MUST preserve these non-negotiable domain invariants (`docs/BUSINESS_LOGIC.md`):

* **Separation of Duties (`DEC-03` — `VALIDATED`, `BR-APP-01`):** An author CANNOT approve their own document version (`actor.id !== version.author_id`) unless the tenant's disabled-by-default `allow_single_author_override` flag is explicitly enabled and audited[cite: 1, 2]. Enforce in both `src/server/policies/` and PostgreSQL trigger.
* **Atomic Approval Invalidation (`DEC-04` — `VALIDATED`, `BR-APP-02`):** Editing content, replacing the PDF, or altering critical controlled metadata of a `PENDING_APPROVAL` version MUST execute inside a single `FOR UPDATE` PostgreSQL transaction that marks the active cycle & collected steps `INVALIDATED` (never hard-deleted), increments the draft revision, transitions state to `DRAFT`, and appends `APPROVAL_INVALIDATED_BY_EDIT`[cite: 1, 2].
* **Strict Sequential Ordering (`BR-SEQ-01`, `BR-SEQ-02`):** Only the lowest `step_order` step in `PENDING` status can be acted upon.
* **Sign-Off Re-Authentication & Metadata (`REQ-FR-401`, `REQ-FR-402`):** Require Better Auth password re-authentication at sign-off and persist Full Name, User ID, Role, IP Address, UTC Timestamp, `SHA-256` Document Digest, and explicit Decision Intent[cite: 2].
* **SHA-256 Payload Binding (`DEC-06` — `PRODUCT DECISION`):** Compute `document_sha256` server-side upon submission, verify it on every sign-off and publication, and bind all `approval_steps` and `read_acknowledgments` records to the exact digest[cite: 1, 2]. Meet `< 1.5s` hashing target for 20MB files (`REQ-NFR-001`)[cite: 2].
* **Version Immutability & Single Published Version (`BR-VER-01`, `BR-VER-02`):** `APPROVED`, `PUBLISHED`, `SUPERSEDED`, and `RETIRED` versions are immutable; publishing a new version atomically transitions the previous `PUBLISHED` version to `SUPERSEDED`[cite: 2].
* **Append-Only Hash-Chained Audit Trail (`DEC-08` — `PARTIALLY VALIDATED`):** Append audit logs inside the **same** transaction as the domain mutation using `pg_advisory_xact_lock(hashtext(tenant_id::text))` and monotonic `sequence_number`. Never claim absolute or universal tamper-proofness[cite: 1, 2].

---

## 6. Coding & File Modification Rules (`PROPOSED`)

* **TypeScript Strictness:** Maintain `"strict": true` and zero `any`. Derive types from Zod schemas (`z.infer`) and Drizzle table definitions.
* **Naming & Structure:** Follow `docs/DEVELOPMENT_GUIDELINES.md` §2–§3 (`kebab-case` files, `*Action` Server Actions, `*.service.ts`, `*.policy.ts`, `SCREAMING_SNAKE_CASE` error codes and audit events).
* **Immutability of Applied Migrations:** NEVER edit or delete an already-applied SQL migration in `drizzle/`. Always create a new additive migration via `pnpm db:generate` or a new numbered SQL file.
* **Minimal Blast Radius:** Modify only files directly required for the active task/phase. Do not opportunistically refactor unrelated modules or alter approved documentation in `docs/` without explicit human permission.
* **Post-Commit Notifications:** Dispatch transactional emails (`INotificationProvider`) strictly **after** the PostgreSQL transaction commits.

---

## 7. Testing Requirements (`PROPOSED` Mandatory Gates)

No task or phase is complete until the following verification gates pass (`docs/TESTING_STRATEGY.md`):

1. **Static Checks:** `pnpm typecheck` and `pnpm lint` MUST pass with zero errors.
2. **Real PostgreSQL for Security & Concurrency:** NEVER mock PostgreSQL when testing RLS, `app_user` privileges, immutability triggers, partial unique indexes, or `FOR UPDATE` race conditions.
3. **Mandatory Invariant Coverage:** Any change touching auth, RBAC, workflows, hashing, uploads, or audit logging MUST include automated unit/integration tests covering:
   * Cross-tenant isolation and fail-closed RLS (`AC-05`).
   * Self-approval prevention (`DEC-03`)[cite: 1, 2].
   * Atomic invalidation and concurrent edit vs. sign-off race safety (`DEC-04`)[cite: 1, 2].
   * `SHA-256` tamper rejection (`DEC-06`)[cite: 1, 2].
   * Append-only audit chain integrity (`DEC-08`)[cite: 1, 2].
4. **Regression Rule:** Every bug fix MUST include a failing regression test before applying the fix.

---

## 8. Prohibited Shortcuts (Strict Violations)

AI coding agents MUST NEVER:

* Bypass `withTenantContext()`, disable RLS, or grant `BYPASSRLS` to `app_user` to fix a failing test or query.
* Hard-delete `approval_cycles`, `approval_steps`, `document_versions`, `read_acknowledgments`, or `audit_logs`.
* Trust client-submitted `tenant_id`, `role`, `user_id`, or `document_sha256` as authoritative values.
* Skip `SELECT ... FOR UPDATE` locks on lifecycle transitions, sign-offs, or invalidations.
* Skip `pg_advisory_xact_lock` when appending to `audit_logs`.
* Use `any`, `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` to silence type or import-boundary errors.
* Mock database tests to bypass real PostgreSQL constraint/RLS verification.
* Add unrequested Slice 2/3 features, enterprise QMS modules, or prohibited compliance claims (`DEC-02`, `DEC-08`)[cite: 1, 2].
