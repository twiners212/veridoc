"use client";

import { useEffect } from "react";

export function SwRegistrar() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: app remains operational without service worker registration
      });
    }
  }, []);

  return null;
}
