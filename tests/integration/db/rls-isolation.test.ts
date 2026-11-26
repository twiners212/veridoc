import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { withTenantContext } from "@/db/context";
import {
  tenants,
  users,
  documents,
  documentVersions,
} from "@/db/schema";
import {
  testAppDb,
  testAdminDb,
  adminClient,
  cleanupTestTenants,
  cleanupTestUsers,
  appClient,
} from "../../helpers/db";

describe("Fail-Closed RLS & Pooler Isolation (PostgreSQL veridoc_app_user)", () => {
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    // Seed fixtures using adminDb (superuser)
    const [uA] = await testAdminDb
      .insert(users)
      .values({
        name: "User Tenant A",
        email: `test-rls-a-${Date.now()}@veridoc.test`,
      })
      .returning();
    userAId = uA.id;

    const [uB] = await testAdminDb
      .insert(users)
      .values({
        name: "User Tenant B",
        email: `test-rls-b-${Date.now()}@veridoc.test`,
      })
      .returning();
    userBId = uB.id;

    const [tA] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Workspace Alpha",
        slug: `workspace-alpha-${Date.now()}`,
      })
      .returning();
    tenantAId = tA.id;

    const [tB] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Workspace Beta",
        slug: `workspace-beta-${Date.now()}`,
      })
      .returning();
    tenantBId = tB.id;
  });

  afterAll(async () => {
    await cleanupTestTenants([tenantAId, tenantBId]);
    await cleanupTestUsers([userAId, userBId]);
  });

  it("enforces fail-closed RLS when queried without tenant context", async () => {
    // Seed a document for Tenant A inside tenant context
    const docA = await withTenantContext(
      tenantAId,
      async (tx) => {
        const [doc] = await tx
          .insert(documents)
          .values({
            tenantId: tenantAId,
            documentCode: `SOP-RLS-001-${Date.now()}`,
            createdBy: userAId,
          })
          .returning();
        return doc;
      },
      testAppDb
    );

    expect(docA).toBeDefined();

    // Directly querying as veridoc_app_user without withTenantContext must return 0 rows
    const bareQueryDocs = await testAppDb
      .select()
      .from(documents)
      .where(eq(documents.id, docA.id));

    expect(bareQueryDocs).toHaveLength(0);

    // Direct insert without withTenantContext must fail with RLS violation
    await expect(
      testAppDb.insert(documents).values({
        tenantId: tenantAId,
        documentCode: `SOP-LEAK-${Date.now()}`,
        createdBy: userAId,
      })
    ).rejects.toThrow();
  });

  it("guarantees pooler isolation across sequential transactions without context leakage", async () => {
    const codeA = `SOP-POOL-A-${Date.now()}`;
    const codeB = `SOP-POOL-B-${Date.now()}`;

    // Tenant A transaction
    const docA = await withTenantContext(
      tenantAId,
      async (tx) => {
        const [doc] = await tx
          .insert(documents)
          .values({
            tenantId: tenantAId,
            documentCode: codeA,
            createdBy: userAId,
          })
          .returning();
        return doc;
      },
      testAppDb
    );

    // Tenant B transaction on same pool
    const docB = await withTenantContext(
      tenantBId,
      async (tx) => {
        const [doc] = await tx
          .insert(documents)
          .values({
            tenantId: tenantBId,
            documentCode: codeB,
            createdBy: userBId,
          })
          .returning();
        return doc;
      },
      testAppDb
    );

    // Re-enter Tenant A: must see docA and NOT docB
    await withTenantContext(
      tenantAId,
      async (tx) => {
        const docsA = await tx
          .select()
          .from(documents)
          .where(eq(documents.id, docA.id));
        expect(docsA).toHaveLength(1);
        expect(docsA[0].id).toBe(docA.id);

        const docsB = await tx
          .select()
          .from(documents)
          .where(eq(documents.id, docB.id));
        expect(docsB).toHaveLength(0);
      },
      testAppDb
    );

    // Re-enter Tenant B: must see docB and NOT docA
    await withTenantContext(
      tenantBId,
      async (tx) => {
        const docsB = await tx
          .select()
          .from(documents)
          .where(eq(documents.id, docB.id));
        expect(docsB).toHaveLength(1);
        expect(docsB[0].id).toBe(docB.id);

        const docsA = await tx
          .select()
          .from(documents)
          .where(eq(documents.id, docA.id));
        expect(docsA).toHaveLength(0);
      },
      testAppDb
    );

    // Immediately outside withTenantContext: SET LOCAL must have reset to NULL
    const nakedDocs = await testAppDb
      .select()
      .from(documents)
      .where(eq(documents.id, docA.id));
    expect(nakedDocs).toHaveLength(0);
  });

  it("rejects cross-tenant child reference via composite foreign key (tenant_id, document_id)", async () => {
    // Create doc in Tenant B
    const docB = await withTenantContext(
      tenantBId,
      async (tx) => {
        const [doc] = await tx
          .insert(documents)
          .values({
            tenantId: tenantBId,
            documentCode: `SOP-CROSS-${Date.now()}`,
            createdBy: userBId,
          })
          .returning();
        return doc;
      },
      testAppDb
    );

    // Attempt to create a version under Tenant A referencing Tenant B's docB.id
    await expect(
      withTenantContext(
        tenantAId,
        async (tx) => {
          await tx.insert(documentVersions).values({
            tenantId: tenantAId,
            documentId: docB.id,
            title: "Cross Tenant Attack Version",
            contentFormat: "MARKDOWN",
            markdownContent: "# Malicious Content",
            authorId: userAId,
          });
        },
        testAppDb
      )
    ).rejects.toThrow();
  });

  it("validates tenant context input and rejects invalid or non-UUID inputs", async () => {
    // 1. Non-UUID string must throw TENANT_CONTEXT_REQUIRED / invalid UUID error
    await expect(
      withTenantContext(
        "invalid-non-uuid-tenant",
        async (tx) => {
          await tx.select().from(documents);
        },
        testAppDb
      )
    ).rejects.toThrow(/TENANT_CONTEXT_REQUIRED/);

    // 2. Empty session must throw TENANT_CONTEXT_REQUIRED
    await expect(
      withTenantContext(
        { session: { activeTenantId: null } },
        async (tx) => {
          await tx.select().from(documents);
        },
        testAppDb
      )
    ).rejects.toThrow(/TENANT_CONTEXT_REQUIRED/);

    // 3. Valid session object with activeTenantId resolves and works correctly
    const docs = await withTenantContext(
      { session: { activeTenantId: tenantAId } },
      async (tx) => {
        return await tx.select().from(documents);
      },
      testAppDb
    );
    expect(Array.isArray(docs)).toBe(true);
  });
});
