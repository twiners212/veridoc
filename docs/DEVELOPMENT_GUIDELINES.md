# VeriDoc — Development Guidelines & Engineering Standards

> **App name:** VeriDoc — Document & SOP Approval Workspace. “VeriDoc” is the canonical product name throughout this package.

> **Status:** Slice 1 (Core Lifecycle MVP) — Engineering Standards Baseline  
> **Stack:** Next.js (App Router) + TypeScript + Drizzle ORM + Supabase PostgreSQL + Better Auth + Tailwind CSS + shadcn/ui + Zod + TanStack Query (`PROPOSED` Stack Baseline)  
> **Related Docs:** `README.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `docs/API_SPECIFICATION.md`, `docs/SECURITY.md`, `docs/TESTING_STRATEGY.md`, `AGENTS.md`

---

## 1. Coding Standards (`PROPOSED`)

1. **Documentation-First Execution:** Every feature, schema change, or API mutation MUST conform to the approved specifications in `docs/`. Never invent undocumented business rules or silently expand Slice 1 scope into Slice 2 or Slice 3 capabilities[cite: 2].
2. **Explicit Over Clever:** Prefer clear, linear, readable TypeScript over deep inheritance, generic meta-abstractions, or premature design patterns.
3. **Single Source of Truth for Invariants:** Business rules (separation of duties `DEC-03`, atomic invalidation `DEC-04`, `SHA-256` binding `DEC-06`, append-only audit chaining `DEC-08`)[cite: 1, 2] MUST live in `src/server/services/` and PostgreSQL constraints—never duplicated in React components.
4. **Deterministic & Pure Helpers:** Keep cryptographic hashing (`src/lib/crypto/`), semantic versioning, and Markdown diffing (`DEC-05`)[cite: 1, 2] as pure, side-effect-free functions for straightforward unit testing.
5. **Compliance Copy Hygiene:** Never introduce UI strings, code comments, or export metadata claiming out-of-the-box FDA 21 CFR Part 11 certification (`DEC-02`) or "100% tamper-proof" audit logs (`DEC-08`)[cite: 1, 2].

---

## 2. Naming Conventions (`PROPOSED`)

| Artifact | Convention | Examples |
| :--- | :--- | :--- |
| **Directories & Non-Component Files** | `kebab-case` | `approval-cycles.ts`, `audit.service.ts`, `document-policy.ts` |
| **React Component Files** | `kebab-case.tsx` | `lifecycle-status-badge.tsx`, `sign-off-reauth-modal.tsx` |
| **React Component Symbols** | `PascalCase` | `LifecycleStatusBadge`, `SignOffReauthModal` |
| **Server Actions** | `camelCase` ending in `Action` | `submitForApprovalAction`, `executeApprovalDecisionAction` |
| **Domain Services** | `camelCase` object/functions in `*.service.ts` | `approvalService.executeDecision()`, `auditService.append()` |
| **Policy Guards** | `camelCase` starting with `assert` or `can` in `*.policy.ts` | `assertCanPublish()`, `assertSeparationOfDuties()` |
| **Zod Schemas** | `camelCase` ending in `Schema` | `createDocumentSchema`, `executeApprovalDecisionSchema` |
| **Types & Interfaces** | `PascalCase` (avoid `I`-prefix except external adapter ports) | `DocumentLifecycleState`, `ActionResult<T>`, `INotificationProvider` |
| **PostgreSQL Tables & Columns** | `snake_case` (plural tables) | `document_versions`, `approval_steps`, `document_sha256` |
| **PostgreSQL Enums & Audit Events** | `SCREAMING_SNAKE_CASE` | `PENDING_APPROVAL`, `APPROVAL_INVALIDATED_BY_EDIT`[cite: 2] |
| **Domain Error Codes** | `SCREAMING_SNAKE_CASE` | `SELF_APPROVAL_PROHIBITED`, `INTEGRITY_HASH_MISMATCH` |
| **Environment Variables** | `SCREAMING_SNAKE_CASE` (`NEXT_PUBLIC_` strictly for public values) | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` |

---

## 3. Folder Organization & Import Boundaries (`PROPOSED`)

### 3.1 Authoritative Directory Layout
Aligns strictly with `README.md` §5 and `docs/ARCHITECTURE.md` §2:

* `src/app/` — Next.js App Router pages, layouts, and `/api/*` Route Handlers. Keep route files thin; delegate logic to `src/server/`.
* `src/components/ui/` — Unmodified or lightly themed shadcn/ui primitives. Do not embed domain logic here.
* `src/components/features/<domain>/` — Domain UI components (`documents/`, `approvals/`, `acknowledgments/`, `audit/`, `settings/`).
* `src/server/actions/` — Next.js Server Actions (`"use server"`). Entry layer only: session → Zod → policy → service → `ActionResult<T>`.
* `src/server/policies/` — Authoritative RBAC, tenant membership, and resource visibility guards.
* `src/server/services/` — Core transactional domain logic (lifecycle, approvals, publishing, acknowledgments, audit).
* `src/db/` — Drizzle client (`index.ts`), `withTenantContext()` transaction wrapper, and modular schema files (`schema/*.ts`).
* `src/lib/` — Shared infrastructure utilities (`auth/`, `crypto/`, `storage/`, `validators/`, `notifications/`).
* `src/types/` — Shared domain DTOs and `DomainErrorCode` unions.
* `tests/` — Mirrors test pyramid (`unit/`, `integration/`, `e2e/`).

