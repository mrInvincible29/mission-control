"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Cpu, MemoryStick, Container, HardDrive, Clock, WifiOff, ArrowDown, ArrowUp } from "lucide-react";
import { useHealthData, formatRate } from "@/hooks/useHealthData";

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

/** Smoothly animates between number values over ~400ms */
function useAnimatedNumber(target: number, duration = 400): number {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number>(0);
  const startRef = useRef({ value: target, time: 0 });

  useEffect(() => {
    const from = display;
    if (from === target) return;

    startRef.current = { value: from, time: performance.now() };

    const animate = (now: number) => {
      const elapsed = now - startRef.current.time;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startRef.current.value + (target - startRef.current.value) * eased);
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
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

/** Animated percentage display with color transitions */
function AnimatedPercent({ value, className }: { value: number; className?: string }) {
  const animated = useAnimatedNumber(value);
  return <span className={className}>{animated}%</span>;
}

export function StatusStrip({ compact = false }: { compact?: boolean }) {
  const { data, connected, isValidating, networkRate } = useHealthData();
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
            <div className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${getDotColor(Math.max(data.cpu, data.memPercent))}${Math.max(data.cpu, data.memPercent) >= 70 ? " animate-pulse" : ""}${isValidating ? " ring-2 ring-current/20" : ""}`} />
            <span className="font-mono tabular-nums">
              <span className={`transition-colors duration-500 ${getColor(data.cpu)}`}>CPU <AnimatedPercent value={data.cpu} /></span>
              {" · "}
              <span className={`transition-colors duration-500 ${getColor(data.memPercent)}`}>Mem <AnimatedPercent value={data.memPercent} /></span>
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
            <AnimatedPercent value={data.cpu} className={`font-mono tabular-nums transition-colors duration-500 ${getColor(data.cpu)}`} />
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5" title={`Memory: ${data.memPercent}%`}>
            <MemoryStick className="h-3 w-3" />
            <MiniBar percent={data.memPercent} color={getBarColor(data.memPercent)} />
            <AnimatedPercent value={data.memPercent} className={`font-mono tabular-nums transition-colors duration-500 ${getColor(data.memPercent)}`} />
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5" title={`Disk: ${data.diskPercent}%`}>
            <HardDrive className="h-3 w-3" />
            <MiniBar percent={data.diskPercent} color={getBarColor(data.diskPercent)} />
            <AnimatedPercent value={data.diskPercent} className={`font-mono tabular-nums transition-colors duration-500 ${getColor(data.diskPercent)}`} />
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1" title={`${data.containers} containers running`}>
            <Container className="h-3 w-3" />
            <span className="font-mono tabular-nums">{data.containers}</span>
          </span>
          {networkRate && (networkRate.rxBytesPerSec > 0 || networkRate.txBytesPerSec > 0) && (
            <>
              <span className="text-border">|</span>
              <span
                className="flex items-center gap-1 font-mono tabular-nums"
                title={`Network: ↓${formatRate(networkRate.rxBytesPerSec)} ↑${formatRate(networkRate.txBytesPerSec)}`}
                data-testid="network-throughput"
              >
                <ArrowDown className="h-2.5 w-2.5 text-sky-400" />
                <span className="text-sky-400">{formatRate(networkRate.rxBytesPerSec)}</span>
                <ArrowUp className="h-2.5 w-2.5 text-amber-400" />
                <span className="text-amber-400">{formatRate(networkRate.txBytesPerSec)}</span>
              </span>
            </>
          )}
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
            className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${getDotColor(Math.max(data.cpu, data.memPercent))}${Math.max(data.cpu, data.memPercent) >= 70 ? " animate-pulse" : ""}${isValidating ? " scale-150 opacity-60" : ""}`}
            title={data.cpu >= 70 || data.memPercent >= 70 ? "High resource usage" : "System healthy"}
          />
        </>
      )}
    </div>
  );
}
