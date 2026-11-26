import { vi } from "vitest";

const PLACEHOLDER_SUPABASE_PREFIX = "https://placeholder.supabase.co/storage/v1/";

/**
 * Stubs Supabase Storage REST calls ONLY when CI runs with placeholder.supabase.co.
 * When real Supabase Storage credentials are configured, real network calls run untouched.
 */
export function installPlaceholderStorageFetchStub(): () => void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!supabaseUrl.includes("placeholder.supabase.co")) {
    return () => {};
  }

  const originalFetch = globalThis.fetch;
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (!url.startsWith(PLACEHOLDER_SUPABASE_PREFIX)) {
        return originalFetch(input, init);
      }

      const method = (init?.method ?? "GET").toUpperCase();
      const restPath = url.slice(PLACEHOLDER_SUPABASE_PREFIX.length);

      // Drain streaming request body if present so upload stream finalizes cleanly
      if (init?.body instanceof ReadableStream) {
        const reader = init.body.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }

      if (method === "POST" && restPath.startsWith("object/sign/")) {
        const cleanPath = restPath.slice("object/sign/".length);
        return new Response(
          JSON.stringify({
            signedURL: `/object/sign/${cleanPath}?token=ci-placeholder-token`,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (method === "POST" && restPath.startsWith("object/")) {
        const key = restPath.slice("object/".length);
        return new Response(JSON.stringify({ Key: key }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (method === "DELETE" && restPath.startsWith("object/")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Unhandled placeholder storage route" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    });

  return () => {
    spy.mockRestore();
  };
}
