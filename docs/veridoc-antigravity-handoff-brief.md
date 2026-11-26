# VeriDoc — Antigravity handoff brief

> **App name:** VeriDoc — Document & SOP Approval Workspace
> **Baseline:** 16-file engineering package, D0 approved 16/16 on 23 Nov 2026 as the Antigravity baseline
> **Target:** Slice 1 — Core Lifecycle MVP only
> **How to use this brief:** Paste Section 10 into Google Antigravity to start Phase 0. Keep this brief open alongside `AGENTS.md` for the whole build. If anything here conflicts with the docs in `docs/`, the docs win — stop and ask for human confirmation.

## 1. What VeriDoc is

VeriDoc is a multi-tenant cloud governance platform for authoring, reviewing, approving, publishing, and tracking read acknowledgments of Standard Operating Procedures (SOPs) and controlled operational documents.

It sits between unstructured file storage (Google Drive, SharePoint) and heavyweight enterprise QMS tools (MasterControl, Veeva Vault) for mid-market operating companies of 50–1,000 employees in manufacturing, logistics, healthcare operations, biotech services, specialty food and beverage, and compliance-conscious technology.

Slice 1 ships:

- Markdown / rich-text authoring and PDF uploads
- Textual Markdown diffing
- Sequential multi-stage approvals with separation of duties
- Atomic approval invalidation on edit
- SHA-256 payload binding for sign-offs and acknowledgments
- Append-only, hash-chained audit trail and Audit Packet export
- Target-group read assignments, completion dashboards, and a responsive mobile-first PWA for readers
- Hybrid Creator Seat + Operational Reader Pack quota tracking

VeriDoc is not a full enterprise QMS, a generic collaborative editor, or a contract e-signature suite.

## 2. The 16-file baseline and reading order

Do not write code before reading the docs for the phase you are in. This order is mandatory (`AGENTS.md` §1).

**The package — 16 files**

| # | File | Owns |
|---|---|---|
| 1 | `README.md` | Product overview, stack, project structure, env vars, setup |
| 2 | `docs/PRODUCT_REQUIREMENTS.md` | Requirements `REQ-FR-*` / `REQ-NFR-*`, acceptance criteria `AC-01`–`AC-05` |
| 3 | `docs/BUSINESS_LOGIC.md` | Lifecycle state machine, business rules `BR-*`, hashing and versioning rules |
| 4 | `docs/USER_FLOWS.md` | Role flows for all 5 roles, exception and concurrency flows |
| 5 | `docs/ARCHITECTURE.md` | 5-layer monolith, `withTenantContext()` RLS bridge, transaction boundaries |
| 6 | `docs/DATABASE_SCHEMA.md` | Tables, enums, indexes, RLS policies, triggers, migrations |
| 7 | `docs/API_SPECIFICATION.md` | Server Actions, Route Handlers, Zod schemas, error codes |
| 8 | `docs/SECURITY.md` | Threat model, RBAC matrix, upload/storage rules, 11-point release checklist |
| 9 | `docs/DESIGN_SYSTEM.md` | Tailwind + shadcn/ui tokens, lifecycle badges, domain components, PWA layout |
| 10 | `docs/IMPLEMENTATION_PLAN.md` | Phase 0–6 roadmap, dependencies, exit criteria |
| 11 | `docs/TESTING_STRATEGY.md` | Vitest + Playwright + real PostgreSQL pyramid, CI gates |
| 12 | `docs/DEVELOPMENT_GUIDELINES.md` | Naming, import boundaries, TypeScript and DB access rules |
| 13 | `docs/PROGRESS_TRACKER.md` | Single source for phase status `M0`–`M6` and open decisions |
| 14 | `AGENTS.md` | Binding rules for all AI coding agents in this repo |
| 15 | `docs/DECISIONS.md` | `DEC-01`–`DEC-08`, tensions `T-01`/`T-02`, open questions, `ADR-01`–`ADR-08` |
| 16 | `VALIDATION_REPORT.md` | Cross-document validation and readiness verdict: READY WITH OPEN QUESTIONS |

