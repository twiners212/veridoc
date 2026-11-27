import type { NextConfig } from "next";

const supabaseDomain = "https://*.supabase.co";

export function buildContentSecurityPolicy(
  isProduction: boolean = process.env.NODE_ENV === "production"
): string {
  const scriptSrc = isProduction
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${supabaseDomain}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseDomain} https://*.supabase.in wss://*.supabase.co`,
    `frame-src 'self' blob: ${supabaseDomain}`,
    `object-src 'self' blob: ${supabaseDomain}`,
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function getSecurityHeaders(
  isProduction: boolean = process.env.NODE_ENV === "production"
) {
  return [
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(isProduction),
    },
  ];
}

export const securityHeaders = getSecurityHeaders();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;

