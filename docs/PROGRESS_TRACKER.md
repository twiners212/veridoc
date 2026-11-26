# VeriDoc — Project Progress Tracker — Slice 1: Core Lifecycle MVP

> **App name:** VeriDoc — Document & SOP Approval Workspace. “VeriDoc” is the canonical product name throughout this package.

> **Status:** Slice 1 (Core Lifecycle MVP) COMPLETED & VERIFIED (24 Nov 2026) — Post-M6 UX, Performance & Brand Polish Updated (25 Nov 2026)  
> **Target Scope:** Slice 1 (Core Lifecycle MVP)[cite: 2]  
> **Primary Source:** Product Specification v3.0 (`CONFIRMED`)[cite: 2]  
> **Decision Authority:** Product Decision & Validation Log v3.0 (`CONFIRMED`)[cite: 1]  
> **Related Docs:** `docs/IMPLEMENTATION_PLAN.md`, `docs/TESTING_STRATEGY.md`, `docs/DECISIONS.md`, `VALIDATION_REPORT.md`

---

## 1. Phase Status Overview (`PROPOSED` Tracking Structure)

| Phase | Milestone | Scope Summary | Status | Blocking Dependencies |
| :--- | :---: | :--- | :---: | :--- |
| **Doc Baseline** | `D0` | Complete 16-file engineering documentation package (VeriDoc) | `COMPLETED` (16/16 — approved by the user on 23 Nov 2026 as the Antigravity baseline) | Approved 23 Nov 2026 |
| **Phase 0** | `M0` | Project bootstrap, Next.js + Drizzle + shadcn/ui + CI scripts | `COMPLETED` (23 Nov 2026) | None (M0 achieved) |
| **Phase 1** | `M1` | PostgreSQL schema, `app_user` (`NOBYPASSRLS`), forced RLS, triggers, Better Auth | `COMPLETED` (23 Nov 2026) | None (M1 achieved) |
| **Phase 2** | `M2` | 5-role RBAC policies, Hybrid Seat Quotas (`DEC-01`), hash-chained `AuditService` (`DEC-08`)[cite: 1, 2] | `COMPLETED` (23 Nov 2026) | None (M2 achieved) |
| **Phase 3** | `M3` | Markdown authoring, PDF uploads (`<= 50MB`), `SHA-256` hashing (`DEC-06`), Markdown diff (`DEC-05`)[cite: 1, 2] | `COMPLETED` (23 Nov 2026) | None (M3 achieved; .docx deferred to Slice 2 per DECISIONS §3 T-01) |
| **Phase 4** | `M4` | Sequential approval engine, separation of duties (`DEC-03`), atomic invalidation (`DEC-04`), Approvals UI & Queue (`.stitch-ref` Screen 5)[cite: 1, 2] | `COMPLETED` (Part 1 Backend & Part 2 UI Integration Complete) | `M3` achieved |
| **Phase 5** | `M5` | Publishing/superseding, Mobile PWA Reader (`DEC-07`), engagement gate, Completion Dashboards[cite: 1, 2] | `COMPLETED` (24 Nov 2026) | None (M5 achieved) |
| **Phase 6** | `M6` | Audit Packet export (`UC-04`), rate limits, security headers, full Security & E2E QA[cite: 2] | `COMPLETED` (24 Nov 2026) | `M5` achieved |

---

## 2. Completed Tasks

