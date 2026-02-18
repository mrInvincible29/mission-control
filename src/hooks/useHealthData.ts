"use client";

import useSWR from "swr";
import { useState, useEffect } from "react";

export interface HealthData {
  cpu: number;
  memPercent: number;
  containers: number;
  uptime: number;
  diskPercent: number;
  hostname: string;
  raw: any; // Full API response for SystemHealth component
}

const fetcher = async (): Promise<HealthData> => {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error("Health fetch failed");
  const data = await res.json();
  return {
    cpu: Math.round(100 - (data.cpu?.idle ?? 100)),
    memPercent: Math.round(data.memory?.usedPercent ?? 0),
    containers: data.docker?.length ?? 0,
    uptime: data.uptime ?? 0,
    diskPercent: Math.round(data.disks?.[0]?.usedPercent ?? 0),
    hostname: data.hostname ?? "",
    raw: data,
  };
};

export function useHealthData(activeTab?: string) {
  const [paused, setPaused] = useState(false);

  // Faster refresh when System tab is active
  const interval = activeTab === "system" ? 10000 : 30000;

  const { data, error, isLoading, mutate } = useSWR(
    paused ? null : "health-data",
    fetcher,
    {
      refreshInterval: interval,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  );

  // Pause when browser tab is hidden
  useEffect(() => {
    const handler = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const healthStatus: "ok" | "warn" | "critical" | null = data
    ? Math.max(data.cpu, data.memPercent) >= 90
      ? "critical"
      : Math.max(data.cpu, data.memPercent) >= 70
        ? "warn"
        : "ok"
    : null;

  return {
    data,
    error,
    isLoading,
    connected: !error,
    healthStatus,
    refresh: () => mutate(),
  };
}