### 3.2 Strict Layer Import Rules
Enforced via `import 'server-only'` and ESLint `no-restricted-imports`:
* `src/components/**` and Client Components MUST **NEVER** import from `src/db/**`, `src/server/services/**`, `src/server/policies/**`, `src/lib/storage/**`, or `src/lib/crypto/**`.
* `src/server/actions/**` and `src/app/api/**` MUST call `src/server/policies/**` and `src/server/services/**`—NEVER run direct Drizzle queries in route or action handlers.
* `src/server/policies/**` MUST be read-only (no `INSERT`/`UPDATE`/`DELETE`).
* `src/lib/validators/**` MUST remain dependency-free of server modules so Zod schemas can be safely shared for client UX validation and server authoritative validation.

---

## 4. TypeScript Conventions (`PROPOSED`)

* **Compiler Strictness (`tsconfig.json`):** Enable `"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitReturns": true`, and `"exactOptionalPropertyTypes": true`.
* **Zero `any` Policy:** Never use `any`. Use `unknown` at untrusted boundaries (request bodies, JSON payloads, caught errors) and narrow via Zod schemas or type guards.
* **Zod-First Types:** Derive input DTO types via `z.infer<typeof mySchema>` rather than hand-maintaining duplicate interfaces.
* **Exhaustive Union Handling:** Use `switch` statements with a `never` exhaustiveness check when handling `document_lifecycle_state`, `workspace_role`, or `approval_step_status` enums.
* **Explicit Return Types on Public Server Boundaries:** All exported functions in `src/server/actions/`, `src/server/services/`, and `src/server/policies/` MUST declare explicit return types.
* **UTC Timestamps Only:** Persist and serialize all dates as ISO-8601 UTC (`timestamptz` in PostgreSQL); perform local timezone formatting strictly in the presentation layer.

---

## 5. Error Handling Standards (`PROPOSED`)

### 5.1 Structured Domain Errors
* Define a central `DomainError` class carrying `code: DomainErrorCode`, `httpStatus: number`, safe client `message: string`, and optional `fieldErrors` (matching `docs/API_SPECIFICATION.md` §7).
* Services and policies throw typed `DomainError` instances; entry layers (`src/server/actions/` and `src/app/api/`) catch `DomainError` and map it cleanly to `ActionResult<T>` or JSON `{ error: ... }` responses.