### Documentation Baseline (`D0` — Approved Files)
- [x] `docs/PROGRESS_TRACKER.md`, `AGENTS.md`, `docs/DECISIONS.md`, `VALIDATION_REPORT.md` — completed in this revision (F-01–F-23 fixes applied; see VALIDATION_REPORT.md §1).
- [x] `README.md` — Product overview, Slice 1 positioning, stack rationale, folder layout, setup, and roadmap.
- [x] `docs/PRODUCT_REQUIREMENTS.md` — Goals, personas, functional/non-functional requirements, MVP boundaries, acceptance criteria (`AC-01`–`AC-05`), and traceability matrix.
- [x] `docs/BUSINESS_LOGIC.md` — Lifecycle state machine, sequential rules, separation of duties (`BR-APP-01`), atomic invalidation (`BR-APP-02`), semantic versioning, `SHA-256` binding, and edge cases.
- [x] `docs/USER_FLOWS.md` — Role flows for all 5 personas/roles and exception/concurrency sequence diagrams.
- [x] `docs/ARCHITECTURE.md` — 5-layer monolith design, Better Auth ↔ PostgreSQL RLS `withTenantContext()` bridge, transaction boundaries, and storage integration.
- [x] `docs/DATABASE_SCHEMA.md` — Full Slice 1 PostgreSQL/Drizzle schema, composite tenant FKs, partial unique indexes, forced RLS policies, immutability triggers, and migration strategy.
- [x] `docs/API_SPECIFICATION.md` — Server Actions (`ActionResult<T>`), Route Handlers, Zod schemas, sign-off re-authentication, error codes, and pagination standards.
- [x] `docs/SECURITY.md` — STRIDE threat model, RBAC matrix, RLS isolation, PDF upload validation, `SHA-256` & audit hash-chain protection, rate limits, and 11-point pre-release checklist.
- [x] `docs/DESIGN_SYSTEM.md` — Tailwind + shadcn/ui tokens, lifecycle badges, domain modals, desktop/mobile navigation, mobile-first Reader PWA, and WCAG 2.1 AA standards.
- [x] `docs/IMPLEMENTATION_PLAN.md` — Sequential 7-phase Slice 1 roadmap (`M0`–`M6`) with dependencies and exit criteria.
- [x] `docs/TESTING_STRATEGY.md` — Vitest + Playwright + real PostgreSQL testing pyramid, DB/RLS/concurrency tests, and CI gates.
- [x] `docs/DEVELOPMENT_GUIDELINES.md` — Coding standards, naming conventions, import boundaries, TypeScript rules, DB access rules, Git workflow, and dependency policy.

---

## 3. Pending Tasks (Slice 1 Implementation Checklist)

### Documentation Baseline (`D0` — Remaining)
- [x] User approval of this rewritten 16-file baseline (F-01–F-23 fixes) — approved 23 Nov 2026 as the Antigravity baseline.

### Phase 0 — Project Bootstrap & Tooling (`M0`)
- [x] Initialize Next.js App Router + TypeScript (`strict: true`) repository with `pnpm`.
- [x] Configure Tailwind CSS, shadcn/ui primitives (`src/components/ui/`), and semantic tokens (`docs/DESIGN_SYSTEM.md` & Stitch `designTheme`).
- [x] Configure Drizzle ORM (`drizzle.config.ts`, `src/db/index.ts`), `server-only`, Zod, and TanStack Query provider.
- [x] Add `public/manifest.json` responsive PWA shell (`DEC-07`) with zero offline SOP caching.
- [x] Configure ESLint `no-restricted-imports` layer boundaries and CI scripts (`typecheck`, `lint`, `build`).
- [x] Fetch all 7 Google Stitch visual reference screens into `.stitch-ref/` (gitignored).
- [x] Create `.env.example` with full configuration template for `app_user` RLS and migrations.
- [x] Resolve Pre-Coding Gate items (T-01 PDF-only, OQ-02 no minor-edit bypass, ADR-05, ADR-08, INotificationProvider confirmed).

### Phase 1 — Database Schema, Forced RLS & Better Auth (`M1`)
- [x] Author Drizzle schema modules (`src/db/schema/*`) for all tables and enums in `docs/DATABASE_SCHEMA.md` inside `veridoc` schema.
- [x] Create custom SQL migrations for `veridoc_app_user` (`NOBYPASSRLS`), `REVOKE UPDATE, DELETE` on `audit_logs` & `read_acknowledgments`, `REVOKE DELETE` on controlled tables, forced RLS policies, partial unique indexes, and PL/pgSQL immutability / self-approval triggers.
- [x] Implement `withTenantContext(session, fn)` using transaction-scoped `SET LOCAL` (`set_config(..., true)`).
- [x] Integrate Better Auth (`/api/auth/[...all]`), email/password sign-in, and sign-off password re-authentication (`REQ-FR-401`)[cite: 2].
- [x] Pass `M1` DB integration tests: fail-closed RLS, pooler isolation, cross-tenant isolation (`AC-05`), partial unique indexes, check constraints, and schema triggers (18/18 tests passing).

