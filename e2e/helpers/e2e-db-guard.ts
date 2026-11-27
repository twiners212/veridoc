const LOCAL_DB_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

/**
 * Prevents E2E test suites from mutating remote/production PostgreSQL databases
 * unless explicitly overridden via ALLOW_REMOTE_E2E_MUTATION="true".
 */
export function assertSafeE2eDatabaseUrl(connectionString: string): void {
  if (process.env.ALLOW_REMOTE_E2E_MUTATION === "true") {
    return;
  }

  let hostname: string;
  try {
    hostname = new URL(connectionString).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    throw new Error(
      "Refusing to run E2E DB mutation: invalid database connection string."
    );
  }

  if (!LOCAL_DB_HOSTNAMES.has(hostname)) {
    throw new Error(
      `Refusing to run E2E DB setup/cleanup against non-local database host "${hostname}". ` +
        `Point DATABASE_URL/DIRECT_DATABASE_URL to a local Postgres instance (localhost, 127.0.0.1, ::1, postgres) ` +
        `or set ALLOW_REMOTE_E2E_MUTATION="true" to override.`
    );
  }
}
