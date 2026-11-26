# VeriDoc

> **Status:** Slice 1 (Core Lifecycle MVP) — Engineering Baseline  
> **Source Authority:** Product Specification v3.0 (`CONFIRMED`) & Product Decision & Validation Log v3.0 (`CONFIRMED`)
> **App name:** VeriDoc. The product name is **VeriDoc** throughout this package; “Document & SOP Approval Workspace” is its descriptive subtitle, not a separate product name.
> **Package layout note:** In the repository the engineering docs live under `docs/` as shown in §5. This audit package was delivered flat (all `.md` files in one folder); `docs/PRODUCT_REQUIREMENTS.md` in the text means the file `PRODUCT_REQUIREMENTS.md` in the flat package.

## 1. Product Overview

The **VeriDoc** is a multi-tenant cloud governance platform for authoring, reviewing, approving, publishing, and tracking read acknowledgments of Standard Operating Procedures (SOPs) and controlled operational documents.

It bridges the gap between unstructured file storage (Google Drive, SharePoint) and heavyweight enterprise Quality Management Systems (MasterControl, Veeva Vault) for mid-market operating companies (50–1,000 employees) in manufacturing, logistics, healthcare operations, biotech services, specialty food/beverage, and compliance-conscious technology sectors.

### Key Operational Problems Solved (`CONFIRMED`)
* Prevents employees from executing outdated SOP versions.
* Provides structured, hash-verified approval evidence and read-acknowledgment logs for external audits.
* Eliminates unvetted mid-approval edits through automatic approval invalidation (`DEC-04`).
* Avoids prohibitive per-user seat fees for frontline operational readers via a Hybrid Creator Seat + Operational Reader Pack pricing model (`DEC-01`).

---

## 2. Product Positioning & Compliance Boundaries

### What It Is (`CONFIRMED`)
* A streamlined, mid-market SOP governance workspace focused on deterministic lifecycle control, sequential approval gating, cryptographic version integrity (`SHA-256`), and scalable frontline read acknowledgments.

### What It Is NOT (`CONFIRMED`)
* Not a full enterprise QMS, a generic collaborative document editor, or a contract e-signature suite (e.g., DocuSign/Adobe Sign).

### Compliance & Immutability Boundaries (`CONFIRMED`)
* **Supported Alignment:** Assists organizations with document control workflows supporting **ISO 9001**, **ISO 27001**, **SOC 2 Type II**, and **GMP** operational guidelines[cite: 2].
* **FDA 21 CFR Part 11 (`DEC-02` — `DISPROVEN`):** The MVP does **not** claim out-of-the-box FDA 21 CFR Part 11 compliance. Full Part 11 validation requires customer-specific IQ/OQ/PQ protocols, operational controls, and deferred Slice 3 capabilities.
* **eIDAS QES:** Does not provide legally binding Qualified Electronic Signatures (QES) under eIDAS without third-party integration[cite: 2].
* **Audit Trail Immutability (`DEC-08` — `PARTIALLY VALIDATED`):** Audit records are protected via append-only database models and application-level cryptographic hash chaining, subject to underlying cloud infrastructure and database administrator security boundaries[cite: 1, 2]. The platform is never marketed as universally or absolutely tamper-proof[cite: 1].

---

## 3. Core Features (Scope & Slicing)

Implementation strictly targets **Slice 1: Core Lifecycle MVP**[cite: 2]. Future-slice features must not be introduced as MVP dependencies.

