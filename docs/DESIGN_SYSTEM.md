# VeriDoc — Design System & UI/UX Specification

> **App name:** VeriDoc — Document & SOP Approval Workspace. “VeriDoc” is the canonical product name throughout this package.

> **Status:** Slice 1 (Core Lifecycle MVP) — UI/UX Baseline  
> **UI Stack:** Tailwind CSS + shadcn/ui (Radix UI Primitives) + Lucide Icons (`PROPOSED` Stack Baseline)  
> **Primary Source:** Product Specification v3.0 (`CONFIRMED`)[cite: 2]  
> **Decision Authority:** Product Decision & Validation Log v3.0 (`CONFIRMED`)[cite: 1]  
> **Related Docs:** `README.md`, `docs/USER_FLOWS.md`, `docs/BUSINESS_LOGIC.md`, `docs/SECURITY.md`

---

## 1. UI Design Principles (`PROPOSED`)

1. **Governance Clarity Over Visual Flourish:** Every screen must make a document's current lifecycle state (`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `PUBLISHED`, `SUPERSEDED`, `RETIRED`), version (`v1.0`), and required action unmistakable at a glance[cite: 2].
2. **High-Friction Safeguards for Destructive/Governance Actions:** Actions with compliance consequences—such as approving an SOP (`REQ-FR-401`), editing a `PENDING_APPROVAL` draft (`DEC-04`), or executing an `ADMIN_APPROVER_OVERRIDE` (`BR-APP-04`)—must use explicit confirmation modals with clear consequence summaries[cite: 1, 2].
3. **Low-Friction Frontline Reading (`DEC-07`):** The `Reader` experience must strip away administrative chrome so operational workers on smartphones or tablets can read and acknowledge SOPs rapidly without clutter[cite: 1, 2].
4. **Honest Compliance Copy (`DEC-02`, `DEC-08`):** UI badges, tooltips, and export footers must accurately describe technical controls (e.g., *"SHA-256 Digest Verified"*, *"Append-Only Hash-Chained Audit Log"*) and MUST NEVER display prohibited claims such as *"FDA 21 CFR Part 11 Certified"* or *"100% Tamper-Proof"*[cite: 1, 2].
5. **UI Is Not a Security Boundary:** Disabled buttons (e.g., disabled approve button for an author) provide UX guidance only; authoritative enforcement always lives server-side (`docs/SECURITY.md`).

---

## 2. Color Tokens (`PROPOSED`)

Built on CSS variables compatible with **shadcn/ui** and **Tailwind CSS**. Slice 1 targets a high-contrast **Light Mode** baseline optimized for bright operational, clinical, and office environments.

### 2.1 Core Semantic Surfaces & Text
| Token | CSS Variable | Hex Reference | Usage |
| :--- | :--- | :--- | :--- |
| **Background** | `--background` | `#FFFFFF` | Primary page & document reader surface. |
| **Subtle Surface** | `--muted` | `#F8FAFC` (Slate 50) | Sidebar background, table headers, secondary panels. |
| **Card Surface** | `--card` | `#FFFFFF` | KPI cards, approval cards, modal containers. |
| **Border** | `--border` | `#E2E8F0` (Slate 200) | Card dividers, table gridlines, input borders. |
| **Primary Text** | `--foreground` | `#0F172A` (Slate 900) | Headings, SOP body prose, primary labels. |
| **Secondary Text** | `--muted-foreground` | `#475569` (Slate 600) | Metadata, timestamps, helper copy (`>= 4.5:1` contrast). |
| **Primary Brand** | `--primary` | `#1D4ED8` (Blue 700) | Primary CTAs (`Submit for Approval`, `Acknowledge Read`). |
| **Destructive** | `--destructive` | `#B91C1C` (Red 700) | Rejection actions, invalidation warnings, critical errors. |

### 2.2 Document Lifecycle State Tokens (Mandatory Consistency)
Every lifecycle badge MUST pair color with a distinct icon and uppercase/title-case label (never color alone):

