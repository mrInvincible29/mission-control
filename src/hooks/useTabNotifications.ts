"use client";

import { useState, useEffect, useCallback } from "react";

export interface TabNotifications {
  health: "ok" | "warn" | "critical" | null;
  logs: number; // error count
  cronRuns: number; // failed count
}

/**
 * Fetches lightweight notification data for tabs.
 * Shows warning dots on Health (high CPU/mem), Logs (errors), Runs (failures).
 */
export function useTabNotifications(): TabNotifications {
  const [notifications, setNotifications] = useState<TabNotifications>({
    health: null,
    logs: 0,
    cronRuns: 0,
  });

  const fetch_ = useCallback(async () => {
    try {
      // Fetch health for CPU/mem status
      const healthRes = await fetch("/api/health");
      if (healthRes.ok) {
        const h = await healthRes.json();
        const cpu = 100 - (h.cpu?.idle ?? 100);
        const mem = h.memory?.usedPercent ?? 0;
        const worst = Math.max(cpu, mem);
        setNotifications(prev => ({
          ...prev,
          health: worst >= 90 ? "critical" : worst >= 70 ? "warn" : "ok",
        }));
      }

      // Fetch log error count
      const logsRes = await fetch("/api/logs?source=mission-control&lines=100");
      if (logsRes.ok) {
        const l = await logsRes.json();
        const errorCount = (l.entries || []).filter((e: any) => e.level === "error").length;
        setNotifications(prev => ({ ...prev, logs: errorCount }));
      }

      // Fetch cron run failures
      const cronRes = await fetch("/api/cron-runs?limit=50");
      if (cronRes.ok) {
        const c = await cronRes.json();
        // Count recent failures (last 24h)
        const dayAgo = Date.now() - 86400000;
        const recentFails = (c.runs || []).filter(
          (r: any) => r.status !== "ok" && r.ts > dayAgo
        ).length;
        setNotifications(prev => ({ ...prev, cronRuns: recentFails }));
      }
    } catch {
      // Silently ignore — tab notifications are non-critical
    }
  }, []);

  useEffect(() => {
    fetch_();
    const interval = setInterval(fetch_, 60000); // 1 minute refresh
    return () => clearInterval(interval);
  }, [fetch_]);

  // Refresh on tab visibility
  useEffect(() => {
    const handler = () => {
      if (!document.hidden) fetch_();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [fetch_]);

  return notifications;
}