### Slice 1 — Core Lifecycle MVP (`CONFIRMED` Active Scope)
* **Document Authoring & Uploads:** Integrated structured Markdown/Rich-Text web editor and PDF document uploads[cite: 2]. *(Decided — T-01 RESOLVED: Slice 1 is PDF-only. `.docx` upload/conversion is deferred to Slice 2; see `docs/DECISIONS.md` §3.)*
* **Textual Diffing (`DEC-05` — `PARTIALLY VALIDATED`):** Textual Markdown diffing for native document revisions[cite: 1, 2].
* **Sequential Approvals:** Structured multi-stage sequential approval workflows[cite: 2].
* **Separation of Duties (`DEC-03` — `VALIDATED`):** Enforces self-approval prevention so authors cannot approve their own submitted SOPs under standard policy[cite: 1, 2].
* **Atomic Approval Invalidation (`DEC-04` — `VALIDATED`):** Editing a document in `Pending Approval` immediately resets its state to `Draft` and invalidates prior approvals in that cycle[cite: 1, 2].
* **Cryptographic Payload Binding (`DEC-06` — `PRODUCT DECISION`):** Generates `SHA-256` digests upon submission and binds approval and acknowledgment records to the exact digest[cite: 1, 2].
* **Append-Only Audit Trail (`DEC-08` — `PARTIALLY VALIDATED`):** Cryptographically hash-chained, append-only audit logging for lifecycle transitions, sign-offs, invalidations, and acknowledgments[cite: 1, 2].
* **Read Acknowledgment & Dashboards:** Target group assignment, binding reader acknowledgment tracking, and completion dashboards[cite: 2].
* **Responsive PWA Experience (`DEC-07` — PWA `CONFIRMED` in Slice 1; native offline apps `UNRESOLVED`):** Mobile-first responsive Progressive Web App for frontline readers[cite: 1, 2].

### Slice 2 — Future Scope (`CONFIRMED` Deferred)
* Parallel and quorum approvals (e.g., "Any 2 of 3 Quality Managers")[cite: 2].
* Approver delegation rules and automated overdue escalation (48h reminder / 96h escalation)[cite: 2].
* Visual side-by-side comparison for uploaded `.docx` and cross-format revisions (`DEC-05`)[cite: 1, 2].

### Slice 3 — Future Scope (`CONFIRMED` Deferred)
* SAML 2.0 SSO and SCIM provisioning[cite: 2].
* Webhook event subscriptions and Enterprise REST API[cite: 2].
* Enhanced FDA 21 CFR Part 11 validation package and PKI hardware certificate integration (`DEC-02`)[cite: 1, 2].
* Offline-capable native mobile apps, pending shop-floor operational feedback (`DEC-07`)[cite: 1, 2].

---

## 4. Technology Stack (`PROPOSED` Baseline)

| Layer | Selection | Rationale | Alternatives Considered | Trade-offs & Integration Constraints |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend & Backend Framework** | **Next.js (App Router) + TypeScript** | Unified full-stack React framework with Server Components, Server Actions, and Route Handlers; strong type safety across client/server boundaries. | Remix, SvelteKit, Separate Express/NestJS API | Requires strict discipline to keep server-only secrets, DB queries, and authorization checks out of Client Components. |
| **Database** | **Supabase PostgreSQL** | Managed PostgreSQL supporting ACID transactions, Row-Level Security (RLS), `CHECK` constraints, and native tenant isolation[cite: 2]. | Neon, AWS RDS, PlanetScale | Must configure connection pooling (Supavisor/PgBouncer) properly for serverless Vercel functions; RLS policies must align with Better Auth session context. |
| **ORM** | **Drizzle ORM** | Lightweight, SQL-first TypeScript ORM with zero-runtime-overhead query building, explicit transaction control, and straightforward migrations. | Prisma, Kysely | Less abstracted than Prisma; requires explicit relational queries and careful transaction handling for RLS `SET LOCAL` context. |
| **Authentication** | **Better Auth** | Modern TypeScript-native authentication supporting sessions, password re-authentication for sign-offs, organizations/tenants, and future SSO/MFA. | Supabase Auth, Auth.js (NextAuth), Clerk | Because auth is managed outside Supabase Auth, PostgreSQL RLS cannot rely on Supabase's default `auth.uid()`; requires explicit per-transaction session variables (`app.current_tenant_id`). |
| **Client Data Fetching** | **TanStack Query** | Robust caching, optimistic UI control, pagination, and background revalidation for interactive dashboards and approval queues. | SWR, React Server Components only | Use selectively for client-interactive views; prefer Server Components for initial reads and Server Actions / Route Handlers for mutations. |
| **UI & Styling** | **Tailwind CSS + shadcn/ui** | Composable, accessible Radix-based primitives with full code ownership and consistent design tokens for desktop admins and mobile PWA readers. | MUI, Chakra UI, Mantine | Components live in-repo; requires consistent token governance in `docs/DESIGN_SYSTEM.md`. |
| **Validation** | **Zod** | Schema-first runtime validation with inferred TypeScript types shared across API boundaries, Server Actions, and forms. | Valibot, Yup, ArkType | Client-side Zod validation is UX-only; server-side validation is mandatory on every boundary. |
| **Document Storage** | **Supabase Storage** | S3-compatible encrypted object storage (AES-256) integrated with Supabase for PDF uploads and immutable version snapshots[cite: 2]. | AWS S3, Cloudflare R2 | Must use private buckets with short-lived signed URLs issued only after server-side tenant & RBAC checks. |
| **Deployment & VCS** | **Vercel + Git / GitHub** | Seamless Next.js CI/CD, preview deployments, and edge/serverless execution. | Fly.io, Railway, AWS ECS | Serverless function execution limits apply; PDF hashing and rendering must remain well within timeout budgets (target `< 1.5s` for standard files up to 20MB[cite: 2]). |