| Lifecycle State | Background | Text | Border | Icon (Lucide) |
| :--- | :--- | :--- | :--- | :--- |
| `DRAFT` | `#F1F5F9` (Slate 100) | `#334155` (Slate 700) | `#CBD5E1` | `FileEdit` |
| `PENDING_APPROVAL` | `#FEF3C7` (Amber 100) | `#92400E` (Amber 800) | `#FCD34D` | `Clock` |
| `APPROVED` | `#E0F2FE` (Sky 100) | `#075985` (Sky 800) | `#7DD3FC` | `CheckCircle2` |
| `PUBLISHED` | `#DCFCE7` (Green 100) | `#166534` (Green 800) | `#86EFAC` | `ShieldCheck` |
| `SUPERSEDED` | `#F3E8FF` (Purple 100) | `#6B21A8` (Purple 800) | `#D8B4FE` | `History` |
| `RETIRED` | `#FEE2E2` (Red 100) | `#991B1B` (Red 800) | `#FCA5A5` | `Archive` |

---

## 3. Typography (`PROPOSED`)

* **Primary Sans-Serif:** `Inter` (`font-sans`) — clean legibility for tables, dashboards, and long-form SOP procedures.
* **Monospace:** `JetBrains Mono` (`font-mono`) — strictly used for Document Codes (`SOP-SAF-004`), Semantic Versions (`v1.0`), `SHA-256` Digests, IP addresses, and UTC timestamps[cite: 2].

| Role | Tailwind Classes | Size / Line Height | Usage |
| :--- | :--- | :--- | :--- |
| **Page Title (`H1`)** | `text-2xl font-semibold tracking-tight` | `24px / 32px` | Workspace page headers, SOP viewer title. |
| **Section Title (`H2`)** | `text-lg font-semibold` | `18px / 28px` | Dashboard panels, SOP section headings. |
| **Card / Group Label (`H3`)** | `text-base font-medium` | `16px / 24px` | Queue item titles, form group headers. |
| **Body / SOP Prose** | `text-sm leading-6` (desktop) / `text-base leading-7` (mobile reader) | `14px` / `16px` | General UI & readable SOP content. |
| **Metadata / Table Cell** | `text-xs text-muted-foreground` | `12px / 16px` | Dates, roles, secondary table columns. |
| **Code / Digest** | `font-mono text-xs` | `12px / 16px` | `SOP-SAF-004`, `v2.0`, `e3b0c442...855`[cite: 2]. |

---

## 4. Spacing & Layout Grid (`PROPOSED`)

* **Base Unit:** `4px` (`0.25rem` Tailwind scale).
* **Page Padding:** `p-4` (`16px`) on mobile, `p-6` (`24px`) on tablet/desktop.
* **Card Padding:** `p-4` to `p-6`, internal element gap `gap-4` (`16px`).
* **Max Readable Width (SOP Prose):** `max-w-3xl` (`768px`, ~65–75 characters per line) inside Markdown document viewers to maximize reading comprehension for frontline workers.
* **Max Workspace Width (Dashboards / Tables):** `max-w-7xl` (`1280px`) centered within the main content shell.

---

## 5. Component Conventions (`PROPOSED`)

All base primitives live in `src/components/ui/` (shadcn/ui); domain-specific components live in `src/components/features/`.

