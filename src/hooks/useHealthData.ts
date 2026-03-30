"use client";

import useSWR from "swr";
import { useState, useEffect, useRef } from "react";

export interface HealthData {
  cpu: number;
  memPercent: number;
  containers: number;
  uptime: number;
  diskPercent: number;
  hostname: string;
  topProcess: string | null; // Name of top CPU process when under load
  raw: any; // Full API response for SystemHealth component
}

export interface NetworkRate {
  rxBytesPerSec: number;
  txBytesPerSec: number;
}

interface NetworkSnapshot {
  timestamp: number;
  interfaces: Record<string, { rxBytes: number; txBytes: number }>;
}

const fetcher = async (): Promise<HealthData> => {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error("Health fetch failed");
  const data = await res.json();
  // Extract top CPU process name (first process from topProcesses array)
  const topProc = data.topProcesses?.[0];
  const topProcessName = topProc?.command || topProc?.name || null;

  return {
    cpu: Math.round(100 - (data.cpu?.idle ?? 100)),
    memPercent: Math.round(data.memory?.usedPercent ?? 0),
    containers: data.docker?.length ?? 0,
    uptime: data.uptime ?? 0,
    diskPercent: Math.round(data.disks?.[0]?.usedPercent ?? 0),
    hostname: data.hostname ?? "",
    topProcess: topProcessName,
    raw: data,
  };
};

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1048576) return `${(bytesPerSec / 1048576).toFixed(1)}M/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(1)}K/s`;
  if (bytesPerSec > 0) return `${Math.round(bytesPerSec)}B/s`;
  return "0B/s";
}

export { formatRate };

export function useHealthData(activeTab?: string) {
  const [paused, setPaused] = useState(false);
  const [networkRate, setNetworkRate] = useState<NetworkRate | null>(null);
  const prevNetworkRef = useRef<NetworkSnapshot | null>(null);

  // Faster refresh when System tab is active
  const interval = activeTab === "system" ? 10000 : 30000;

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    paused ? null : "health-data",
    fetcher,
    {
      refreshInterval: interval,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  );

  // Calculate network throughput rates from successive health snapshots
  useEffect(() => {
    if (!data?.raw?.network) return;

    const now = Date.now();
    const currentSnapshot: NetworkSnapshot = {
      timestamp: now,
      interfaces: {},
    };
    for (const iface of data.raw.network) {
      currentSnapshot.interfaces[iface.interface] = {
        rxBytes: iface.rxBytes,
        txBytes: iface.txBytes,
      };
    }

    const prev = prevNetworkRef.current;
    if (prev && now > prev.timestamp) {
      const elapsed = (now - prev.timestamp) / 1000;
      let totalRx = 0;
      let totalTx = 0;
      for (const iface of data.raw.network) {
        const prevIface = prev.interfaces[iface.interface];
        if (prevIface) {
          totalRx += Math.max(0, (iface.rxBytes - prevIface.rxBytes) / elapsed);
          totalTx += Math.max(0, (iface.txBytes - prevIface.txBytes) / elapsed);
        }
      }
      setNetworkRate({ rxBytesPerSec: totalRx, txBytesPerSec: totalTx });
    }

    prevNetworkRef.current = currentSnapshot;
  }, [data]);

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
    isValidating,
    connected: !error,
    healthStatus,
    networkRate,
    refresh: () => mutate(),
  };
}
