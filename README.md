# VeriDoc

Multi-tenant **Document & SOP Approval Workspace** built for controlled authoring, sequential review workflows, cryptographic version integrity (`SHA-256`), and frontline read acknowledgments (Slice 1 — Core Lifecycle MVP).

---

## Core Implemented Features (Slice 1)

- **Controlled Authoring & Private PDF Storage**
  - Structured Markdown SOP editor (`react-markdown` + `rehype-sanitize`) and PDF document uploads (`<= 50 MB`, server-side `%PDF-` magic-byte verification).
  - Files `> 4 MB` upload directly to private Supabase Storage via short-lived signed upload URLs and stream-verified server finalization; `<= 4 MB` use multipart upload through the API route.
  - Private bucket downloads via `120s` TTL signed URLs issued after live membership and lifecycle visibility checks (`READER` is restricted to `PUBLISHED` versions; PWA Service Worker excludes PDFs and signed URLs).
- **Textual Revision Diffing (`DEC-05`)**
  - Line-by-line Markdown diff endpoint and viewer between document revisions (binary PDF / `.docx` visual diffing is explicitly deferred to Slice 2).
- **Sequential Approval Workflows & Governance Controls**
  - Multi-stage sequential review chains (`1..10` ordered steps), enforcing `BR-SEQ-01` / `BR-SEQ-02` step ordering and `BR-APP-01` separation of duties (`DEC-03`: authors cannot approve their own versions unless explicit tenant override is enabled).
  - Better Auth password re-authentication required on sign-off, capturing actor identity, role, IP address, UTC timestamp, `SHA-256` digest, and decision intent.
  - **Atomic Mid-Approval Invalidation (`DEC-04`):** editing content or replacing a PDF while `PENDING_APPROVAL` atomically invalidates active approvals, increments the minor revision, returns state to `DRAFT`, and logs `APPROVAL_INVALIDATED_BY_EDIT`.
  - **Workspace Admin Override (`BR-APP-04`):** reassigns stalled or deactivated approvers with recorded justification.
- **Hash-Chained Audit Trail (`DEC-08`) & Audit Packet Export**
  - Append-only `veridoc.audit_logs` serialized per tenant via `pg_advisory_xact_lock`, chained via `prev_hash -> entry_hash`, verified via paginated verification endpoint, and exportable as JSON or PDF packets.
- **Frontline Reader Queue & Completion Dashboard**
  - Target audience group assignment on publication (atomically superseding prior `PUBLISHED` versions), scroll (`>= 90%`) + dwell (`>= 10s`) engagement gate, digest-bound read acknowledgments, and governance KPI dashboards.
- **Multi-Tenant Isolation & Rate Limiting**
  - PostgreSQL Row-Level Security (`FORCE ROW LEVEL SECURITY`) with runtime queries scoped through `withTenantContext()` (`SET LOCAL app.current_tenant_id`) connecting as `veridoc_app_user` (`NOBYPASSRLS`).
  - `UNLOGGED` PostgreSQL distributed sliding-window rate limiter (`veridoc.rate_limits`) protecting demo login, audit exports, and PDF uploads.

---

## Governance & Scope Boundaries

- **Slice Boundaries:** Implements Slice 1 only. Parallel/quorum approvals, delegation, automated overdue escalations, `.docx` diffing, SAML/SCIM, webhooks, and native offline apps are out of scope (see [`docs/DECISIONS.md`](docs/DECISIONS.md)).
- **Compliance Positioning:** Designed to support ISO 9001, ISO 27001, SOC 2 Type II, and GMP operational workflows. VeriDoc does **not** claim out-of-the-box FDA 21 CFR Part 11 certification (`DEC-02`) or universal tamper-proofness (`DEC-08`).

---

## Technology Stack

- **Framework & UI:** Next.js `15.1.12` (App Router), React `19`, TypeScript (`strict`), Tailwind CSS `3.4`, Lucide icons, GSAP
- **Database & ORM:** PostgreSQL (Supabase), Drizzle ORM (`0.39`), SQL migrations (`drizzle/0000`–`0004`)
- **Authentication & Validation:** Better Auth (`1.1`), Zod (`3.24`), TanStack Query (`5`)
- **Storage & Notifications:** Supabase Storage (private bucket), Resend API (with console fallback in local dev)
- **Testing & CI:** Vitest (`tests/unit`, `tests/integration`), Playwright (`e2e/`), GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)), Vercel ([`vercel.json`](vercel.json))

---

## Architecture & Documentation