### 5.1 Critical Domain Components (Slice 1)
| Component | Path (`PROPOSED`) | Functional & UX Rules |
| :--- | :--- | :--- |
| **`LifecycleStatusBadge`** | `features/documents/lifecycle-status-badge.tsx` | Renders the canonical state token (color + icon + label) across tables, headers, and mobile cards. |
| **`Sha256DigestChip`** | `features/documents/sha256-digest-chip.tsx` | Displays truncated `SHA-256` (`e3b0c442…b855`) in `font-mono` with a one-click copy button and popover showing full 64-char hash (`DEC-06`)[cite: 1, 2]. |
| **`InvalidationWarningModal`** | `features/approvals/invalidation-warning-modal.tsx` | Blocking `AlertDialog` shown when editing a `PENDING_APPROVAL` SOP. Lists already-collected sign-offs that will be invalidated and requires explicit checkbox confirmation (`confirmInvalidateApprovals: true`, `DEC-04`)[cite: 1, 2]. |
| **`SignOffReauthModal`** | `features/approvals/sign-off-reauth-modal.tsx` | Modal for `APPROVE` / `REJECT` actions displaying SOP title, version, `SHA-256` digest, mandatory Intent/Reason textarea, and masked password re-authentication input (`REQ-FR-401`, `REQ-FR-402`)[cite: 2]. |
| **`SequentialStepper`** | `features/approvals/sequential-stepper.tsx` | Horizontal (desktop) / vertical (mobile) stepper showing ordered approval steps (`Step 1 -> Step N`), completed sign-off timestamps, active step highlight, and `BLOCKED_INACTIVE_APPROVER` alert badge (`BR-APP-04`)[cite: 2]. |
| **`MarkdownDiffViewer`** | `features/documents/markdown-diff-viewer.tsx` | Unified or split textual line/word diff viewer for `MARKDOWN` revisions (`DEC-05`, Slice 1)[cite: 1, 2]. Displays an informational notice for PDF versions that visual diffing is deferred to Slice 2[cite: 1, 2]. |
| **`ReaderAcknowledgmentBar`** | `features/acknowledgments/reader-ack-bar.tsx` | Sticky bottom bar in the SOP viewer showing scroll/page progress and enabling the binding CTA (*"I Acknowledge That I Have Read & Understand This SOP"*) once `>= 90%` scroll / all PDF pages and `>= 10s` dwell time are reached (`REQ-FR-502`)[cite: 2]. |

---

## 6. Navigation Architecture (`PROPOSED`)

Navigation adapts dynamically to the user's active RBAC role so users never see clutter they cannot use:

### 6.1 Desktop Shell (`>= 1024px` — Creator & Admin Roles)
* **Left Collapsible Sidebar (`240px`):**
  * Workspace Switcher (top) + Role Badge.
  * **Dashboard** (`Workspace Admin`, `Quality Manager`, `Document Author`, `Approver / Reviewer`).
  * **Documents** (All roles; filtered by visibility).
  * **Approvals** (`Workspace Admin`, `Quality Manager`, `Approver / Reviewer`) with active pending count badge.
  * **My Acknowledgments** (All roles) with pending count badge.
  * **Audit Trail** (`Workspace Admin`, `Quality Manager`)[cite: 2].
  * **Workspace Settings** (`Workspace Admin` only — Users, Groups, Seat Quotas `DEC-01`, Governance Flags)[cite: 1, 2].
* **Top Utility Bar (`56px`):** Breadcrumbs, global SOP code/title search, notification bell, and user profile menu.

### 6.2 Mobile Shell (`< 768px` — Frontline Reader PWA Priority)
* **Top Header (`56px`):** Workspace name, page title, and compact user menu.
* **Bottom Tab Bar (`64px` fixed, `safe-area-inset-bottom` aware):**
  * For `Reader` role: **To Read** (pending acknowledgments), **Library** (published SOPs), **Completed** (past receipts).
  * For Creator roles on mobile: **Approvals**, **Documents**, **To Read**, **More** (drawer).

---

## 7. Dashboard Layout (`PROPOSED`)

