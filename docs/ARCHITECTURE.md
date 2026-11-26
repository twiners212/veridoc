# VeriDoc — System Architecture Specification
> **App name:** VeriDoc — Document & SOP Approval Workspace.

> **Status:** Slice 1 (Core Lifecycle MVP) — Architecture Baseline  
> **Primary Source:** Product Specification v3.0 (`CONFIRMED`)  
> **Decision Authority:** Product Decision & Validation Log v3.0 (`CONFIRMED`)[cite: 1]  
> **Related Docs:** `README.md`, `docs/BUSINESS_LOGIC.md`, `docs/DATABASE_SCHEMA.md`, `docs/API_SPECIFICATION.md`, `docs/SECURITY.md`

---

## 1. System Architecture Overview

The **VeriDoc** is a modular, multi-tenant monolith built on **Next.js (App Router) + TypeScript**, deployed on **Vercel**, and backed by **Supabase PostgreSQL** (via **Drizzle ORM**) and **Supabase Storage** (`PROPOSED` stack baseline from `README.md`).

A modular monolith is deliberately selected for Slice 1 to guarantee **ACID transaction boundaries** across lifecycle state changes, approval invalidations (`DEC-04`), `SHA-256` digest binding (`DEC-06`), and append-only audit log appends (`DEC-08`) without distributed-transaction complexity.

