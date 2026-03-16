"use client";

import { useEffect, useRef } from "react";
import { useHealthData } from "@/hooks/useHealthData";
import { useToast } from "@/components/Toast";

const STATUS_LABELS: Record<string, string> = {
  ok: "healthy",
  warn: "elevated usage",
  critical: "critical",
};

/**
 * TabReturnNotifier — watches for health status changes while the browser tab
 * is hidden and shows a toast notification when the user returns.
 *
 * E.g., "System status changed: healthy → critical" appears as an error toast
 * when the user switches back to this tab.
 */
export function TabReturnNotifier() {
  const { healthStatus } = useHealthData();
  const { toast } = useToast();
  const statusAtHideRef = useRef<string | null>(null);
  const currentStatusRef = useRef<string | null>(null);

  // Always track current status
  useEffect(() => {
    currentStatusRef.current = healthStatus;
  }, [healthStatus]);

  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        // Tab became hidden — snapshot current status
        statusAtHideRef.current = currentStatusRef.current;
      } else {
        // Tab became visible — check if status changed
        const before = statusAtHideRef.current;
        const after = currentStatusRef.current;

        if (before && after && before !== after) {
          const beforeLabel = STATUS_LABELS[before] || before;
          const afterLabel = STATUS_LABELS[after] || after;
          const type = after === "critical" ? "error" : after === "warn" ? "info" : "success";
          toast(`System: ${beforeLabel} → ${afterLabel}`, type);
        }

        statusAtHideRef.current = null;
      }
    };

    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [toast]);

  return null;
}