---

## 5. Project Structure (`PROPOSED`)

```text
.
├── docs/                           # Engineering & product documentation suite
│   ├── PRODUCT_REQUIREMENTS.md
│   ├── BUSINESS_LOGIC.md
│   ├── USER_FLOWS.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE_SCHEMA.md
│   ├── API_SPECIFICATION.md
│   ├── SECURITY.md
│   ├── DESIGN_SYSTEM.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── TESTING_STRATEGY.md
│   ├── DEVELOPMENT_GUIDELINES.md
│   ├── PROGRESS_TRACKER.md
│   └── DECISIONS.md
├── drizzle/                        # Generated SQL migrations & Drizzle metadata
├── public/                         # Static assets, PWA manifest, icons
├── src/
│   ├── app/                        # Next.js App Router (routes, layouts, API handlers)
│   │   ├── (auth)/                 # Sign-in, sign-up, re-authentication routes
│   │   ├── (workspace)/            # Tenant-scoped authenticated workspace UI
│   │   │   ├── dashboard/          # Completion & approval dashboards
│   │   │   ├── documents/          # SOP authoring, versioning, diffs, viewer
│   │   │   ├── approvals/          # Approver review & sign-off queue
│   │   │   ├── acknowledgments/    # Mobile-first Reader acknowledgment queue
│   │   │   ├── audit/              # Audit log viewer & evidence exports
│   │   │   └── settings/           # Workspace & RBAC administration
│   │   └── api/                    # Route Handlers (Better Auth, uploads, exports)
│   ├── components/
│   │   ├── ui/                     # shadcn/ui primitives
│   │   └── features/               # Domain-specific UI components
│   ├── db/
│   │   ├── index.ts                # Drizzle client & transaction/RLS helpers
│   │   └── schema/                 # Modular PostgreSQL table definitions
│   ├── lib/
│   │   ├── auth/                   # Better Auth server & client configuration
│   │   ├── crypto/                 # SHA-256 payload hashing & audit hash chaining
│   │   ├── storage/                # Supabase Storage private bucket helpers
│   │   └── validators/             # Shared Zod schemas
│   ├── server/
│   │   ├── actions/                # Next.js Server Actions (thin validation + auth)
│   │   ├── services/               # Core domain logic (lifecycle, approvals, audit)
│   │   └── policies/               # Server-side RBAC & tenant authorization guards
│   └── types/                      # Shared TypeScript domain types
├── tests/
│   ├── unit/                       # Pure business logic, hashing, state transitions
│   ├── integration/                # DB transactions, RLS isolation, API handlers
│   └── e2e/                        # Playwright workflow & RBAC tests
├── AGENTS.md                       # Global AI coding agent rules for Antigravity
├── VALIDATION_REPORT.md            # Cross-document verification & readiness report
├── drizzle.config.ts
├── next.config.ts
├── package.json
└── README.md
6. Local Development Setup (PROPOSED)PrerequisitesNode.js: v20.x LTS or newerPackage Manager: pnpm v9.x+Database & Storage: A Supabase project (cloud or local via Supabase CLI + Docker)Git: Configured for GitHub workflowSetup StepsClone the repository:Bashgit clone <repository-url>
cd veridoc
Install dependencies:Bashpnpm install
Configure environment variables:Bashcp .env.example .env.local
Populate the required variables listed in Section 7.Apply database migrations:Bashpnpm db:migrate
Seed local development data (optional):Bashpnpm db:seed
Start the development server:Bashpnpm dev
The application will be available at http://localhost:3000.Standard Scripts (PROPOSED)pnpm dev — Run Next.js development server.pnpm build — Production build check.pnpm lint — ESLint and formatting checks.pnpm typecheck — Strict TypeScript verification (tsc --noEmit).pnpm test — Run unit and integration test suites.pnpm test:e2e — Run Playwright end-to-end tests.pnpm db:generate — Generate Drizzle SQL migrations from schema changes.pnpm db:migrate — Apply pending migrations to PostgreSQL.7. Environment Variables Overview (PROPOSED)Never commit .env.local or secrets to version control. Server-only secrets must never use the NEXT_PUBLIC_ prefix.VariableScopeDescriptionDATABASE_URLServerPooled PostgreSQL connection string (Supabase transaction/session pooler) for runtime queries.DIRECT_DATABASE_URLServerDirect PostgreSQL connection string used strictly for Drizzle migrations.BETTER_AUTH_SECRETServerHigh-entropy secret (min 32 bytes) for signing Better Auth sessions and tokens.BETTER_AUTH_URLServerBase application URL (e.g., http://localhost:3000 in dev, production URL on Vercel).NEXT_PUBLIC_APP_URLPublicPublic base URL used by client auth helpers and notification links.NEXT_PUBLIC_SUPABASE_URLPublicSupabase project URL for Storage endpoint resolution.SUPABASE_SERVICE_ROLE_KEYServerPrivileged server-only key for generating signed URLs and managing private SOP storage buckets. Never expose to clients.SUPABASE_STORAGE_BUCKETServerName of the private Supabase Storage bucket storing SOP PDF files (e.g., sop-documents).AUDIT_HASH_SALTServerOptional deployment-specific domain separator, prepended in the canonical audit hash formula (SECURITY.md §7.1). Empty string if unset; changing it after audit logs exist breaks chain verification, so set it once at first deployment (PROPOSED).8. Development Roadmap (CONFIRMED Direction)Slice 1 — Core Lifecycle MVPMulti-tenant workspace foundation, RBAC, and Better Auth integration.Structured Markdown editor, PDF upload pipeline, and SHA-256 payload hashing[cite: 2].Sequential approval engine with separation of duties (DEC-03) and atomic invalidation on edit (DEC-04)[cite: 1, 2].Append-only hash-chained audit trail (DEC-08)[cite: 1, 2].Read acknowledgment assignments, completion dashboards, and responsive PWA reader experience (DEC-07)[cite: 1, 2].Slice 2 — Advanced Workflows & ComparisonParallel and quorum approval policies[cite: 2].Approver delegation and automated overdue escalation (48h / 96h)[cite: 2].Visual side-by-side diffing for .docx and rich documents (DEC-05)[cite: 1, 2].Slice 3 — Enterprise Integrations & Compliance TierSAML 2.0 SSO and SCIM user provisioning[cite: 2].Webhook event subscriptions and Enterprise REST API[cite: 2].FDA 21 CFR Part 11 validation package, PKI sign-off integration, and evaluation of offline native mobile apps (DEC-02, DEC-07)[cite: 1, 2].Future Research (UNRESOLVED)AI-assisted SOP clarity scoring, automated multi-language translation, and regulatory cross-mapping[cite: 2].9. Documentation IndexProduct & Business: docs/PRODUCT_REQUIREMENTS.md, docs/BUSINESS_LOGIC.md, docs/USER_FLOWS.mdArchitecture & Security: docs/ARCHITECTURE.md, docs/DATABASE_SCHEMA.md, docs/API_SPECIFICATION.md, docs/SECURITY.md, docs/DESIGN_SYSTEM.mdDelivery & Quality: docs/IMPLEMENTATION_PLAN.md, docs/TESTING_STRATEGY.md, docs/DEVELOPMENT_GUIDELINES.md, docs/PROGRESS_TRACKER.mdGovernance & AI Agents: AGENTS.md, docs/DECISIONS.md, VALIDATION_REPORT.md