Note on layout: in the repository the docs live under `docs/` as above. The audit package was delivered flat — `docs/PRODUCT_REQUIREMENTS.md` in the text means that file.

**Reading order before any code**

1. Product and scope: `README.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/DECISIONS.md`
2. Domain and UX: `docs/BUSINESS_LOGIC.md`, `docs/USER_FLOWS.md`, `docs/DESIGN_SYSTEM.md`
3. Architecture and data: `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `docs/API_SPECIFICATION.md`, `docs/SECURITY.md`
4. Execution and QA: `docs/IMPLEMENTATION_PLAN.md`, `docs/TESTING_STRATEGY.md`, `docs/DEVELOPMENT_GUIDELINES.md`, `docs/PROGRESS_TRACKER.md`
5. Agent rules throughout: `AGENTS.md`

After each milestone, update `docs/PROGRESS_TRACKER.md`. Do not skip foundation phases to build UI early.

## 3. Locked decisions — do not reopen without human confirmation

These were resolved in the audited revision. Treat them as settled.

**T-01 RESOLVED — Slice 1 is PDF-only**

- Accept `application/pdf` only, `0 < size <= 50MB`, verified by `%PDF-` magic bytes.
- `.docx` upload, `.docx`-to-PDF/A conversion, and visual `.docx` diffing are Slice 2.
- Enforced by `file_mime_type CHECK = 'application/pdf'` and `content_format ENUM ('MARKDOWN','PDF')`.

**BR-VER-03 / OQ-02 RESOLVED for Slice 1 — no minor-edit bypass**

- Minor revisions (`v1.1`) require full sequential approval in Slice 1.
- There is **no** `publishMinorAdminEditAction` in Slice 1. Do not build it.
- `is_minor_admin_edit` and `minor_edit_justification` are audit metadata only and must remain `false` on publish.

**Canonical document digest — DEC-06 (PRODUCT DECISION)**

```text
document_sha256 = SHA-256(normalized_markdown || file_sha256 || canonical_metadata_json)
```

- `normalized_markdown`: NFC, LF-normalised Markdown; empty string if PDF-only.
- `file_sha256`: SHA-256 of the exact immutable PDF object in Supabase Storage; empty string if Markdown-only.
- `canonical_metadata_json`: deterministic key-sorted JSON `{ document_code, title, version_label, tenant_id }`.
- Computed server-side only. The client never supplies an authoritative digest — `expectedDocumentSha256` is not an input to sign-off or acknowledgment. Verify on every sign-off and publication; mismatch aborts with `422 INTEGRITY_HASH_MISMATCH`.

**Canonical audit hash — DEC-08 (PARTIALLY VALIDATED)**

```text
entry_hash = SHA-256(AUDIT_HASH_SALT || prev_hash || tenant_id || sequence_number || event_type || entity_id || canonical_payload_json)
```

- `AUDIT_HASH_SALT` is the optional deployment domain separator (empty string if unset). Set it once at first deployment; changing it later breaks chain verification.
- `canonical_payload_json` is deterministic key-sorted JSON. `created_at` is **not** a hash input.
- Genesis entry (`sequence_number = 1`) uses a 64-character zero `prev_hash`.
- Append inside the same transaction as the domain mutation, serialized per tenant with `pg_advisory_xact_lock(hashtext(tenant_id::text))`.
- Never describe the audit trail as "100% tamper-proof". It is append-only and hash-chained, subject to cloud infrastructure and DBA boundaries.

**Better Auth + forced RLS — ADR-02**

- One wrapper only: `withTenantContext(session, fn)` opens a transaction and executes only `SELECT set_config('app.current_tenant_id', tenantId, true)`.
- It does **not** execute `SET LOCAL ROLE` and does **not** set `app.current_user_id`. No RLS policy uses that variable.
- Runtime connects as `app_user` with `NOBYPASSRLS`; forced RLS is enabled on all tenant-scoped tables. Migrations use `DIRECT_DATABASE_URL`, never the runtime role.
- Fail-closed: a query outside `withTenantContext()` sees `NULL` tenant, returns 0 rows, and rejects writes.
- Cross-tenant lookups return `404 NOT_FOUND`, not `403`.

**Other locked values**

- Signed preview URLs: **120 seconds** TTL, issued only after server-side tenant and RBAC checks. Readers may only access `PUBLISHED` versions.
- Performance (`REQ-NFR-001`): hashing and preview **< 1.5s** for files up to 20MB, **< 5s** for 20MB–50MB, using streaming `crypto.createHash('sha256')` without buffering the whole file.
- Pricing (`DEC-01`): per-user reader seat pricing is DISPROVEN. Use Hybrid Creator Seats ($25–$45/creator/month) + Reader Packs (100 / 500 / 2,000). `creator_seat_limit DEFAULT 10` is a seed default, not a tier.
- Compliance (`DEC-02`): out-of-the-box FDA 21 CFR Part 11 compliance is DISPROVEN. Never claim it in UI, docs, or exports. Slice 1 supports ISO 9001, ISO 27001, SOC 2 Type II, and GMP document control workflows. No eIDAS QES.

## 4. Roles, states, and stack — use verbatim

**5 RBAC roles — enum in code, display name in UI**

| Display name | Enum |
|---|---|
| Workspace Admin | `WORKSPACE_ADMIN` |
| Quality Manager | `QUALITY_MANAGER` |
| Document Author | `DOCUMENT_AUTHOR` |
| Approver / Reviewer | `APPROVER_REVIEWER` |
| Reader | `READER` |

There is no `Viewer` role. Creator Seats count the first four roles; `READER` counts only against Reader Packs.

**6 lifecycle states — version level, no other values**

`DRAFT` → `PENDING_APPROVAL` → `APPROVED` → `PUBLISHED` → `SUPERSEDED`, with `PUBLISHED` → `RETIRED` by manual retire. There is no `ARCHIVED` state. `APPROVED`, `PUBLISHED`, `SUPERSEDED`, and `RETIRED` versions are immutable. Only one version per document may be `PUBLISHED` at a time.

**Stack — PROPOSED baseline, do not substitute**

Next.js (App Router) + TypeScript (`strict: true`), Supabase PostgreSQL, Drizzle ORM, Better Auth, TanStack Query, Tailwind CSS + shadcn/ui, Zod, Supabase Storage (private bucket), Vercel + GitHub, `pnpm`. No Prisma, no alternative ORM, no Redux/MobX, no unapproved dependencies.

Project layout is in `README.md` §5: `src/app/`, `src/components/`, `src/db/`, `src/lib/`, `src/server/actions/`, `src/server/services/`, `src/server/policies/`, `src/types/`, `tests/`, `drizzle/`.

## 5. Phase 0 to Phase 6 — sequential, gated

Work in order `M0` → `M6`. A phase is not done until its exit criteria and tests pass (Section 11).

| Phase | Milestone | Delivers | Depends on |
|---|---|---|---|
| Phase 0 | `M0` | Bootstrap, tooling, CI | D0 (done) |
| Phase 1 | `M1` | Schema, forced RLS, Better Auth | `M0` |
| Phase 2 | `M2` | RBAC, quotas, audit core | `M1` |
| Phase 3 | `M3` | Authoring, PDF upload, hashing, diff | `M2` |
| Phase 4 | `M4` | Sequential approvals, invalidation | `M3` |
| Phase 5 | `M5` | Publishing, Reader PWA, dashboards | `M4` |
| Phase 6 | `M6` | Audit Packet, hardening, release QA | `M5` |

**Phase 0 — Bootstrap and tooling.** Scaffold Next.js + TypeScript, Tailwind + shadcn/ui primitives and tokens, Drizzle wiring, Zod, TanStack Query provider, `server-only` guards, PWA `public/manifest.json` shell with zero offline SOP caching, ESLint `no-restricted-imports` layer boundaries, GitHub Actions CI (`typecheck`, `lint`, `test`). Exit: app boots at `http://localhost:3000`, empty migration succeeds, typecheck and lint pass in CI, server-only secrets fail the build if imported into a Client Component.

