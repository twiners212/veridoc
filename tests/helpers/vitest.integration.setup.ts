import { afterAll } from "vitest";
import { closeTestDbClients } from "./db";

afterAll(async () => {
  await closeTestDbClients();
});