```mermaid
flowchart TB
    subgraph Client["Client Layer (Browser / Mobile PWA - DEC-07)"]
        UI[Next.js React UI\nTailwind CSS + shadcn/ui]
        TQ[TanStack Query Cache\nInteractive Queues & Dashboards]
        SW[PWA Service Worker\nApp Shell Only - No Offline SOP Cache]
    end

    subgraph Vercel["Application Runtime (Vercel — Next.js App Router)"]
        MW[Edge Middleware\nSession Presence & Security Headers]
        RSC[React Server Components\nAuthenticated Initial Reads]
        SA[Server Actions\nDomain Mutations]
        API[Route Handlers /api/*\nAuth, PDF Uploads, Audit Exports]

        subgraph ServerCore["Server-Only Core (src/server & src/lib)"]
            AUTH[Better Auth\nSessions & Sign-Off Re-Auth]
            POL[Authorization Policy Engine\nRBAC & Tenant Guards]
            SVC[Domain Services\nLifecycle, Approval, Ack, Audit]
            HASH[Crypto Module\nSHA-256 Digest & Hash Chain]
            VAL[Zod Schema Validators]
        end
    end

    subgraph Supabase["Data & Storage Platform (Supabase)"]
        PG[(Supabase PostgreSQL\nDrizzle ORM + Row-Level Security)]
        ST[(Supabase Storage\nPrivate AES-256 Bucket)]
    end

    subgraph External["External Integrations"]
        MAIL[Transactional Email Provider\nApproval & Reader Alerts - PROPOSED]
    end

    UI <--> TQ
    UI --> MW
    TQ --> SA
    TQ --> API
    MW --> RSC
    MW --> SA
    MW --> API

    RSC --> POL
    SA --> VAL --> POL
    API --> VAL --> POL
    API <--> AUTH
    POL --> AUTH
    POL --> SVC
    SVC --> HASH
    SVC -->|withTenantContext TX| PG
    SVC -->|Signed URLs / Private Streams| ST
    SVC -.->|Async / Post-Commit| MAIL
2. Application Layers (PROPOSED)To prevent business logic leakage into UI components or database files, the codebase enforces five strict vertical layers:LayerDirectoryResponsibilitiesProhibited Actions1. Presentationsrc/app/**, src/components/**Rendering Server/Client Components, form UX, optimistic state (TanStack Query), PWA layout.Direct DB queries, trusting client state for RBAC, computing authoritative SHA-256 hashes.2. Entry / Transportsrc/server/actions/**, src/app/api/**Request parsing, Zod input validation, extracting Better Auth session & client IP, mapping domain errors to HTTP/Action responses.Embedding multi-step domain workflows or raw SQL directly in handlers.3. Policy / AuthZsrc/server/policies/**Enforcing 5-role RBAC matrix (REQ-FR-602), verifying active tenant membership, checking separation of duties (BR-APP-01).Mutating database state directly.4. Domain Servicessrc/server/services/**Enforcing state machine transitions, atomic approval invalidation (BR-APP-02), SHA-256 payload binding (DEC-06), hash-chained audit appends (DEC-08).Returning raw UI markup or leaking cross-tenant data.5. Data & Infrastructuresrc/db/**, src/lib/storage/**, src/lib/crypto/**Drizzle ORM schemas, withTenantContext RLS transaction wrapper, Supabase Storage signed URLs, cryptographic primitives.Making RBAC decisions (except DB-level RLS/constraint defense-in-depth).3. Frontend & Backend Boundaries (PROPOSED)3.1 Strict Server-Only EnforcementAll database clients (src/db/), service modules (src/server/), SUPABASE_SERVICE_ROLE_KEY, and BETTER_AUTH_SECRET MUST import server-only to guarantee build-time failure if referenced from a Client Component.Client-side validation (Zod / React Hook Form) is UX-only and MUST NEVER be treated as a security boundary. Every Server Action and Route Handler re-validates inputs server-side.3.2 Server Components vs. Client Components vs. TanStack QueryReact Server Components (RSC): Used for initial page loads, document detail views, role-gated navigation shells, and static metadata.Client Components ("use client"): Used strictly for interactive islands: Markdown/Rich-Text editor, PDF viewer with scroll/dwell engagement tracker, sign-off re-authentication modal, and filterable queues.TanStack Query: Used selectively on client-interactive views (Approval Queue, Completion Dashboard, Reader Queue, Audit Log pagination) to manage cache invalidation and background refresh without overloading RSC payloads.3.3 Server Actions vs. Route HandlersServer Actions (src/server/actions/): Used for JSON-serializable workspace mutations (create/edit draft, submit workflow, execute sign-off, publish SOP, record read acknowledgment, admin override).Route Handlers (src/app/api/): Used for:/api/auth/[...all] — Better Auth handler./api/documents/[id]/upload — Multipart PDF upload with server-side magic-byte validation and streaming SHA-256 hashing./api/documents/[id]/preview-url — Short-lived signed URL generation after server-side tenant & RBAC checks./api/audit/export — Streaming Audit Packet export (UC-04).   4. Authentication Architecture (PROPOSED)Authentication is powered by Better Auth backed by Supabase PostgreSQL tables managed via Drizzle ORM.Session Model: Secure, HttpOnly, SameSite=Lax, Secure (HTTPS) session cookies with server-side session persistence and revocation support.Slice 1 Auth Methods:Email + Password authentication for all roles (required for Creator seats).Optional Magic Link sign-in for Reader accounts (PROPOSED) to minimize frontline friction.   Sign-Off Re-Authentication (REQ-FR-401, BR-SIG-01):Approving or rejecting an SOP requires fresh identity verification at the moment of sign-off.   In Slice 1 (PROPOSED), the approval modal collects the approver's password and verifies it server-side against Better Auth's password hash inside the sign-off flow before opening the commit transaction. (SAML 2.0 SSO + WebAuthn MFA re-auth is deferred to Slice 3.)   Active Tenant Context: Each session tracks active_tenant_id. Switching workspaces updates the session's active tenant only after verifying active membership in tenant_memberships.5. Authorization Architecture (CONFIRMED / PROPOSED)Authorization follows a Defense-in-Depth model across three independent layers:Middleware Layer (Coarse Gate): Verifies presence of a valid Better Auth session cookie for all /(workspace)/* routes and redirects unauthenticated requests to /sign-in. Does not perform fine-grained RBAC.Server Policy Layer (src/server/policies/ — Authoritative Application Gate):Loads the authenticated user's live tenant_membership role (Workspace Admin, Quality Manager, Document Author, Approver / Reviewer, or Reader) and status = 'ACTIVE' from PostgreSQL on every request (never trusting stale JWT role claims).   Evaluates the RBAC permission matrix (docs/PRODUCT_REQUIREMENTS.md §3.6, Spec §13) plus resource-level invariants:   Draft visibility restricted to Author, Quality Manager, and Workspace Admin.   Self-approval prevention (DEC-03, BR-APP-01): denies sign-off if actor.id === version.author_id unless workspace override is explicitly enabled.   Active step check (BR-SEQ-02): denies sign-off if actor.id !== activeStep.approver_id.Database Layer (RLS + Constraints — Infrastructure Safety Net):Enforces tenant boundaries via PostgreSQL Row-Level Security (RLS) so even a buggy application query cannot read or mutate another tenant's rows.Enforces structural invariants via UNIQUE, CHECK, and trigger constraints (see docs/DATABASE_SCHEMA.md).6. Multi-Tenancy & PostgreSQL RLS Bridge (PROPOSED)The platform uses a Shared Database, Shared Schema, Logical Tenant Isolation model (tenant_id column on every tenant-owned table) reinforced by PostgreSQL Row-Level Security (RLS).   Better Auth ↔ Supabase PostgreSQL RLS Integration PatternBecause Better Auth manages sessions outside Supabase Auth, PostgreSQL RLS policies cannot use Supabase's built-in auth.uid(). Instead, all tenant-scoped database access MUST execute through a single mandatory wrapper (withTenantContext):Cuplikan kodesequenceDiagram
    participant Handler as Server Action / Route Handler
    participant Auth as Better Auth Session
    participant Wrapper as withTenantContext() (Drizzle)
    participant PG as Supabase PostgreSQL (RLS Enabled)

    Handler->>Auth: getSession() -> { userId, activeTenantId }
    Handler->>Wrapper: withTenantContext(session, async (tx) => ...)
    Wrapper->>PG: BEGIN TRANSACTION
    Wrapper->>PG: SELECT set_config('app.current_tenant_id', tenantId, true)
    Wrapper->>PG: Execute Drizzle Queries (RLS evaluates current_setting('app.current_tenant_id'))
    Wrapper->>PG: COMMIT (SET LOCAL settings automatically reset for pooler reuse)
Critical Multi-Tenancy Rules (PROPOSED)Canonical `withTenantContext()` definition (single source of truth, all files): `withTenantContext(session, fn)` opens a transaction and executes only `SELECT set_config('app.current_tenant_id', tenantId, true)` (transaction-scoped `SET LOCAL`). It does NOT execute `SET LOCAL ROLE`, and it does NOT set `app.current_user_id` — no RLS policy uses that variable. Runtime connections already run as `app_user` via `DATABASE_URL`. Pooler Safety: Always use SET LOCAL (transaction-scoped, third parameter true in set_config), NEVER session-scoped SET, so Supavisor/PgBouncer connection pooling never leaks tenant context across concurrent requests.Non-Bypassable Role: Runtime application queries execute under a dedicated PostgreSQL role (app_user) that does not have BYPASSRLS privilege. Migrations run separately under DIRECT_DATABASE_URL.Defense-in-Depth Querying: Domain services still include explicit .where(eq(table.tenantId, ctx.tenantId)) predicates alongside RLS to ensure query planner index usage and double-layer protection.7. Data Access Patterns & Transaction Boundaries (PROPOSED)7.1 Mandatory Atomic TransactionsThe following operations MUST execute inside a single PostgreSQL BEGIN ... COMMIT transaction via withTenantContext:OperationRow Locks AcquiredAtomic Steps ExecutedSubmit for Approvaldocument_versions (FOR UPDATE)Verify DRAFT state → validate sequential chain & BR-APP-01 → compute & store SHA-256 digest → create approval_cycle & approval_steps → transition to PENDING_APPROVAL → append audit log.Execute Approval / Rejectiondocument_versions + approval_cycles (FOR UPDATE)Verify PENDING_APPROVAL + active step + BR-APP-01 + SHA-256 match → write immutable sign-off metadata → advance next step or set APPROVED/DRAFT → append audit log.Edit During PENDING_APPROVAL (DEC-04)document_versions + approval_cycles (FOR UPDATE)Mark active cycle & steps INVALIDATED → update payload & increment draft revision → set state DRAFT → append APPROVAL_INVALIDATED_BY_EDIT audit log.   Publish Approved SOPdocuments + document_versions (FOR UPDATE)Verify APPROVED → transition prior PUBLISHED version to SUPERSEDED → set new version PUBLISHED → materialize read_assignments → append audit log.Record Read Acknowledgmentread_assignments (FOR UPDATE)Verify version is PUBLISHED & user is assigned → verify SHA-256 digest → insert read_acknowledgments → mark assignment completed → append READ_ACKNOWLEDGED audit log.7.2 Hash-Chained Audit Log Serialization (DEC-08)To prevent concurrent transactions within the same tenant from reading the same prev_hash and forking the audit chain:Every audit log append acquires a tenant-scoped transaction advisory lock: SELECT pg_advisory_xact_lock(hashtext(tenant_id::text)) (PROPOSED).Within the lock, the service fetches the latest entry_hash for that tenant, computes entry_hash = SHA-256(AUDIT_HASH_SALT || prev_hash || tenant_id || sequence_number || event_type || entity_id || canonical_payload_json), and inserts the new row.Lock is automatically released on transaction COMMIT or ROLLBACK.7.3 Document Integrity & Hashing Pipeline (DEC-06)Performance Target (REQ-NFR-001): Hashing and preview preparation MUST complete in < 1.5 seconds for standard files up to 20MB.   Streaming Hash Calculation: Uploaded PDFs (up to 50MB) are streamed through Node.js crypto.createHash('sha256') during upload validation to compute file_sha256 without buffering excessive copies in memory.   Canonical Document Digest: On submission, the server computes document_sha256 from (normalized_markdown || file_sha256 || canonical_metadata_json) and persists it immutably on the document_versions row (DEC-06).   8. Integration Boundaries (CONFIRMED / PROPOSED)8.1 Supabase Storage (Private Document Objects)Bucket Policy: Single private bucket (SUPABASE_STORAGE_BUCKET, AES-256 encrypted at rest) with zero public access.   Object Key Convention (PROPOSED): tenants/{tenant_id}/documents/{document_id}/versions/{version_id}/{uuid}.pdf — ensures immutable object paths per version so overwriting an existing version's binary is impossible.Access Pattern: Clients never hold direct storage credentials. To view a PDF, the client calls /api/documents/[id]/preview-url; the server verifies session, tenant membership, and RBAC visibility (e.g., Reader can only access PUBLISHED versions), then issues a short-lived signed URL (TTL: 120s, PROPOSED).8.2 Transactional Email & Notifications (PROPOSED)Email delivery (approval requests, invalidation alerts, read-acknowledgment assignments, magic links) is isolated behind src/lib/notifications/mailer.ts.Notifications are dispatched after the PostgreSQL transaction commits so rolled-back actions never emit phantom emails.8.3 Future Extension Boundaries (Deferred — Do NOT Implement in Slice 1)Slice 2 — .docx to PDF/A Conversion & Visual Diffing (DEC-05): Isolated behind an optional IDocumentRenderer / worker interface so heavy document conversion never blocks Vercel serverless request threads[cite: 1, 2].Slice 2 — Scheduled Escalation Jobs (REQ-FR-204): Planned for Vercel Cron / scheduled background jobs checking 48h/96h inactivity thresholds[cite: 2].Slice 3 — Enterprise SSO/SCIM & Webhooks: Better Auth enterprise plugins (SAML 2.0) and an outbox-pattern webhook dispatcher consuming committed audit events[cite: 2].