### 7.1 Quality Manager & Workspace Admin Dashboard (`REQ-FR-504`)
Organized in a responsive 12-column grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`):
1. **Top KPI Strip (4 Cards):**
   * *Published Active SOPs*
   * *Pending Approvals* (highlighting any `BLOCKED_INACTIVE_APPROVER` steps)
   * *Overall Read Acknowledgment Rate (%)*
   * *Overdue Read Acknowledgments* (highlighted in Amber/Red if `> 0`)
2. **Primary Compliance Table (Full Width):** Active published SOPs showing Document Code, Version, Target Groups, Completion Progress Bar (`e.g., 42 / 50 — 84%`), Overdue Count, and quick link to **Export Audit Packet (`UC-04`)**[cite: 2].
3. **Secondary Activity Panel:** Recent lifecycle & governance events (submissions, invalidations, sign-offs) linking to the full Audit Trail.

### 7.2 Approver Queue View
* Segmented tabs: **Action Required** (steps currently `PENDING` for this user) vs. **Upcoming** (future sequential steps `WAITING` on earlier approvers, read-only).
* Each card displays Document Code, Title, Version, Author, Submitted Date, and a primary **Review & Sign Off** button.

---

## 8. Responsive Behavior & Breakpoints (`PROPOSED`)

| Breakpoint | Width | Layout Behavior |
| :--- | :--- | :--- |
| **Mobile (Default)** | `< 768px` | Single-column stacked cards, fixed bottom navigation bar, full-width buttons (`h-11`), tables collapse into summary cards. |
| **Tablet (`md`)** | `768px – 1023px` | 2-column KPI grid, slide-over navigation drawer, spacious PDF/Markdown reader ideal for shop-floor tablets[cite: 2]. |
| **Desktop (`lg` / `xl`)** | `>= 1024px` | Persistent left sidebar (`240px`), 4-column KPI strip, full data tables with filter bars, side-by-side Markdown editor + live preview. |

---

## 9. Mobile-First Reader Experience — PWA (`DEC-07` — `CONFIRMED` Slice 1 / `UNRESOLVED` Native)

Designed specifically for frontline operational workers (e.g., David on a plant floor or warehouse tablet)[cite: 2]:
* **PWA Configuration (`public/manifest.json`):** Installable to iOS/Android home screens (`display: "standalone"`), branded app icon, and fast app-shell loading.
* **No Offline Sensitive Binary Caching (`docs/SECURITY.md`):** Service worker caches static UI assets only; opening an SOP requires an active session and network connection to fetch short-lived signed URLs and record server-verified acknowledgments.
* **Zero-Clutter Reading Mode:** Opening an assigned SOP hides the bottom tab bar and renders full-bleed readable Markdown (`text-base leading-7`) or pinch-to-zoom PDF pages with clear page indicators (`Page 2 of 4`).
* **Clear Binding Acknowledgment Bar:** Sticky footer displays progress (*"Scroll to bottom to acknowledge — 65%"*) and transitions into a high-contrast primary button (`min-h-12 w-full`): **"I Acknowledge That I Have Read & Understand This SOP"**[cite: 2].
* **Instant Receipt:** Upon completion, displays a confirmation banner with UTC timestamp and `SHA-256` digest reference, then offers a single tap to advance to the next pending SOP.

---

## 10. Accessibility Standards (`PROPOSED`)

Target compliance: **WCAG 2.1 Level AA** across desktop and mobile PWA:
* **Color Contrast:** Minimum `4.5:1` for normal text and `3:1` for large text, icons, and interactive borders. Status badges always combine color + icon + text label.
* **Keyboard Navigation:** Full Tab/Shift+Tab traversal, visible focus rings (`focus-visible:ring-2 focus-visible:ring-primary`), and Escape-to-close on all Radix/shadcn modals and drawers.
* **Screen Reader Semantics:** Proper ARIA landmarks (`<nav>`, `<main>`, `<aside>`), `aria-live="polite"` announcements for toast notifications and acknowledgment progress, and `aria-describedby` linking form inputs to Zod validation error messages.
* **Touch Accessibility:** Minimum `44px × 44px` hit areas on all mobile buttons, checkboxes, and navigation tabs.
* **Reduced Motion:** Respect `prefers-reduced-motion: reduce` by disabling non-essential modal/drawer transitions.
