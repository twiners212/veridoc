import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  FileCheck,
  KeyRound,
  Lock,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VeriDocMark } from "@/components/brand/veridoc-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { GsapStaggerGroup, GsapHoverCard, GsapHoverButton } from "@/components/motion/gsap-motion";
import { LifecycleStatusBadge } from "@/components/features/documents/lifecycle-status-badge";
import {
  DEMO_ACCOUNTS,
  getDefaultLandingRouteForRole,
  isDemoLoginEnabled,
} from "@/lib/auth/demo-accounts";
import { getAuthenticatedWorkspaceContext } from "@/server/actions/session-context.actions";

const LIFECYCLE_STATES = [
  {
    state: "DRAFT",
    summary: "Authorable Markdown or PDF (<= 50MB) with revision tracking.",
  },
  {
    state: "PENDING_APPROVAL",
    summary: "Digest-locked sequential sign-off; mid-approval edits atomically reset approvals.",
  },
  {
    state: "APPROVED",
    summary: "Immutable approved version ready for Quality Manager rollout.",
  },
  {
    state: "PUBLISHED",
    summary: "Active SOP assigned to target groups for verified read acknowledgments.",
  },
  {
    state: "SUPERSEDED",
    summary: "Automatically replaced when a newer revision is published.",
  },
  {
    state: "RETIRED",
    summary: "Decommissioned from frontline use while preserved in audit history.",
  },
] as const;

