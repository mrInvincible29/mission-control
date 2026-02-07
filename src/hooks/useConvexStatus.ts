"use client";

import { useConvex } from "convex/react";

export function useConvexStatus() {
  try {
    const client = useConvex();
    return { isConfigured: !!client, error: null };
  } catch {
    return { isConfigured: false, error: "Convex not configured" };
  }
}