VeriDoc enforces a strict 5-layer boundary (`src/app` + `src/components` → `src/server/actions` + `src/app/api` → `src/server/policies` → `src/server/services` → `src/db` + `src/lib`). See the repository docs for full specifications:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 5-layer architecture, RLS context wrapper, and request flows
- [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) — Schema (`veridoc`), composite foreign keys, partial unique indexes, and immutability triggers
- [`docs/BUSINESS_LOGIC.md`](docs/BUSINESS_LOGIC.md) — Domain invariants (`DEC-01`–`DEC-08`, `BR-*`)
- [`docs/SECURITY.md`](docs/SECURITY.md) — Threat model, `NOBYPASSRLS`, upload validation, and sanitization controls
- [`docs/API_SPECIFICATION.md`](docs/API_SPECIFICATION.md) — Server Actions & REST Route Handler contracts
- [`docs/TESTING_STRATEGY.md`](docs/TESTING_STRATEGY.md) — Unit, live-PostgreSQL integration, and Playwright E2E strategy
- [`docs/PROGRESS_TRACKER.md`](docs/PROGRESS_TRACKER.md) — Slice 1 milestone status (`M0`–`M6`) and post-M6 updates

### Repository Layout

```text
├── src/
│   ├── app/              # Next.js App Router pages, layouts, and /api/* Route Handlers
│   ├── components/       # UI primitives, brand/motion components, and domain feature islands
│   ├── server/
│   │   ├── actions/      # Thin Server Actions (auth -> Zod -> policy -> service)
│   │   ├── policies/     # Read-only RBAC and separation-of-duties guards
│   │   ├── services/     # Transactional domain logic, locking, and audit appends
│   │   └── security/     # PostgreSQL distributed sliding-window rate limiter
│   ├── db/               # Drizzle client, withTenantContext() RLS wrapper, and schema/*
│   ├── lib/              # Auth, streaming SHA-256 crypto, private Storage, and logger
│   └── types/            # Shared domain DTOs, role/state unions, and error codes
├── drizzle/              # SQL schema migrations, RLS policies, triggers, and rate-limit DDL
├── tests/                # Vitest unit (tests/unit) and live-PostgreSQL integration suites
├── e2e/                  # Playwright E2E and mobile PWA acceptance specs
├── scripts/              # Demo workspace seeding script (seed-demo.ts)
└── docs/                 # Engineering specifications and decision log
```

---

## Local Development

### Prerequisites

- Node.js `20+`
- `pnpm` (`9+`)
- PostgreSQL `15+` (or Supabase project with a `veridoc_app_user` `NOBYPASSRLS` role) and a private Supabase Storage bucket

### Setup

1. **Install dependencies:**

   ```bash
   pnpm install --frozen-lockfile
   ```

2. **Configure environment variables:**

   Copy `.env.example` to `.env.local` and populate your database, auth secret, Supabase Storage, and audit salt values:

   ```bash
   cp .env.example .env.local
   ```

   See [`.env.example`](.env.example) for required and optional variables (`DATABASE_URL`, `DIRECT_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `AUDIT_HASH_SALT`, `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, `DB_POOL_MAX`, `ENABLE_DEMO_LOGIN`).

3. **Run migrations & optional demo seed:**

   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

4. **Start the development server:**

   ```bash
   pnpm dev
   ```

   Open `http://localhost:3000`. In non-production mode (or when `ENABLE_DEMO_LOGIN="true"`), `/auth/sign-in` provides quick-login buttons for all 5 workspace roles (`WORKSPACE_ADMIN`, `QUALITY_MANAGER`, `DOCUMENT_AUTHOR`, `APPROVER_REVIEWER`, `READER`).

---

## Verification Scripts

| Command | Purpose |
|---|---|
| `pnpm typecheck` | Run TypeScript compiler (`tsc --noEmit`) |
| `pnpm lint` | Run ESLint (`next lint`) |
| `pnpm build` | Build production Next.js bundle |
| `pnpm test` | Run all Vitest suites (`tests/unit` and `tests/integration`) |
| `pnpm test:unit` | Run unit & UI contract tests (`vitest run tests/unit`) |
| `pnpm test:integration` | Run live-PostgreSQL & Storage integration suite (`vitest run tests/integration`) |
| `pnpm test:e2e` | Run Playwright E2E suite against the local app (`playwright test`) |

---

## CI/CD & Deployment

- **GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):**
  - `verify` runs `typecheck`, `lint`, `test:unit`, and `build` on every push and pull request.
  - `integration` provisions a PostgreSQL 15 service with a `NOBYPASSRLS` `veridoc_app_user` role, runs `pnpm db:migrate`, and executes `pnpm test:integration`.
  - `e2e` runs Playwright specs on pull requests targeting `main`.
  - `deploy-gate` runs on pushes to `main` (`environment: production`), requires `DIRECT_DATABASE_URL` in GitHub Actions `production` secrets for pre-deploy migrations, and deploys to Vercel when `VERCEL_TOKEN` (`VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) is configured.
- **Vercel ([`vercel.json`](vercel.json)):** Configures `pnpm build` and `60s` function `maxDuration` for PDF upload and audit export routes.

---

## License

Licensed under the [MIT License](LICENSE).