**Phase 1 — Schema, forced RLS, and Better Auth.** Drizzle schema for all tables and enums in `DATABASE_SCHEMA.md`; custom SQL for `app_user` (`NOBYPASSRLS`), `REVOKE UPDATE, DELETE` on `audit_logs` and `read_acknowledgments`, `REVOKE DELETE` on `approval_cycles`, `approval_steps`, `document_versions`, `read_assignments`, forced RLS, partial unique indexes, and immutability / self-approval triggers (self-approval trigger is `BEFORE INSERT OR UPDATE` on `approval_steps`, joined via `approval_cycles` to `document_versions.author_id`). Implement `withTenantContext()`. Integrate Better Auth at `/api/auth/[...all]` with email/password, optional Reader magic link, workspace switcher, and sign-off password re-authentication. Exit: two seeded tenants pass cross-tenant and fail-closed RLS tests (`AC-05`); queries as `app_user` without tenant context return 0 rows.

**Phase 2 — RBAC, quotas, and audit core.** `src/server/policies/` enforcing the 5-role matrix against live `ACTIVE` `tenant_memberships`; `AuditService` with advisory lock, monotonic `sequence_number`, and chain verifier; Workspace Admin actions with Creator vs. Reader Pack quota checks; role-adapted desktop sidebar and mobile bottom tab bar; Workspace Settings UI. Exit: RBAC sweep passes, exceeding a quota returns `402 SEAT_QUOTA_EXCEEDED`, 10-way concurrent audit appends produce a gapless valid chain, `UPDATE`/`DELETE` on `audit_logs` fail at the database layer.