export default async function HomePage() {
  const ctx = await getAuthenticatedWorkspaceContext();
  const demoLoginEnabled = isDemoLoginEnabled();

  return (
    <main className="min-h-screen bg-shell-canvas text-foreground">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <VeriDocMark size="md" />
            <span className="text-sm font-semibold tracking-tight text-foreground">
              VeriDoc
            </span>
          </Link>

          <div className="flex items-center gap-2.5">
            <ThemeToggle showLabel />
            <Link
              href={ctx ? getDefaultLandingRouteForRole(ctx.role) : "/auth/sign-in"}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand-gradient px-3.5 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-95"
            >
              <span>{ctx ? "Workspace" : "Sign In"}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border/80 bg-gradient-to-b from-blue-50/70 via-white/90 to-indigo-50/40 dark:from-slate-950 dark:via-slate-900/95 dark:to-indigo-950/30 px-6 py-16 sm:py-20">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-500/15 via-indigo-500/15 to-sky-400/15 blur-3xl dark:from-blue-500/20 dark:via-indigo-500/20 dark:to-sky-400/15" />

        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center space-y-8 text-center">
          <div className="space-y-3">
            <Badge
              variant="outline"
              className="border-primary/30 bg-brand-gradient-subtle px-3 py-1 font-mono text-xs text-primary"
            >
              Slice 1 — Core Lifecycle MVP
            </Badge>
            <h1 className="bg-gradient-to-r from-slate-900 via-blue-800 to-indigo-700 dark:from-white dark:via-blue-200 dark:to-sky-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-5xl">
              VeriDoc
            </h1>
            <p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Standard Operating Procedure &amp; Controlled Document Approval Workspace
            </p>
          </div>

          {ctx && (
            <div className="inline-flex flex-wrap items-center justify-center gap-2.5 rounded-lg border border-border bg-card/90 px-4 py-2.5 text-xs shadow-xs backdrop-blur-sm">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                {ctx.tenantName}
              </span>
              <span className="text-border">•</span>
              <span className="font-medium text-foreground">{ctx.userName}</span>
              <span className="rounded bg-primary/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
                {ctx.role.replace(/_/g, " ")}
              </span>
            </div>
          )}

          <GsapStaggerGroup
            stagger={0.07}
            duration={0.38}
            className="grid w-full max-w-4xl grid-cols-1 gap-5 text-left md:grid-cols-3"
          >
            <GsapHoverCard data-gsap-item>
              <Card className="relative h-full overflow-hidden border-border bg-card/95 shadow-xs transition-shadow hover:shadow-md">
                <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-indigo-500 to-sky-500" />
                <CardHeader className="flex flex-row items-center space-x-3 space-y-0 pb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    <FileCheck className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base font-medium">SOP Authoring</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-muted-foreground">
                    Sanitized Markdown editor and %PDF- verified uploads with SHA-256 payload digest binding.
                  </CardDescription>
                </CardContent>
              </Card>
            </GsapHoverCard>

            <GsapHoverCard data-gsap-item>
              <Card className="relative h-full overflow-hidden border-border bg-card/95 shadow-xs transition-shadow hover:shadow-md">
                <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400" />
                <CardHeader className="flex flex-row items-center space-x-3 space-y-0 pb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                    <Clock className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base font-medium">Sequential Approvals</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-muted-foreground">
                    Multi-stage sign-offs with separation of duties and atomic invalidation on mid-approval edit.
                  </CardDescription>
                </CardContent>
              </Card>
            </GsapHoverCard>

            <GsapHoverCard data-gsap-item>
              <Card className="relative h-full overflow-hidden border-border bg-card/95 shadow-xs transition-shadow hover:shadow-md">
                <div className="h-1 w-full bg-gradient-to-r from-emerald-600 via-teal-500 to-sky-500" />
                <CardHeader className="flex flex-row items-center space-x-3 space-y-0 pb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base font-medium">Audit Integrity</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-muted-foreground">
                    Serialized append-only hash-chained audit logs and verifiable inspection packets.
                  </CardDescription>
                </CardContent>
              </Card>
            </GsapHoverCard>
          </GsapStaggerGroup>

          {/* Primary Entry Actions */}
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            {ctx ? (
              <>
                <GsapHoverButton>
                  <Link
                    href={getDefaultLandingRouteForRole(ctx.role)}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-brand-gradient px-6 py-2.5 text-sm font-medium text-white shadow-sm shadow-blue-700/20 transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    <span>Open My Workspace</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </GsapHoverButton>
                <GsapHoverButton>
                  <Link
                    href="/auth/sign-in"
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground shadow-xs transition-all duration-200 hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    <span>Switch Account / Sign In</span>
                  </Link>
                </GsapHoverButton>
              </>
            ) : (
              <>
                <GsapHoverButton>
                  <Link
                    href="/auth/sign-in"
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-brand-gradient px-6 py-2.5 text-sm font-medium text-white shadow-sm shadow-blue-700/20 transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    <Lock className="h-4 w-4" />
                    <span>Workspace Access</span>
                  </Link>
                </GsapHoverButton>
                <GsapHoverButton>
                  <Link
                    href="#architecture-overview"
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-card px-6 py-2.5 text-sm font-medium text-foreground shadow-xs transition-all duration-200 hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    <span>Documentation</span>
                  </Link>
                </GsapHoverButton>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Architecture & Governance Documentation Overview */}
      <section
        id="architecture-overview"
        className="mx-auto w-full max-w-5xl space-y-12 px-6 py-14"
      >
        {/* 5 RBAC Roles */}
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              RBAC Workspace Roles
            </h2>
            <p className="text-sm text-muted-foreground">
              Every tenant membership enforces least-privilege access across PostgreSQL row-level security and Server Action policies.
            </p>
          </div>

          <GsapStaggerGroup
            stagger={0.05}
            duration={0.34}
            className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
          >
            {DEMO_ACCOUNTS.map((account) => (
              <GsapHoverCard key={account.role} data-gsap-item>
                <Card className="flex h-full flex-col justify-between border-border bg-card/95 shadow-xs transition-shadow hover:border-primary/40 hover:shadow-md">
                  <CardHeader className="space-y-2 pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-brand-gradient-subtle border border-primary/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
                        {account.role}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {account.landingRoute}
                      </span>
                    </div>
                    <CardTitle className="text-base font-semibold text-foreground">
                      {account.roleLabel}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-xs leading-5 text-muted-foreground">
                      {account.description}
                    </p>
                    {demoLoginEnabled && (
                      <Link
                        href={`/auth/sign-in?demoRole=${account.role}`}
                        className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                      >
                        <span>Sign in as {account.roleLabel}</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </CardContent>
                </Card>
              </GsapHoverCard>
            ))}
          </GsapStaggerGroup>
        </div>

        {/* 6 Lifecycle States */}
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Controlled Document Lifecycle
            </h2>
            <p className="text-sm text-muted-foreground">
              Six deterministic states govern authoring, sequential sign-off, rollout, supersession, and retirement.
            </p>
          </div>

          <GsapStaggerGroup
            stagger={0.04}
            duration={0.32}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {LIFECYCLE_STATES.map((item) => (
              <GsapHoverCard
                key={item.state}
                data-gsap-item
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md"
              >
                <div>
                  <LifecycleStatusBadge state={item.state} size="sm" />
                </div>
                <p className="text-xs leading-5 text-muted-foreground">{item.summary}</p>
              </GsapHoverCard>
            ))}
          </GsapStaggerGroup>
        </div>

        {/* Technical Controls */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
          <h2 className="text-lg font-semibold text-foreground">
            Verifiable Technical Controls
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Core cryptographic and transactional safeguards active across Slice 1.
          </p>

          <GsapStaggerGroup stagger={0.06} duration={0.34} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <GsapHoverCard data-gsap-item className="space-y-1.5 rounded-lg border border-border bg-muted/60 p-4 transition-colors hover:border-primary/40 hover:shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>SHA-256 Payload Digest Binding</span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Computed server-side on submission and verified on every approval sign-off, publication, and read acknowledgment.
              </p>
            </GsapHoverCard>

            <GsapHoverCard data-gsap-item className="space-y-1.5 rounded-lg border border-border bg-muted/60 p-4 transition-colors hover:border-primary/40 hover:shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <UserCheck className="h-4 w-4 text-primary" />
                <span>Separation of Duties &amp; Atomic Invalidation</span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Authors cannot self-approve unless explicitly overridden by a Workspace Admin, and mid-approval edits atomically invalidate prior sign-offs.
              </p>
            </GsapHoverCard>

            <GsapHoverCard data-gsap-item className="space-y-1.5 rounded-lg border border-border bg-muted/60 p-4 transition-colors hover:border-primary/40 hover:shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Append-Only Hash-Chained Audit Ledger</span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Every state mutation appends a sequence-locked, SHA-256 hash-chained audit record exportable in JSON or printable audit packets.
              </p>
            </GsapHoverCard>
          </GsapStaggerGroup>
        </div>

        <div className="flex justify-center pt-2">
          <GsapHoverButton>
            <Link
              href="/auth/sign-in"
              className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-brand-gradient px-6 py-2.5 text-sm font-medium text-white shadow-sm shadow-blue-700/20 transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Proceed to Sign In
            </Link>
          </GsapHoverButton>
        </div>
      </section>
    </main>
  );
}
