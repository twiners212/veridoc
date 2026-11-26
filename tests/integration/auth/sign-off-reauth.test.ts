import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hashPassword } from "better-auth/crypto";
import { users, accounts } from "@/db/schema";
import { verifySignOffPassword } from "@/lib/auth/server";
import {
  testAdminDb,
  adminClient,
  cleanupTestUsers,
  appClient,
} from "../../helpers/db";

describe("Password Re-Authentication for Sign-Off (REQ-FR-401)", () => {
  let userId: string;
  const rawPassword = "CorrectHorseBatteryStaple!2026";

  beforeAll(async () => {
    // Hash password with Better Auth's password hasher
    const hashedPassword = await hashPassword(rawPassword);

    // Create user in users table
    const [u] = await testAdminDb
      .insert(users)
      .values({
        name: "Sign-Off Approver",
        email: `reauth-${Date.now()}@veridoc.test`,
      })
      .returning();
    userId = u.id;

    // Create credential account
    await testAdminDb.insert(accounts).values({
      userId,
      accountId: userId,
      providerId: "credential",
      password: hashedPassword,
    });
  });

  afterAll(async () => {
    await cleanupTestUsers([userId]);
  });

  it("returns true for matching password", async () => {
    const isValid = await verifySignOffPassword(userId, rawPassword);
    expect(isValid).toBe(true);
  });

  it("returns false for incorrect password", async () => {
    const isValid = await verifySignOffPassword(userId, "WrongPassword!999");
    expect(isValid).toBe(false);
  });

  it("returns false for empty password or empty user ID", async () => {
    expect(await verifySignOffPassword(userId, "")).toBe(false);
    expect(await verifySignOffPassword("", rawPassword)).toBe(false);
  });

  it("returns false for non-existent user", async () => {
    const fakeUserId = "00000000-0000-0000-0000-000000000000";
    const isValid = await verifySignOffPassword(fakeUserId, rawPassword);
    expect(isValid).toBe(false);
  });
});