### 5.2 Security & Privacy Rules for Errors
* **Never Leak Internals:** Unexpected exceptions (PostgreSQL constraint errors, network timeouts, stack traces) MUST be logged server-side with a unique `correlationId` and returned to the client as `500 INTERNAL_SERVER_ERROR` with a generic message.
* **Anti-Enumeration:** Cross-tenant resource lookups MUST return `404 NOT_FOUND`, never `403 FORBIDDEN`, to avoid confirming resource existence across tenants (`docs/SECURITY.md`).
* **Mandatory Log Scrubbing:** NEVER log `reauthPassword`, Better Auth session tokens, `BETTER_AUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, or signed storage URLs.

---

## 6. Database Access & Transaction Rules (`PROPOSED`)

1. **Mandatory Tenant Wrapper:** Every tenant-scoped database operation MUST execute inside `withTenantContext(session, async (tx) => ...)`, which opens a transaction and executes only `SET LOCAL app.current_tenant_id` via `set_config(..., true)` (`docs/ARCHITECTURE.md` §6). It does NOT set `app.current_user_id` and does NOT use `SET LOCAL ROLE`.
2. **Pooler Safety:** Always use transaction-scoped `SET LOCAL` (`set_config(..., true)`), NEVER session-scoped `SET`, to prevent tenant leakage across Supavisor/PgBouncer pooled connections.
3. **Explicit Tenant Predicates:** Even with forced PostgreSQL RLS, always include `.where(eq(table.tenantId, ctx.tenantId))` in Drizzle queries for defense-in-depth and optimal index usage.
4. **Concurrency Locking:** All lifecycle state transitions, sign-offs, mid-approval invalidations (`DEC-04`)[cite: 1, 2], and publications MUST lock target rows using `SELECT ... FOR UPDATE` and validate `expectedRowVersion`.
5. **Audit Serialization (`DEC-08`):** Audit log appends MUST execute inside the **same** PostgreSQL transaction as the domain mutation and acquire `pg_advisory_xact_lock(hashtext(tenant_id::text))` so rolled-back mutations never leave orphan audit rows and concurrent writes never fork the hash chain[cite: 1, 2].
6. **Zero Raw SQL Interpolation:** Use Drizzle query builders exclusively. Where raw `sql` tags are required (e.g., `set_config`, `pg_advisory_xact_lock`), use parameterized bindings only—never string concatenation.
7. **Post-Commit Side Effects:** Dispatch transactional emails (`INotificationProvider`) only **after** the PostgreSQL transaction commits.
8. **Migration Discipline:** Generate all schema changes via `pnpm db:generate`, place RLS/trigger SQL in versioned `drizzle/` migrations, and NEVER modify already-applied migration files.

---

## 7. Server & Client Component Conventions (`PROPOSED`)

* **RSC by Default:** Every page and layout under `src/app/` is a React Server Component unless interactive browser state is explicitly required.
* **Narrow `"use client"` Islands:** Push `"use client"` down to leaf interactive components (e.g., Markdown editor, PDF viewer scroll tracker, `SignOffReauthModal`, filter bars) to keep client JS bundles lean—especially for the mobile Reader PWA (`DEC-07`)[cite: 1, 2].
* **Server-Only Guard:** Place `import 'server-only';` at the top of `src/db/index.ts`, all `src/server/**` files, `src/lib/storage/**`, and `src/lib/auth/server.ts`.
* **TanStack Query Scope:** Use TanStack Query strictly for interactive, paginated, or frequently refreshed client views (Approval Queue, Completion Dashboard, Mobile Reader Queue, Audit Log Viewer). After a Server Action succeeds, explicitly invalidate relevant TanStack Query keys (`queryClient.invalidateQueries`) alongside `revalidatePath`.
* **Transport Selection:**
  * Use **Server Actions** for JSON workspace mutations (`create`, `update`, `submit`, `sign-off`, `publish`, `acknowledge`, `admin override`).
  * Use **Route Handlers** (`/api/*`) for Better Auth, multipart PDF uploads, signed preview URL issuance, streaming Audit Packet exports, and TanStack Query `GET` endpoints.

---

## 8. Git Workflow & Code Review Standards (`PROPOSED`)

### 8.1 Branching & Commits
* **Default Branch:** `main` is always deployable and protected by CI gates (`docs/TESTING_STRATEGY.md` §9.2).
* **Branch Naming:** `<type>/<slice-or-phase>-<short-description>` (e.g., `feat/p4-atomic-approval-invalidation`, `fix/p1-rls-pooler-context`).
* **Conventional Commits:**
  * `feat:` — New Slice 1 capability
  * `fix:` — Bug fix (must include regression test for governance/security fixes)
  * `docs:` — Documentation updates
  * `test:` — Unit, integration, DB, or E2E tests
  * `refactor:` — Internal code improvement with zero behavior change
  * `chore:` — Tooling, migrations, CI configuration

### 8.2 Pull Request Checklist (Mandatory Before Merge)
- [ ] Scope stays strictly within **Slice 1: Core Lifecycle MVP** (no unapproved Slice 2/3 features)[cite: 2].
- [ ] All new/modified tenant queries execute inside `withTenantContext()` with explicit `tenant_id` predicates.
- [ ] Server-side Zod validation and `src/server/policies/` RBAC checks are present on every new Action/Route Handler.
- [ ] Critical invariants (`DEC-03`, `DEC-04`, `DEC-06`, `DEC-08`) have automated integration/DB tests[cite: 1, 2].
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, and `pnpm test:integration` pass in CI.

---

## 9. Dependency Management Policy (`PROPOSED`)

* **Package Manager:** Exclusively `pnpm` with committed `pnpm-lock.yaml` (`pnpm install --frozen-lockfile` in CI).
* **Minimal Dependencies Rule:** Do **NOT** introduce redundant libraries, heavy QMS/workflow engines, or client-side state managers (e.g., Redux, MobX) when React Server Components, Server Actions, and TanStack Query suffice.
* **Approved Core Slice 1 Dependencies:**
  * Framework & UI: `next`, `react`, `react-dom`, `tailwindcss`, Radix UI / `shadcn/ui`, `lucide-react`.
  * Data & Auth: `drizzle-orm`, `drizzle-kit`, `postgres` (or `pg`), `better-auth`, `@tanstack/react-query`, `zod`, `@supabase/supabase-js` (Storage signed URLs only).
  * Domain Utilities: `react-markdown`, `rehype-sanitize`, lightweight textual diff library (e.g., `diff`) for `DEC-05`[cite: 1, 2], `server-only`, and a lightweight PDF viewer/export utility.
  * Testing: `vitest`, `@playwright/test`.
* **Adding New Packages:** Any dependency outside this list must be documented with rationale and trade-offs before installation, audited via `pnpm audit`, and verified for Vercel serverless compatibility.
