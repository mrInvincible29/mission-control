"use client";

import { useRouter } from "next/navigation";
import { Cpu, MemoryStick, Container, WifiOff } from "lucide-react";
import { useHealthData } from "@/hooks/useHealthData";

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

export function StatusStrip({ compact = false }: { compact?: boolean }) {
  const { data, connected } = useHealthData();
  const router = useRouter();

  if (compact) {
    return (
      <button
        onClick={() => router.replace("/?tab=system", { scroll: false })}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {!connected && <WifiOff className="h-3 w-3 text-amber-400" />}
        {data && (
          <>
            <div className={`w-1.5 h-1.5 rounded-full ${getDotColor(Math.max(data.cpu, data.memPercent))} animate-pulse`} />
            <span className="font-mono tabular-nums">
              <span className={getColor(data.cpu)}>CPU {data.cpu}%</span>
              {" · "}
              <span className={getColor(data.memPercent)}>Mem {data.memPercent}%</span>
            </span>
          </>
        )}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      {!connected && (
        <span className="flex items-center gap-1 text-amber-400" title="Connection lost">
          <WifiOff className="h-3 w-3" />
        </span>
      )}
      {data && (
        <>
          <span className="flex items-center gap-1.5" title={`CPU: ${data.cpu}%`}>
            <Cpu className="h-3 w-3" />
            <MiniBar percent={data.cpu} color={data.cpu >= 90 ? "bg-red-500" : data.cpu >= 70 ? "bg-amber-500" : "bg-emerald-500"} />
            <span className={`font-mono tabular-nums ${getColor(data.cpu)}`}>{data.cpu}%</span>
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5" title={`Memory: ${data.memPercent}%`}>
            <MemoryStick className="h-3 w-3" />
            <MiniBar percent={data.memPercent} color={data.memPercent >= 90 ? "bg-red-500" : data.memPercent >= 70 ? "bg-amber-500" : "bg-emerald-500"} />
            <span className={`font-mono tabular-nums ${getColor(data.memPercent)}`}>{data.memPercent}%</span>
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1" title={`${data.containers} containers running`}>
            <Container className="h-3 w-3" />
            <span className="font-mono tabular-nums">{data.containers}</span>
          </span>
          <div
            className={`w-1.5 h-1.5 rounded-full ${getDotColor(Math.max(data.cpu, data.memPercent))} animate-pulse`}
            title={data.cpu >= 70 || data.memPercent >= 70 ? "High resource usage" : "System healthy"}
          />
        </>
      )}
    </div>
  );
}
