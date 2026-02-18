"use client";

import { useState, useEffect, useCallback } from "react";
import { useHealthData } from "@/hooks/useHealthData";

export interface TabNotifications {
  health: "ok" | "warn" | "critical" | null;
  logs: number;
  cronRuns: number;
  blockedTasks: number;
}

export function useTabNotifications(): TabNotifications {
  const { healthStatus } = useHealthData();
  const [extra, setExtra] = useState({ logs: 0, cronRuns: 0, blockedTasks: 0 });

  const fetchExtra = useCallback(async () => {
    try {
      const [logsRes, cronRes, tasksRes] = await Promise.allSettled([
        fetch("/api/logs?source=mission-control&lines=100"),
        fetch("/api/cron-runs?limit=50"),
        fetch("/api/tasks?status=blocked"),
      ]);

      const logs = logsRes.status === "fulfilled" && logsRes.value.ok
        ? (await logsRes.value.json()).entries?.filter((e: any) => e.level === "error").length ?? 0
        : 0;

      const dayAgo = Date.now() - 86400000;
      const cronRuns = cronRes.status === "fulfilled" && cronRes.value.ok
        ? (await cronRes.value.json()).runs?.filter((r: any) => r.status !== "ok" && r.ts > dayAgo).length ?? 0
        : 0;

      const blockedTasks = tasksRes.status === "fulfilled" && tasksRes.value.ok
        ? (await tasksRes.value.json()).total ?? 0
        : 0;

      setExtra({ logs, cronRuns, blockedTasks });
    } catch {
      // Non-critical — silently ignore
    }
  }, []);

  useEffect(() => {
    fetchExtra();
    const interval = setInterval(fetchExtra, 60000);
    return () => clearInterval(interval);
  }, [fetchExtra]);

  useEffect(() => {
    const handler = () => { if (!document.hidden) fetchExtra(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [fetchExtra]);

  return {
    health: healthStatus,
    ...extra,
  };
}
