import type { WorkspaceRole } from "@/types/roles";

export const DEMO_TENANT = {
  id: "a0000000-0000-4000-8000-000000000001",
  name: "Apex Manufacturing",
  slug: "apex-manufacturing",
} as const;

export const DEMO_PASSWORD = "VeriDocDemo!2026";

export interface DemoAccount {
  id: string;
  role: WorkspaceRole;
  roleLabel: string;
  name: string;
  email: string;
  description: string;
  landingRoute: string;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    id: "b0000000-0000-4000-8000-000000000001",
    role: "WORKSPACE_ADMIN",
    roleLabel: "Workspace Admin",
    name: "Sarah Jenkins",
    email: "admin@apex.veridoc.demo",
    description: "Workspace governance settings, quotas, member roles, and audit log oversight.",
    landingRoute: "/dashboard",
  },
  {
    id: "b0000000-0000-4000-8000-000000000002",
    role: "QUALITY_MANAGER",
    roleLabel: "Quality Manager",
    name: "Elena Rostova",
    email: "qm@apex.veridoc.demo",
    description: "Completion dashboard, document publication, audit packet export, and final QA review.",
    landingRoute: "/dashboard",
  },
  {
    id: "b0000000-0000-4000-8000-000000000003",
    role: "DOCUMENT_AUTHOR",
    roleLabel: "Document Author",
    name: "Marcus Vance",
    email: "author@apex.veridoc.demo",
    description: "SOP drafting, PDF uploads, textual revision diffs, and approval submissions.",
    landingRoute: "/documents",
  },
  {
    id: "b0000000-0000-4000-8000-000000000004",
    role: "APPROVER_REVIEWER",
    roleLabel: "Approver / Reviewer",
    name: "Dr. Rachel Vance",
    email: "approver@apex.veridoc.demo",
    description: "Sequential approval queue and password-reauthenticated sign-off decisions.",
    landingRoute: "/approvals",
  },
  {
    id: "b0000000-0000-4000-8000-000000000005",
    role: "READER",
    roleLabel: "Reader",
    name: "David Miller",
    email: "reader@apex.veridoc.demo",
    description: "Mobile-first To-Read queue, published SOP viewer, and read acknowledgments.",
    landingRoute: "/to-read",
  },
] as const;

const ROLE_DEFAULT_LANDING_ROUTE: Record<WorkspaceRole, string> = {
  WORKSPACE_ADMIN: "/dashboard",
  QUALITY_MANAGER: "/dashboard",
  DOCUMENT_AUTHOR: "/documents",
  APPROVER_REVIEWER: "/approvals",
  READER: "/to-read",
};

export function getDefaultLandingRouteForRole(role: WorkspaceRole): string {
  return ROLE_DEFAULT_LANDING_ROUTE[role] ?? "/dashboard";
}

export function getDemoAccountByRole(role: WorkspaceRole): DemoAccount {
  const account = DEMO_ACCOUNTS.find((entry) => entry.role === role);
  if (!account) {
    throw new Error(`Unknown demo workspace role: ${role}`);
  }
  return account;
}

export function isDemoLoginEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") {
    return false;
  }
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO_LOGIN === "true";
}

export function getSafeCallbackUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }
  if (trimmed.includes("\\") || /[\u0000-\u001F\u007F]/.test(trimmed)) {
    return null;
  }
  try {
    const parsed = new URL(trimmed, "http://localhost");
    if (parsed.origin !== "http://localhost") {
      return null;
    }
    if (parsed.pathname.startsWith("//") || parsed.pathname.startsWith("/auth/sign-in")) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