**Phase 3 — Authoring, uploads, hashing, and diff.** `CryptoService` for streaming `file_sha256` and canonical `document_sha256`; private Storage upload and 120s signed preview URLs with `%PDF-` and 50MB checks; `createDocumentAction`, `updateDocumentVersionAction`, `createRevisionAction`, `/upload`, `/preview-url`, `/diff`; Markdown editor with `rehype-sanitize`, PDF uploader, `MarkdownDiffViewer`, `LifecycleStatusBadge`, `Sha256DigestChip`. Exit: spoofed, 0-byte, and >50MB files rejected with `400 INVALID_FILE_PAYLOAD`; Reader cannot fetch `DRAFT` signed URLs; Markdown XSS neutralised; 20MB hash benchmark < 1.5s.

**Phase 4 — Approval engine and invalidation.** `ApprovalService` with `FOR UPDATE` locks; `submitForApprovalAction`, `executeApprovalDecisionAction`, `recallApprovalAction`, `adminOverrideApproverAction`; Approval Queue UI, `SequentialStepper`, `SignOffReauthModal`, `InvalidationWarningModal`; post-commit email via `INotificationProvider`. Exit: `AC-01` and `AC-02` pass; self-approval blocked with `403 SELF_APPROVAL_PROHIBITED` in service and trigger; out-of-order approval fails with `409 APPROVAL_STEP_NOT_ACTIVE`; mid-approval edit atomically resets to `DRAFT`, invalidates the cycle, increments the draft revision, and logs `APPROVAL_INVALIDATED_BY_EDIT`; concurrent edit vs. sign-off race never yields an `APPROVED` version with modified content.

**Phase 5 — Publishing, Reader PWA, and dashboards.** `publishDocumentVersionAction`, `retireDocumentVersionAction`, `acknowledgeDocumentAction`; atomic superseding and assignment materialisation; mobile Reader PWA at `/acknowledgments` with `ReaderAcknowledgmentBar` engagement gate; Completion Dashboard. No minor-edit bypass — see Section 3. Exit: `AC-03` passes; publishing atomically moves the prior `PUBLISHED` version to `SUPERSEDED`; acknowledgment persists user, UTC timestamp, version, and exact `document_sha256`; mobile viewport 375×812 E2E passes; no sensitive PDFs cached offline.

