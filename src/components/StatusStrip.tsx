"use client";

import { useState, useEffect, useCallback } from "react";
import { Cpu, MemoryStick, Container, Activity, Wifi, WifiOff } from "lucide-react";

interface QuickHealth {
  cpu: number;
  memPercent: number;
  containers: number;
  uptime: number;
}

function getColor(pct: number): string {
  if (pct >= 90) return "text-red-400";
  if (pct >= 70) return "text-amber-400";
  return "text-emerald-400";
}

function getDotColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function MiniBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="w-8 h-1.5 rounded-full bg-muted/50 overflow-hidden">
      <div
        className={`h-full rounded-full ${color} transition-all duration-700`}
        style={{ width: `${Math.max(percent, 2)}%` }}
      />
    </div>
  );
}

export function StatusStrip() {
  const [health, setHealth] = useState<QuickHealth | null>(null);
  const [connected, setConnected] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setHealth({
        cpu: Math.round(100 - (data.cpu?.idle ?? 100)),
        memPercent: Math.round(data.memory?.usedPercent ?? 0),
        containers: data.docker?.length ?? 0,
        uptime: data.uptime ?? 0,
      });
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // Pause when hidden
  useEffect(() => {
    const handler = () => {
      if (!document.hidden) fetchHealth();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [fetchHealth]);

  if (!mounted) return null;

  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      {/* Connection status */}
      {!connected && (
        <span className="flex items-center gap-1 text-amber-400" title="Connection lost">
          <WifiOff className="h-3 w-3" />
        </span>
      )}

      {health && (
        <>
          {/* CPU */}
          <span className="flex items-center gap-1.5" title={`CPU: ${health.cpu}%`}>
            <Cpu className="h-3 w-3" />
            <MiniBar percent={health.cpu} color={health.cpu >= 90 ? "bg-red-500" : health.cpu >= 70 ? "bg-amber-500" : "bg-emerald-500"} />
            <span className={`font-mono tabular-nums ${getColor(health.cpu)}`}>
              {health.cpu}%
            </span>
          </span>

          {/* Separator */}
          <span className="text-border">|</span>

          {/* Memory */}
          <span className="flex items-center gap-1.5" title={`Memory: ${health.memPercent}%`}>
            <MemoryStick className="h-3 w-3" />
            <MiniBar percent={health.memPercent} color={health.memPercent >= 90 ? "bg-red-500" : health.memPercent >= 70 ? "bg-amber-500" : "bg-emerald-500"} />
            <span className={`font-mono tabular-nums ${getColor(health.memPercent)}`}>
              {health.memPercent}%
            </span>
          </span>

          {/* Separator */}
          <span className="text-border">|</span>

          {/* Docker containers */}
          <span className="flex items-center gap-1" title={`${health.containers} containers running`}>
            <Container className="h-3 w-3" />
            <span className="font-mono tabular-nums">{health.containers}</span>
          </span>

          {/* Overall status dot */}
          <div
            className={`w-1.5 h-1.5 rounded-full ${getDotColor(Math.max(health.cpu, health.memPercent))} animate-pulse`}
            title={health.cpu >= 70 || health.memPercent >= 70 ? "High resource usage" : "System healthy"}
          />
        </>
      )}
    </div>
  );
}