### Phase 2 — Workspace Administration, RBAC & Audit Core (`M2`)
- [x] Implement `src/server/policies/` 5-role RBAC enforcement against live `ACTIVE` `tenant_memberships` (`REQ-FR-602`)[cite: 2].
- [x] Implement `AuditService` with `pg_advisory_xact_lock`, monotonic `sequence_number`, `SHA-256` hash chaining, and chain verifier (`DEC-08`)[cite: 1, 2].
- [x] Implement Workspace Admin Server Actions with Hybrid Creator Seat vs. Reader Pack quota enforcement (`DEC-01`)[cite: 1, 2].
- [x] Build role-adapted Desktop Sidebar & Mobile Bottom Tab Bar (`docs/DESIGN_SYSTEM.md` §6) and Workspace Settings UI (`.stitch-ref` Screens 1 & 4).
- [x] Pass `M2` tests: 5-role RBAC sweep (26 tests), seat quota limits (`402` SEAT_QUOTA_EXCEEDED, 11 tests), and concurrent 10-way audit hash-chain serialization (3 tests). Total project: 58/58 tests passing on live PostgreSQL.

### Phase 3 — Document Authoring, PDF Uploads, Hashing & Diffing (`M3`)
- [x] Implement `CryptoService` for streaming `file_sha256` and canonical `document_sha256` (`DEC-06`, `< 1.5s` for 20MB PDF per `REQ-NFR-001`)[cite: 1, 2].
- [x] Implement private Supabase Storage upload & short-lived signed preview URL (`120s` TTL) helpers with `%PDF-` magic-byte and `<= 50MB` checks (`REQ-FR-101`)[cite: 2].
- [x] Implement `createDocumentAction`, `updateDocumentVersionAction`, `createRevisionAction`, `/upload`, `/preview-url`, and `/diff`.
- [x] Build structured Markdown editor (`REQ-FR-102`) with `rehype-sanitize` XSS protection, PDF uploader, `MarkdownDiffViewer` (`DEC-05`), `LifecycleStatusBadge`, and `Sha256DigestChip`[cite: 1, 2].
- [x] Pass `M3` tests: upload security, `< 1.5s` hash benchmark (11ms), preview URL TTL & anti-enumeration, DEC-05 diff accuracy & 422 enforcement, and authoring actions. Total project: 92/92 tests passing on live PostgreSQL.

### Phase 4 — Sequential Approval Engine & Atomic Invalidation (`M4`)
- [x] Implement `ApprovalService` with PostgreSQL `FOR UPDATE` row locks (`submitForApprovalAction`, `executeApprovalDecisionAction`, `recallApprovalAction`, `adminOverrideApproverAction`).
- [x] Enforce `BR-APP-01` separation of duties (`DEC-03`), `BR-SEQ-02` strict step ordering, `BR-SIG-01` password re-auth, and `BR-APP-02` atomic invalidation on mid-approval edit (`DEC-04`)[cite: 1, 2].
- [x] Build Approval Queue UI (`/approvals`), `SequentialStepper`, `SignOffReauthModal`, `InvalidationWarningModal`, `AdminOverrideModal`, `SubmitForApprovalModal`, and `RecallApprovalModal` (`.stitch-ref` Screen 5, `docs/DESIGN_SYSTEM.md`).
- [x] Wire post-commit transactional email notifications (`INotificationProvider`).
- [x] Pass `M4` backend tests: `AC-01`, `AC-02`, self-approval block, Admin override (`BR-APP-04`), and concurrent edit vs. sign-off race test (10/10 tests passed against live PostgreSQL).
- [x] Pass `M4` Part 2 tests: `GET /api/approvals/queue` integration tests (9/9), stepper & modal UI contracts (12/12), compliance copy guard (3/3), and zero typecheck/lint regressions. Total project: 116 tests passing.

### Phase 5 — Publishing, Mobile-First Reader PWA & Dashboards (`M5`)
- [x] Implement `publishDocumentVersionAction` (atomic superseding + assignment materialization), `retireDocumentVersionAction`, and `acknowledgeDocumentAction` (`BR-ACK-01`).
- [x] Do NOT implement a minor-edit bypass in Slice 1 (`BR-VER-03` bypass disabled; minor revisions require full approval). Record the minor-edit flag/justification as audit metadata only[cite: 2].
- [x] Build Mobile-First Reader PWA (`/to-read`, `/read/[documentId]`) with `ReaderAcknowledgmentBar` (`>= 90%` scroll & `>= 10s` dwell gate) and binding CTA (`REQ-FR-502`–`503`, `DEC-07`)[cite: 1, 2].
- [x] Build Quality Manager & Admin Completion Dashboard (`/dashboard`, `REQ-FR-504`)[cite: 2].
- [x] Pass `M5` tests: `AC-03`, single-published-version constraint (`BR-VER-01`), publishing workflow, read acknowledgment, engagement gate, governance dashboard KPIs, and Playwright mobile viewport (`375×812`) E2E flow (`e2e/reader-pwa.spec.ts`). Total project: 147 tests passing on live PostgreSQL.