**Phase 6 — Audit Packet, hardening, and release QA.** Audit Trail viewer and streaming Audit Packet export (`/api/audit/export?format=json|pdf`, `UC-04`); rate limits and security headers (CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`); all 11 items in `SECURITY.md` §9; compliance copy guard. Exit: `AC-01`–`AC-05` pass on Vercel + Supabase staging; exported packet includes lineage, digests, sign-offs, invalidations, and acknowledgments with `chainVerified: true`; zero critical/high findings.

## 6. Core invariants — every phase, every change

- **Separation of duties (`DEC-03`, `BR-APP-01`, VALIDATED):** `actor.id !== version.author_id` on every sign-off, enforced in `src/server/policies/`, in the service, and by the database trigger. The only exception is the tenant flag `allow_single_author_override`, disabled by default, settable only by `WORKSPACE_ADMIN`, and audited as `SELF_APPROVAL_OVERRIDE_USED` on every use.
- **Atomic invalidation (`DEC-04`, `BR-APP-02`, VALIDATED):** Editing content, replacing the PDF, or changing `title` or `effective_date` on a `PENDING_APPROVAL` version runs in one `FOR UPDATE` transaction: mark cycle and steps `INVALIDATED` (never hard-delete), increment draft revision, set state to `DRAFT`, append `APPROVAL_INVALIDATED_BY_EDIT`. Both `updateDocumentVersionAction` and PDF `/upload` return `409 INVALIDATION_CONFIRMATION_REQUIRED` when `confirmInvalidateApprovals !== true`. `document_code` and `category` are container metadata and do not trigger invalidation.
- **Sequential gating (`BR-SEQ-01`, `BR-SEQ-02`):** Only the lowest `step_order` step in `PENDING` can be acted on. No consecutive duplicate approvers (`BR-SEQ-03`, enforced in `submitForApprovalAction`).
- **Sign-off record (`REQ-FR-401`, `REQ-FR-402`):** Password re-authentication at sign-off, then persist full name, user ID, role, IP, UTC timestamp, `document_sha256`, and explicit decision intent. Wrong re-auth returns `401 REAUTH_FAILED`.
- **Single published version (`BR-VER-01`, `BR-VER-02`):** Partial unique index `uq_one_published_version_per_doc`; one active cycle per version via `uq_one_active_cycle_per_version`.
- **Layering:** Presentation never imports `src/db/`, services, policies, storage, or crypto. Actions and Route Handlers are thin: Authenticate → Validate (Zod) → Authorize (policies) → Execute (services) → Return `ActionResult<T>` or JSON DTO. Policies are read-only. Services own transitions, locks, hashing, and audit appends. Add `import 'server-only'` to `src/db/index.ts`, all `src/server/**`, `src/lib/storage/**`, and `src/lib/auth/server.ts`.

## 7. Non-negotiables and prohibited shortcuts

An agent must never do any of the following. These are hard stops, not preferences (`AGENTS.md` §8).

- Bypass `withTenantContext()`, disable RLS, or grant `BYPASSRLS` to `app_user` to make a test or query pass.
- Hard-delete `approval_cycles`, `approval_steps`, `document_versions`, `read_acknowledgments`, or `audit_logs`.
- Trust client-submitted `tenant_id`, `role`, `user_id`, or `document_sha256` as authoritative.
- Skip `SELECT ... FOR UPDATE` on lifecycle transitions, sign-offs, or invalidations.
- Skip `pg_advisory_xact_lock` when appending to `audit_logs`.
- Cache SOP PDFs or signed URLs in the PWA Service Worker.
- Render Markdown with unsanitised `dangerouslySetInnerHTML`. Use `react-markdown` + `rehype-sanitize`.
- Log `reauthPassword`, session tokens, `BETTER_AUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, or signed URLs.
- Use `any`, `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` to silence type or import-boundary errors.
- Mock PostgreSQL for RLS, privileges, triggers, partial unique indexes, or `FOR UPDATE` race tests.
- Edit or delete an already-applied migration. Always create a new additive migration.
- Send transactional email before the PostgreSQL transaction commits.
- Add UI copy, docs, or exports claiming FDA 21 CFR Part 11 certification or 100% tamper-proof audit logs.

Client-side validation is UX only. Re-validate with Zod and re-check RBAC, tenant membership, and workflow state server-side on every boundary.

## 8. What not to build in Slice 1

Do not build these as Slice 1 work, dependencies, stubs with behaviour, or UI entries.

**Slice 2 — deferred**

- Parallel approvals and quorum approvals ("any 2 of 3")
- Approver delegation (`BR-APP-03`)
- Automated 48h reminder / 96h escalation
- `.docx` upload and visual side-by-side `.docx` / cross-format diffing
- Minor-edit approval bypass (`publishMinorAdminEditAction`)

**Slice 3 — deferred**

- SAML 2.0 SSO and SCIM provisioning
- Webhook subscriptions and public Enterprise REST API
- FDA 21 CFR Part 11 validation package
- Hardware PKI / certificate sign-offs
- Offline native iOS/Android apps

Also out of scope: CAPA, non-conformance, calibration and training LMS modules; generic contract e-signature; real-time multi-cursor collaborative editing; per-user reader pricing.

## 9. Open items and their gates

Only these remain open. None block Phase 0, 1, or 2.

| Item | Status | Default in docs | Decide by |
|---|---|---|---|
| Transactional email vendor | `PROPOSED` | Abstracted as `INotificationProvider` (e.g. Resend or Postmark); configure SPF/DKIM before staging | Before Phase 4 (`M4`) |
| PKI sufficiency for sign-off | `UNRESOLVED` (`OQ-03`) | Slice 1 uses Better Auth password re-authentication | Before Phase 4 (`M4`) |
| Reader engagement threshold | `PROPOSED` (`ADR-08`) | >= 90% scroll or all PDF pages viewed, and >= 10s dwell; server returns `422 ENGAGEMENT_THRESHOLD_NOT_MET` | Before Phase 5 (`M5`) |
| Native offline apps | `UNRESOLVED` (`DEC-07` / `OQ-01`) | Slice 1 is online-only PWA; evaluate from shop-floor feedback | Post-Slice 1 (Slice 3) |

If you hit an `UNRESOLVED` item or a contradiction not listed here, stop and ask for human confirmation. Do not invent a requirement to keep moving.

## 10. Start Phase 0 now — copy-paste prompt for Antigravity

Paste everything in the block below as the first instruction in Google Antigravity.

```text
You are building VeriDoc (Document & SOP Approval Workspace), Slice 1: Core Lifecycle MVP.

The approved 16-file engineering baseline in this repo is your only source of truth. D0 is approved 16/16. Before writing any code, read in this order: README.md, docs/PRODUCT_REQUIREMENTS.md, docs/DECISIONS.md, docs/BUSINESS_LOGIC.md, docs/USER_FLOWS.md, docs/DESIGN_SYSTEM.md, docs/ARCHITECTURE.md, docs/DATABASE_SCHEMA.md, docs/API_SPECIFICATION.md, docs/SECURITY.md, docs/IMPLEMENTATION_PLAN.md, docs/TESTING_STRATEGY.md, docs/DEVELOPMENT_GUIDELINES.md, docs/PROGRESS_TRACKER.md, and AGENTS.md. AGENTS.md governs your behaviour for the whole build.

Implement ONLY Phase 0 (M0) from docs/IMPLEMENTATION_PLAN.md. Do not start Phase 1 schema, RLS, or auth logic, and do not build any UI screens beyond the app shell.

Phase 0 deliverables:
1. Scaffold Next.js (App Router) + TypeScript with "strict": true and "noUncheckedIndexedAccess": true, using pnpm, matching the folder layout in README.md §5.
2. Configure Tailwind CSS and shadcn/ui primitives in src/components/ui/ with the semantic tokens from docs/DESIGN_SYSTEM.md.
3. Wire Drizzle ORM (drizzle.config.ts, src/db/index.ts), Zod, TanStack Query provider, and the server-only package. Add import 'server-only' to src/db/index.ts.
4. Add public/manifest.json PWA shell (DEC-07). The Service Worker must cache the app shell only — never SOP PDFs or signed URLs.
5. Configure ESLint no-restricted-imports so src/app and src/components can never import src/db, src/server/services, src/server/policies, src/lib/storage, or src/lib/crypto.
6. Add scripts: pnpm dev, pnpm build, pnpm lint, pnpm typecheck, pnpm test, pnpm db:generate, pnpm db:migrate. Add GitHub Actions CI running typecheck, lint, and test on every PR.
7. Create .env.example listing every variable from README.md §7 (DATABASE_URL, DIRECT_DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET, AUDIT_HASH_SALT). Never commit real secrets. Server secrets must never use the NEXT_PUBLIC_ prefix.

Locked rules you must not violate in any phase:
- Slice 1 is PDF-only (T-01 RESOLVED). No .docx upload or conversion.
- No minor-edit bypass in Slice 1 (BR-VER-03). There is no publishMinorAdminEditAction.
- Use only these role enums: WORKSPACE_ADMIN, QUALITY_MANAGER, DOCUMENT_AUTHOR, APPROVER_REVIEWER, READER. Use only these lifecycle states: DRAFT, PENDING_APPROVAL, APPROVED, PUBLISHED, SUPERSEDED, RETIRED.
- Never claim FDA 21 CFR Part 11 compliance or 100% tamper-proof audit logs.
- Do not build Slice 2 or Slice 3 features (parallel/quorum approvals, delegation, 48h/96h escalations, .docx visual diff, SAML SSO, SCIM, webhooks, Enterprise API, Part 11 package, PKI sign-offs, native offline apps).

Phase 0 is done only when: the app boots at http://localhost:3000, an empty Drizzle migration applies cleanly, pnpm typecheck and pnpm lint pass with zero errors locally and in CI, and importing a server-only secret into a Client Component fails the build. When done, update docs/PROGRESS_TRACKER.md to mark M0 complete and report exactly what you built and what you verified. If any doc is ambiguous or contradictory, stop and ask — do not guess.
```

**Phase 0 checklist for the human reviewer**

- [ ] Repo matches `README.md` §5 layout; no `prisma/` folder
- [ ] `pnpm dev` boots, `pnpm typecheck` and `pnpm lint` pass, CI is green
- [ ] Empty migration applies with `pnpm db:migrate`
- [ ] `.env.example` complete; no real secret committed; `AUDIT_HASH_SALT` noted as set-once
- [ ] PWA manifest present; Service Worker caches app shell only
- [ ] ESLint import boundaries proven by a deliberate failing import test
- [ ] `PROGRESS_TRACKER.md` updated for `M0`

Environment reminder (`README.md` §6–§7): Node.js v20 LTS+, `pnpm` v9+, a Supabase project (cloud or local CLI + Docker). Runtime uses the pooled `DATABASE_URL` as `app_user`; migrations use `DIRECT_DATABASE_URL`. Keep the two separate from the first commit.

## 11. Definition of done — per phase

A phase counts as done only when all of the following are true. "Code written" is not done.

1. **Scope:** Everything delivered is Slice 1 and in the phase's deliverables list. No Slice 2/3 behaviour, no undocumented business rule.
2. **Static gates:** `pnpm typecheck` and `pnpm lint` pass with zero errors.
3. **Tests:** Unit, integration, and — where the phase requires it — Playwright E2E tests pass. Security, RLS, trigger, and concurrency tests run against real PostgreSQL as `app_user`, never a mock. Every bug fix ships with a failing regression test first.
4. **Invariant coverage:** Any change touching auth, RBAC, workflows, hashing, uploads, or audit logging includes tests for cross-tenant isolation and fail-closed RLS (`AC-05`), self-approval prevention (`DEC-03`), atomic invalidation and the edit vs. sign-off race (`DEC-04`), SHA-256 tamper rejection (`DEC-06`), and audit chain integrity (`DEC-08`), as applicable to the phase.
5. **Acceptance criteria:** The phase's criteria in `IMPLEMENTATION_PLAN.md` are demonstrably met, and the relevant `AC-01`–`AC-05` gates pass by Phase 6.
6. **Tracker:** `docs/PROGRESS_TRACKER.md` is updated to the new milestone status in the same change.

Release gate (`M6`): all `AC-01`–`AC-05` pass on Vercel preview + Supabase staging, all 11 items in `SECURITY.md` §9 pass, performance meets `REQ-NFR-001`, and the compliance copy guard finds zero prohibited claims.
