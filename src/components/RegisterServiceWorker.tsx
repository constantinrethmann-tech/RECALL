"use client";

import { useEffect } from "react";
import { BASE_PATH } from "@/lib/env";

/** Registers the small service worker that makes RECALL installable and quick to open. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` }).catch(() => {});
  }, []);
  return null;
}
