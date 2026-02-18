"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Cpu, MemoryStick, Container, HardDrive, Clock, WifiOff } from "lucide-react";
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

function getBarColor(pct: number): string {
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

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Live IST clock — updates every minute */
function useISTClock(): string {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      );
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  return time;
}

export function StatusStrip({ compact = false }: { compact?: boolean }) {
  const { data, connected } = useHealthData();
  const router = useRouter();
  const istTime = useISTClock();

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
            {istTime && (
              <span className="text-muted-foreground/50 ml-0.5">
                {istTime}
              </span>
            )}
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
            <MiniBar percent={data.cpu} color={getBarColor(data.cpu)} />
            <span className={`font-mono tabular-nums ${getColor(data.cpu)}`}>{data.cpu}%</span>
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5" title={`Memory: ${data.memPercent}%`}>
            <MemoryStick className="h-3 w-3" />
            <MiniBar percent={data.memPercent} color={getBarColor(data.memPercent)} />
            <span className={`font-mono tabular-nums ${getColor(data.memPercent)}`}>{data.memPercent}%</span>
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5" title={`Disk: ${data.diskPercent}%`}>
            <HardDrive className="h-3 w-3" />
            <MiniBar percent={data.diskPercent} color={getBarColor(data.diskPercent)} />
            <span className={`font-mono tabular-nums ${getColor(data.diskPercent)}`}>{data.diskPercent}%</span>
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1" title={`${data.containers} containers running`}>
            <Container className="h-3 w-3" />
            <span className="font-mono tabular-nums">{data.containers}</span>
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1" title={`Uptime: ${formatUptime(data.uptime)}`}>
            <Clock className="h-3 w-3" />
            <span className="font-mono tabular-nums">{formatUptime(data.uptime)}</span>
          </span>
          {istTime && (
            <>
              <span className="text-border">|</span>
              <span className="font-mono tabular-nums text-foreground/60" title="Server time (IST)">
                {istTime} IST
              </span>
            </>
          )}
          <div
            className={`w-1.5 h-1.5 rounded-full ${getDotColor(Math.max(data.cpu, data.memPercent))} animate-pulse`}
            title={data.cpu >= 70 || data.memPercent >= 70 ? "High resource usage" : "System healthy"}
          />
        </>
      )}
    </div>
  );
}