### Phase 6 — Audit Packet Export, Security Hardening & Release QA (`M6`)
- [x] Build Audit Trail viewer (`/audit`, cursor-paginated) and streaming Audit Packet export (`/api/audit/export?format=json|pdf`, `UC-04`)[cite: 2].
- [x] Implement rate limiting (`docs/SECURITY.md` §8.2) and production HTTP security headers (`CSP`, `HSTS`, `X-Frame-Options`, `nosniff`).
- [x] Execute all 11 items in `docs/SECURITY.md` §9 Security Testing Checklist (Phase 6 Part 2 Final Release QA).
- [x] Run automated compliance copy guard (`e2e/compliance-copy-guard.spec.ts`) verifying zero prohibited claims (`DEC-02`, `DEC-08`)[cite: 1, 2].
- [x] Complete `M6` verification on live PostgreSQL + private Storage and verify all `AC-01`–`AC-05` gates.

---

## 4. Known Issues, Source Tensions & Technical Risks

| ID | Category | Description | Impact | Mitigation / Status |
| :--- | :--- | :--- | :---: | :--- |
| **KI-01** | Source Tension (`RESOLVED`) | Spec §7.1 (`REQ-FR-101`, `REQ-FR-103`) originally listed `.docx` + `.pdf` uploads and PDF/A rendering, while Spec §14 and §20 scope Slice 1 to **PDF uploads** and defer `.docx` comparison to Slice 2[cite: 2]. | High | **Resolved in this revision: Slice 1 is PDF-only.** `.docx` deferred to Slice 2. No sign-off outstanding. |
| **KI-02** | Governance Tension (`CONFIRMED`) | `DEC-03` strictly validates self-approval prevention, while Spec §9.1 (`BR-APP-01`) includes an optional "Single-Author Small-Org Override" flag[cite: 1, 2]. | Medium | Flag is `false` by default, restricted to `WORKSPACE_ADMIN`, and explicitly audited (`SELF_APPROVAL_OVERRIDE_USED`) if enabled. |
| **KI-03** | Technical Constraint (`PROPOSED`) | Better Auth does not use Supabase Auth's `auth.uid()`; PostgreSQL RLS depends entirely on `withTenantContext()` executing transaction-scoped `SET LOCAL` over Supavisor/PgBouncer. | Critical | Enforced via `app_user` (`NOBYPASSRLS`), fail-closed RLS (`NULLIF`), ESLint import boundaries, and mandatory `M1` pooler-isolation tests. |
| **KI-04** | Compliance Boundary (`PARTIALLY VALIDATED`) | Audit trail immutability (`DEC-08`) is protected at the application and `app_user` DB layer, but cloud/Supabase superusers remain outside application immutability[cite: 1, 2]. | Medium | Documented transparently in `docs/SECURITY.md` and Audit Packet footers; never claim "100% tamper-proof"[cite: 1, 2]. |
| **KI-05** | Performance Risk (`REQ-NFR-001`) | Hashing 20MB–50MB PDFs on Vercel serverless functions must stay `< 1.5s` for 20MB files and `< 5s` for 50MB files (REQ-NFR-001) without hitting memory limits[cite: 2]. | Medium | Use streaming Node.js `crypto.createHash('sha256')` during upload and verify with `M3` benchmark test. |

---

## 5. Decisions Requiring Confirmation Before / During Coding

