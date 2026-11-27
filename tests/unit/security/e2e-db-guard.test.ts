import { describe, it, expect, afterEach } from "vitest";
import { assertSafeE2eDatabaseUrl } from "../../../e2e/helpers/e2e-db-guard";

describe("E2E database mutation guard", () => {
  const originalOverride = process.env.ALLOW_REMOTE_E2E_MUTATION;

  afterEach(() => {
    if (originalOverride === undefined) {
      delete process.env.ALLOW_REMOTE_E2E_MUTATION;
    } else {
      process.env.ALLOW_REMOTE_E2E_MUTATION = originalOverride;
    }
  });

  it("allows local database hosts", () => {
    delete process.env.ALLOW_REMOTE_E2E_MUTATION;
    expect(() =>
      assertSafeE2eDatabaseUrl("postgresql://postgres:pass@localhost:5432/veridoc")
    ).not.toThrow();
    expect(() =>
      assertSafeE2eDatabaseUrl("postgresql://postgres:pass@127.0.0.1:5432/veridoc")
    ).not.toThrow();
    expect(() =>
      assertSafeE2eDatabaseUrl("postgresql://postgres:pass@[::1]:5432/veridoc")
    ).not.toThrow();
    expect(() =>
      assertSafeE2eDatabaseUrl("postgresql://postgres:pass@postgres:5432/veridoc")
    ).not.toThrow();
  });

  it("rejects remote database hosts unless explicitly allowed", () => {
    delete process.env.ALLOW_REMOTE_E2E_MUTATION;
    expect(() =>
      assertSafeE2eDatabaseUrl(
        "postgresql://postgres:pass@db.example.supabase.co:5432/postgres"
      )
    ).toThrow(/non-local database host/);

    process.env.ALLOW_REMOTE_E2E_MUTATION = "true";
    expect(() =>
      assertSafeE2eDatabaseUrl(
        "postgresql://postgres:pass@db.example.supabase.co:5432/postgres"
      )
    ).not.toThrow();
  });

  it("rejects malformed connection strings", () => {
    delete process.env.ALLOW_REMOTE_E2E_MUTATION;
    expect(() => assertSafeE2eDatabaseUrl("not-a-valid-url")).toThrow(
      /invalid database connection string/
    );
  });
});
