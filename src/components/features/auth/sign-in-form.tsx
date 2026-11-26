"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth/client";
import {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  DEMO_TENANT,
  getDefaultLandingRouteForRole,
  getSafeCallbackUrl,
} from "@/lib/auth/demo-accounts";
import { getAuthenticatedWorkspaceContext } from "@/server/actions/session-context.actions";
import { VeriDocMark } from "@/components/brand/veridoc-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { GsapStaggerGroup, GsapHoverCard } from "@/components/motion/gsap-motion";
import { cn } from "@/lib/utils";
import type { WorkspaceRole } from "@/types/roles";

export interface SignInFormProps {
  callbackUrl?: string;
  initialDemoRole?: string;
  demoLoginEnabled: boolean;
  currentUser?: {
    name: string;
    email: string;
    role: WorkspaceRole;
    tenantName: string;
    landingRoute: string;
  } | null;
}

export function SignInForm({
  callbackUrl,
  initialDemoRole,
  demoLoginEnabled,
  currentUser,
}: SignInFormProps) {
  const router = useRouter();
  const safeCallbackUrl = React.useMemo(
    () => getSafeCallbackUrl(callbackUrl),
    [callbackUrl]
  );

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [demoLoadingRole, setDemoLoadingRole] =
    React.useState<WorkspaceRole | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage("Please enter both your email address and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authClient.signIn.email({
        email: trimmedEmail,
        password,
      });

      if (res?.error) {
        setErrorMessage(
          res.error.message || "Invalid email or password. Please try again."
        );
        return;
      }

      if (safeCallbackUrl) {
        router.push(safeCallbackUrl);
        router.refresh();
        return;
      }

      const ctx = await getAuthenticatedWorkspaceContext().catch(() => null);
      const target = ctx ? getDefaultLandingRouteForRole(ctx.role) : "/dashboard";
      router.push(target);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to sign in right now."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = async (role: WorkspaceRole, fallbackRoute: string) => {
    setErrorMessage(null);
    setDemoLoadingRole(role);

    try {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          json?.error?.message ||
          (res.status === 429
            ? "Too many sign-in attempts. Please wait a moment and try again."
            : res.status === 409
              ? "Demo workspace accounts are not seeded. Run pnpm db:seed."
              : res.status === 403
                ? "Demo login is disabled in this environment."
                : "Demo sign-in failed.");
        setErrorMessage(message);
        return;
      }

      const target =
        safeCallbackUrl || json?.data?.redirectTo || fallbackRoute;
      router.push(target);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Network error during demo login."
      );
    } finally {
      setDemoLoadingRole(null);
    }
  };

  const isAnyLoading = isSubmitting || demoLoadingRole !== null;

  return (
    <main className="min-h-screen bg-shell-canvas px-4 py-8 text-foreground sm:px-6 lg:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {/* Top Bar / Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-2.5 rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <VeriDocMark size="md" />
            <span className="flex flex-col text-left">
              <span className="text-sm font-semibold leading-tight text-foreground">
                VeriDoc
              </span>
              <span className="text-[11px] text-muted-foreground">
                Controlled Document &amp; SOP Workspace
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <ThemeToggle showLabel />
            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              &larr; Back to Overview
            </Link>
          </div>
        </div>

        {/* Active Session Notice if already authenticated */}
        {currentUser && (
          <div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="space-y-0.5 text-xs">
                <p className="font-semibold text-foreground">
                  Signed in as {currentUser.name} ({currentUser.email})
                </p>
                <p className="text-muted-foreground">
                  Active workspace: <strong className="text-foreground">{currentUser.tenantName}</strong> • Role:{" "}
                  <span className="font-mono font-semibold text-primary">
                    {currentUser.role.replace(/_/g, " ")}
                  </span>
                </p>
              </div>
            </div>
            <Link
              href={currentUser.landingRoute}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-md bg-brand-gradient-subtle border border-primary/25 px-4 py-2 text-xs font-semibold text-primary hover:opacity-90"
            >
              <span>Return to Workspace</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {/* Global Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="polite"
            className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <GsapStaggerGroup
          stagger={0.07}
          duration={0.35}
          className={cn(
            "grid grid-cols-1 gap-6",
            demoLoginEnabled ? "lg:grid-cols-12" : "mx-auto max-w-md"
          )}
        >
          {/* Credentials Sign-In Card */}
          <GsapHoverCard
            data-gsap-item
            liftY={-2}
            className={cn(demoLoginEnabled ? "lg:col-span-5" : "w-full")}
          >
            <Card className="relative h-full overflow-hidden border-border bg-card shadow-sm transition-shadow hover:shadow-md">
            <div className="h-1 w-full bg-brand-gradient" />
            <CardHeader className="space-y-1.5 pb-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                <Lock className="h-3.5 w-3.5" />
                <span>Workspace Authentication</span>
              </div>
              <CardTitle className="text-xl font-semibold tracking-tight text-foreground">
                Sign in to VeriDoc
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Enter your workspace credentials to access controlled SOPs, approval queues, and audit logs.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <form onSubmit={handleCredentialsSubmit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <label
                    htmlFor="signin-email"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Work Email
                  </label>
                  <Input
                    id="signin-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    disabled={isAnyLoading}
                    className="min-h-[44px] border-input bg-background/70 text-sm text-foreground"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="signin-password"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Password
                  </label>
                  <Input
                    id="signin-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    disabled={isAnyLoading}
                    className="min-h-[44px] border-input bg-background/70 text-sm text-foreground"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isAnyLoading}
                  className="min-h-[44px] w-full gap-2 text-sm font-semibold"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      <span>Sign In with Email</span>
                    </>
                  )}
                </Button>
              </form>

              <div className="rounded-md border border-border bg-muted/60 p-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Session &amp; Digest Controls</span>
                </div>
                <p className="mt-1 leading-5">
                  Sessions are tenant-isolated via PostgreSQL row-level security. Approval sign-offs enforce password re-authentication and SHA-256 payload digest verification.
                </p>
              </div>
            </CardContent>
            </Card>
          </GsapHoverCard>

          {/* Quick Demo Login Panel (Non-Prod / Explicitly Enabled) */}
          {demoLoginEnabled && (
            <GsapHoverCard data-gsap-item liftY={-2} className="lg:col-span-7">
              <Card className="relative h-full overflow-hidden border-border bg-card shadow-sm transition-shadow hover:shadow-md">
              <div className="h-1 w-full bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600" />
              <CardHeader className="space-y-2 border-b border-border bg-brand-gradient-subtle pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>Quick Demo Login (Testing &amp; Evaluation)</span>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground">
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    {DEMO_TENANT.name}
                  </span>
                </div>
                <CardDescription className="text-xs leading-5 text-muted-foreground">
                  Select any RBAC persona below to sign in immediately with a seeded session. Shared password for email sign-in &amp; approval re-authentication:{" "}
                  <code className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                    {DEMO_PASSWORD}
                  </code>
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-4">
                <div className="grid grid-cols-1 gap-3">
                  {DEMO_ACCOUNTS.map((account) => {
                    const isHighlighted = initialDemoRole === account.role;
                    const isLoadingThis = demoLoadingRole === account.role;

                    return (
                      <GsapHoverCard key={account.role} liftY={-2}>
                        <button
                          type="button"
                          data-testid={`demo-login-${account.role}`}
                          disabled={isAnyLoading}
                          onClick={() =>
                            handleDemoLogin(account.role, account.landingRoute)
                          }
                          className={cn(
                            "group flex min-h-[44px] w-full flex-col justify-between gap-2 rounded-lg border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 sm:flex-row sm:items-center",
                            isHighlighted
                              ? "border-primary bg-brand-gradient-subtle shadow-xs"
                              : "border-border bg-card hover:border-primary/50 hover:bg-muted/60 hover:shadow-xs"
                          )}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {account.name}
                              </span>
                              <span className="rounded bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
                                {account.roleLabel}
                              </span>
                              <span className="font-mono text-[11px] text-muted-foreground">
                                &rarr; {account.landingRoute}
                              </span>
                            </div>
                            <p className="font-mono text-[11px] text-muted-foreground">
                              {account.email}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {account.description}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center justify-end gap-1.5 text-xs font-semibold text-primary">
                            {isLoadingThis ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Signing in...</span>
                              </>
                            ) : (
                              <>
                                <span>Sign In</span>
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                              </>
                            )}
                          </div>
                        </button>
                      </GsapHoverCard>
                    );
                  })}
                </div>
              </CardContent>
              </Card>
            </GsapHoverCard>
          )}
        </GsapStaggerGroup>
      </div>
    </main>
  );
}