| Item | Classification | Current Default in Docs | Required Action | Target Gate |
| :--- | :---: | :--- | :--- | :---: |
| **`.docx` Upload Support in Slice 1 (`KI-01`)** | `RESOLVED` | Slice 1 supports `.pdf` uploads only (per Spec §14); `.docx` upload & PDF/A conversion deferred to Slice 2[cite: 2]. | No action outstanding. | Resolved in this revision |
| **Minor Administrative Edit Bypass (`BR-VER-03`)** | `PARTIALLY VALIDATED` — **Decided for Slice 1: NO bypass** | Minor revisions (`v1.1`) require full sequential approval in Slice 1; flag/justification are audit metadata only[cite: 2]. | No confirmation outstanding for Slice 1. A future bypass decision is post-Slice-1 only. | Resolved in this revision |
| **Offline Native Mobile App (`DEC-07`)** | `UNRESOLVED` | Slice 1 ships responsive mobile-first PWA (online-only for security); native offline app deferred to Slice 3 evaluation[cite: 1, 2]. | Collect frontline shop-floor feedback after Slice 1 launch. | Post-Slice 1 (Slice 3) |
| **Third-Party PKI / Hardware Tokens** | `UNRESOLVED` | Better Auth password re-authentication (`ADR-05`, `CONFIRMED` by user for Slice 1). Hardware PKI deferred to Slice 3. | Confirmed for Slice 1 MVP sign-offs. | Confirmed (Phase 0) |
| **Reader Engagement Threshold (`REQ-FR-502`)** | `CONFIRMED` | `>= 90%` scroll depth (or all PDF pages viewed) AND `>= 10 seconds` dwell time (`ADR-08`, `CONFIRMED` by user). | Threshold values locked for Slice 1. | Confirmed (Phase 0) |
| **Transactional Email Provider** | `CONFIRMED` | Abstracted via `INotificationProvider` (`CONFIRMED` by user: Resend for prod/staging, console logger for dev/test). | Interface abstraction locked. | Confirmed (Phase 0) |

---

## 6. Post-M6 UX, Performance & Brand Polish (`25 Nov 2026`)

- [x] **Auth Entry, 5-Role Demo Login & Seed (`M6+`):** Added `/auth/sign-in` (`SignInForm`) with Email/Password + 5-role Demo Login (`POST /api/auth/demo-login`, sliding-window rate-limited `429 RATE_LIMIT_EXCEEDED`), role-based landing routing (`WORKSPACE_ADMIN` & `QUALITY_MANAGER` → `/dashboard`, `DOCUMENT_AUTHOR` → `/documents`, `APPROVER_REVIEWER` → `/approvals`, `READER` → `/to-read`), `drizzle/0003_user_workspaces_lookup.sql` (`veridoc.fn_get_user_workspaces`), and `pnpm db:seed` (`scripts/seed-demo.ts` with 5 personas & 6 SOPs across all lifecycle states).
- [x] **Navigation & DB Latency Optimization (`M6+`):** Added shared `src/app/(dashboard)/layout.tsx` + `loading.tsx`, enabled Better Auth `cookieCache` (`maxAge: 60`), consolidated workspace/dashboard queries into single-transaction parameterized loaders (`withTenantContext()` as `veridoc_app_user`), and eliminated redundant client mount API waterfalls on `/approvals` and `/audit`.
- [x] **Cobalt–Indigo–Sky Gradient System & Dark Mode (`M6+`):** Upgraded Light Mode to Refined Tinted Light (`#F4F7FB` canvas + `#1D4ED8 → #4F46E5 → #0284C7` gradients) and added full `.dark` theme tokens in `src/app/globals.css`, zero-FOUC initialization in `src/app/layout.tsx`, and `ThemeToggle` (`src/components/layout/theme-toggle.tsx`) with **Unified Circular Reveal** (`View Transitions API` + GSAP icon morph).
- [x] **DualCheck Brand Identity & PWA Icons (`M6+`):** Designed the **DualCheck** logo via `logo-design` skill, added `<VeriDocMark />` (`src/components/brand/veridoc-mark.tsx`) across sidebar, mobile header, landing, and sign-in, and installed `favicon.ico`, `favicon.svg`, `icon-192.png`, `icon-512.png`, `maskable-512.png`, and `public/brand/*` assets into `public/` & `public/manifest.json`.
- [x] **GSAP Motion System & `88px` Sidebar Minimize (`M6+`):** Installed `gsap@3.15.1`, added `<GsapStaggerGroup>`, `<GsapHoverCard>`, `<GsapHoverButton>` (`src/components/motion/gsap-motion.tsx`), upgraded `<Button>` & `<Input>` interactions (respecting `prefers-reduced-motion`, keeping `/read/*` & governance modals instant), and added GSAP-synchronized `240px ↔ 88px` Icon-Rail sidebar minimize in `AppShell` & `DesktopSidebar` across all 5 user roles.
- [x] **Build & Static Gate Verification (`25 Nov 2026`):** `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed with `0` errors and `0` warnings after the latest UI/motion changes (`20/20` static pages & all routes compiled).
