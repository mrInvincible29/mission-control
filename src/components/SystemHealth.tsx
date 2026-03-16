"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Container,
  Activity,
  Network,
  Server,
  RefreshCw,
  Clock,
  CircleCheck,
  CircleX,
  Gauge,
  ChevronDown,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";

interface HealthData {
  timestamp: number;
  hostname: string;
  uptime: number;
  cpu: {
    user: number;
    system: number;
    idle: number;
    loadAvg: [number, number, number];
    cores: number;
  };
  memory: {
    totalMB: number;
    usedMB: number;
    availableMB: number;
    usedPercent: number;
    swapTotalMB: number;
    swapUsedMB: number;
  };
  disks: Array<{
    filesystem: string;
    mountpoint: string;
    sizeMB: number;
    usedMB: number;
    availableMB: number;
    usedPercent: number;
  }>;
  docker: Array<{
    id: string;
    name: string;
    image: string;
    status: string;
    state: string;
    ports: string;
    uptime: string;
  }>;
  services: Array<{
    name: string;
    active: boolean;
    status: string;
    description: string;
    uptime: string;
  }>;
  network: Array<{
    interface: string;
    rxBytes: number;
    txBytes: number;
    rxPackets: number;
    txPackets: number;
  }>;
  topProcesses: Array<{
    pid: number;
    user: string;
    cpu: number;
    mem: number;
    command: string;
  }>;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1048576) return `${(bytesPerSec / 1048576).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  if (bytesPerSec > 0) return `${bytesPerSec.toFixed(0)} B/s`;
  return "0 B/s";
}

interface NetworkRate {
  interface: string;
  rxRate: number;
  txRate: number;
}

interface NetworkSnapshot {
  timestamp: number;
  interfaces: Record<string, { rxBytes: number; txBytes: number }>;
}

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return "text-red-400";
  if (percent >= 70) return "text-amber-400";
  return "text-emerald-400";
}

function getUsageBarColor(percent: number): string {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function getUsageBgColor(percent: number): string {
  if (percent >= 90) return "bg-red-500/15";
  if (percent >= 70) return "bg-amber-500/15";
  return "bg-emerald-500/15";
}

// Circular gauge component
function CircularGauge({
  percent,
  size = 80,
  strokeWidth = 6,
  label,
  sublabel,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  sublabel?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent >= 90 ? "#ef4444" : percent >= 70 ? "#f59e0b" : "#10b981";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.08}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className={`text-lg font-bold ${getUsageColor(percent)}`}>
          {percent.toFixed(0)}%
        </span>
      </div>
      <span className="text-xs font-medium mt-1">{label}</span>
      {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
    </div>
  );
}

// Usage bar component
function UsageBar({ used, total, label, formatFn }: { used: number; total: number; label: string; formatFn: (v: number) => string }) {
  const percent = total > 0 ? (used / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-mono font-medium ${getUsageColor(percent)}`}>
          {formatFn(used)} / {formatFn(total)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
        <div
          className={`h-full rounded-full ${getUsageBarColor(percent)} transition-all duration-500`}
          style={{ width: `${Math.max(percent, 1)}%` }}
        />
      </div>
      <div className="text-[10px] text-muted-foreground/60 text-right">
        {percent.toFixed(1)}% &middot; {formatFn(total - used)} free
      </div>
    </div>
  );
}

// CPU load sparkline (tiny bar chart of the 3 load averages)
function LoadAvgBars({ loadAvg, cores }: { loadAvg: [number, number, number]; cores: number }) {
  const labels = ["1m", "5m", "15m"];
  return (
    <div className="flex items-end gap-2">
      {loadAvg.map((val, i) => {
        const pct = Math.min((val / cores) * 100, 100);
        return (
          <TooltipProvider key={i}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-center gap-0.5">
                  <div className="w-5 h-10 rounded-sm bg-muted/30 relative overflow-hidden">
                    <div
                      className={`absolute bottom-0 w-full rounded-sm ${getUsageBarColor(pct)} transition-all duration-500`}
                      style={{ height: `${Math.max(pct, 3)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground/60 font-mono">{labels[i]}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <div className="font-medium">{labels[i]} load: {val.toFixed(2)}</div>
                <div>{((val / cores) * 100).toFixed(0)}% of {cores} cores</div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

/** Collapsible section wrapper with localStorage persistence */
function CollapsibleSection({
  id,
  icon,
  iconColor,
  title,
  badge,
  summary,
  children,
  defaultOpen = true,
}: {
  id: string;
  icon: ReactNode;
  iconColor: string;
  title: string;
  badge?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const storageKey = `health-section-${id}`;
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = localStorage.getItem(storageKey);
    return stored !== null ? stored === "true" : defaultOpen;
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    localStorage.setItem(storageKey, String(next));
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card/30 overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
        className="w-full flex items-center gap-2 p-4 text-left hover:bg-muted/20 transition-colors cursor-pointer select-none"
      >
        <span className={iconColor}>{icon}</span>
        <h3 className="text-sm font-medium flex-1">{title}</h3>
        {!open && summary && (
          <span className="text-xs text-muted-foreground mr-2 hidden sm:flex items-center gap-2">
            {summary}
          </span>
        )}
        {badge}
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground/60 transition-transform duration-200 ${
            open ? "" : "-rotate-90"
          }`}
        />
      </div>
      {open && (
        <div className="px-4 pb-4">{children}</div>
      )}
    </div>
  );
}

/** Alert conditions detected from health data */
interface Alert {
  level: "critical" | "warn";
  label: string;
  detail: string;
}

function detectAlerts(data: HealthData): Alert[] {
  const alerts: Alert[] = [];
  const cpuUsed = 100 - data.cpu.idle;

  if (cpuUsed >= 90) {
    alerts.push({ level: "critical", label: "CPU Critical", detail: `${cpuUsed.toFixed(0)}% used` });
  } else if (cpuUsed >= 80) {
    alerts.push({ level: "warn", label: "CPU High", detail: `${cpuUsed.toFixed(0)}% used` });
  }

  if (data.memory.usedPercent >= 90) {
    alerts.push({ level: "critical", label: "Memory Critical", detail: `${data.memory.usedPercent.toFixed(0)}% used` });
  } else if (data.memory.usedPercent >= 80) {
    alerts.push({ level: "warn", label: "Memory High", detail: `${data.memory.usedPercent.toFixed(0)}% used` });
  }

  for (const disk of data.disks) {
    if (disk.usedPercent >= 90) {
      alerts.push({ level: "critical", label: `Disk ${disk.mountpoint}`, detail: `${disk.usedPercent}% full` });
    } else if (disk.usedPercent >= 80) {
      alerts.push({ level: "warn", label: `Disk ${disk.mountpoint}`, detail: `${disk.usedPercent}% full` });
    }
  }

  const downServices = data.services.filter(s => !s.active);
  if (downServices.length > 0) {
    alerts.push({
      level: "critical",
      label: `${downServices.length} service${downServices.length > 1 ? "s" : ""} down`,
      detail: downServices.map(s => s.name).join(", "),
    });
  }

  const loadRatio = data.cpu.loadAvg[0] / data.cpu.cores;
  if (loadRatio >= 2) {
    alerts.push({ level: "critical", label: "Load Average", detail: `${data.cpu.loadAvg[0].toFixed(1)} (${(loadRatio * 100).toFixed(0)}% of ${data.cpu.cores} cores)` });
  } else if (loadRatio >= 1) {
    alerts.push({ level: "warn", label: "Load Average", detail: `${data.cpu.loadAvg[0].toFixed(1)} (${(loadRatio * 100).toFixed(0)}% of ${data.cpu.cores} cores)` });
  }

  return alerts;
}

function AlertBanner({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;

  const critical = alerts.filter(a => a.level === "critical");
  const warnings = alerts.filter(a => a.level === "warn");

  return (
    <div data-testid="alert-banner" className="space-y-2">
      {critical.length > 0 && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-red-400">Critical</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
              {critical.map((a, i) => (
                <span key={i} className="text-xs text-red-300/80">
                  <span className="font-medium">{a.label}</span>{" "}
                  <span className="text-red-300/60">{a.detail}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-amber-400">Warning</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
              {warnings.map((a, i) => (
                <span key={i} className="text-xs text-amber-300/80">
                  <span className="font-medium">{a.label}</span>{" "}
                  <span className="text-amber-300/60">{a.detail}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tiny circular countdown showing time until next auto-refresh */
function RefreshCountdown({ lastRefresh, interval }: { lastRefresh: number; interval: number }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - lastRefresh;
      setProgress(Math.min(elapsed / interval, 1));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [lastRefresh, interval]);

  const size = 16;
  const sw = 2;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - progress * c;

  return (
    <svg width={size} height={size} className="-rotate-90 opacity-40" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={sw} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={sw}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-200"
      />
    </svg>
  );
}

export function SystemHealth() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number>(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [, setTick] = useState(0);
  const [networkRates, setNetworkRates] = useState<NetworkRate[]>([]);
  const prevNetworkRef = useRef<NetworkSnapshot | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setLastRefresh(Date.now());

      // Track history (last 30 data points)
      const cpuUsed = 100 - (json.cpu?.idle || 100);
      setCpuHistory((prev) => [...prev.slice(-29), cpuUsed]);
      setMemHistory((prev) => [...prev.slice(-29), json.memory?.usedPercent || 0]);

      // Calculate network throughput rates
      const now = Date.now();
      const currentSnapshot: NetworkSnapshot = {
        timestamp: now,
        interfaces: {},
      };
      for (const iface of json.network || []) {
        currentSnapshot.interfaces[iface.interface] = {
          rxBytes: iface.rxBytes,
          txBytes: iface.txBytes,
        };
      }
      const prev = prevNetworkRef.current;
      if (prev && now > prev.timestamp) {
        const elapsed = (now - prev.timestamp) / 1000;
        const rates: NetworkRate[] = [];
        for (const iface of json.network || []) {
          const prevIface = prev.interfaces[iface.interface];
          if (prevIface) {
            rates.push({
              interface: iface.interface,
              rxRate: Math.max(0, (iface.rxBytes - prevIface.rxBytes) / elapsed),
              txRate: Math.max(0, (iface.txBytes - prevIface.txBytes) / elapsed),
            });
          }
        }
        setNetworkRates(rates);
      }
      prevNetworkRef.current = currentSnapshot;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchHealth, 10000); // 10s refresh
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealth]);

  // Pause auto-refresh when tab hidden
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) return;
      fetchHealth(); // Refresh on tab return
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchHealth]);

  // Listen for global "r" key refresh event
  useEffect(() => {
    const handler = () => fetchHealth();
    window.addEventListener("refresh-view", handler);
    return () => window.removeEventListener("refresh-view", handler);
  }, [fetchHealth]);

  // Tick every second so "Updated Xs ago" counts up in real time
  useEffect(() => {
    if (lastRefresh === 0) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [lastRefresh]);

  if (loading && !data) {
    return (
      <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Loading system metrics...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 font-medium">Failed to load system metrics</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchHealth}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const cpuUsed = 100 - data.cpu.idle;

  return (
    <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
      {/* Connection error banner — shown when fetch fails but stale data is displayed */}
      {error && data && (
        <div className="mx-4 mt-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex items-center gap-2 text-xs">
          <RefreshCw className="h-3.5 w-3.5 text-amber-400 animate-spin flex-shrink-0" />
          <span className="text-amber-300">Connection lost — retrying...</span>
          <span className="text-muted-foreground/60 ml-auto">{error}</span>
        </div>
      )}
      <CardHeader className="pb-2 flex-shrink-0 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg font-semibold">System Health</CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono">
              {data.hostname}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {/* Refresh countdown ring */}
            {autoRefresh && lastRefresh > 0 && (
              <RefreshCountdown lastRefresh={lastRefresh} interval={10000} />
            )}
            <span className="text-[10px] text-muted-foreground/60">
              {lastRefresh > 0 && `Updated ${Math.round((Date.now() - lastRefresh) / 1000)}s ago`}
            </span>
            <Button
              variant={autoRefresh ? "secondary" : "ghost"}
              size="sm"
              className="text-xs h-7 px-2"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? "Auto" : "Paused"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={fetchHealth}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-4 space-y-4">
        {/* Alert Summary Banner */}
        <AlertBanner alerts={detectAlerts(data)} />

        {/* Overview Gauges — always visible */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border/50 bg-card/30 p-4 flex flex-col items-center">
            <div className="relative">
              <CircularGauge percent={cpuUsed} label="CPU" sublabel={`${data.cpu.cores} cores`} />
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/30 p-4 flex flex-col items-center">
            <div className="relative">
              <CircularGauge percent={data.memory.usedPercent} label="Memory" sublabel={formatMB(data.memory.totalMB)} />
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/30 p-4 flex flex-col items-center">
            {data.disks[0] ? (
              <div className="relative">
                <CircularGauge percent={data.disks[0].usedPercent} label="Disk" sublabel={formatMB(data.disks[0].sizeMB)} />
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">No disk data</div>
            )}
          </div>
          <div className="rounded-xl border border-border/50 bg-card/30 p-4 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg font-bold">{formatUptime(data.uptime)}</span>
            </div>
            <span className="text-xs font-medium mt-1">Uptime</span>
            <span className="text-[10px] text-muted-foreground">
              {data.docker.length} containers
            </span>
          </div>
        </div>

        {/* CPU & Memory Detail — collapsible */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CollapsibleSection
            id="cpu"
            icon={<Cpu className="h-4 w-4" />}
            iconColor="text-blue-400"
            title="CPU"
            summary={
              <>
                <span className={`font-mono ${getUsageColor(cpuUsed)}`}>{cpuUsed.toFixed(0)}%</span>
                <span className="text-muted-foreground/40">·</span>
                <span>Load {data.cpu.loadAvg[0].toFixed(1)}</span>
              </>
            }
          >
            <div className="flex items-center justify-end mb-3">
              <LoadAvgBars loadAvg={data.cpu.loadAvg} cores={data.cpu.cores} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">User</span>
                <span className="font-mono">{data.cpu.user.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${data.cpu.user}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">System</span>
                <span className="font-mono">{data.cpu.system.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                <div className="h-full rounded-full bg-purple-500 transition-all duration-500" style={{ width: `${data.cpu.system}%` }} />
              </div>
              {cpuHistory.length > 1 && (
                <div className="mt-2 pt-2 border-t border-border/30">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 mb-1">
                    <span>CPU history ({cpuHistory.length * 10}s)</span>
                    <span>{cpuUsed.toFixed(0)}% now</span>
                  </div>
                  <Sparkline data={cpuHistory} height={24} color="rgb(59 130 246)" />
                </div>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="memory"
            icon={<MemoryStick className="h-4 w-4" />}
            iconColor="text-emerald-400"
            title="Memory"
            summary={
              <>
                <span className={`font-mono ${getUsageColor(data.memory.usedPercent)}`}>{data.memory.usedPercent.toFixed(0)}%</span>
                <span className="text-muted-foreground/40">·</span>
                <span>{formatMB(data.memory.availableMB)} free</span>
              </>
            }
          >
            <UsageBar
              used={data.memory.usedMB}
              total={data.memory.totalMB}
              label="RAM"
              formatFn={formatMB}
            />
            {data.memory.swapTotalMB > 0 && (
              <div className="mt-3">
                <UsageBar
                  used={data.memory.swapUsedMB}
                  total={data.memory.swapTotalMB}
                  label="Swap"
                  formatFn={formatMB}
                />
              </div>
            )}
            {memHistory.length > 1 && (
              <div className="mt-2 pt-2 border-t border-border/30">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 mb-1">
                  <span>Memory history ({memHistory.length * 10}s)</span>
                  <span>{data.memory.usedPercent.toFixed(0)}% now</span>
                </div>
                <Sparkline data={memHistory} height={24} color="rgb(16 185 129)" />
              </div>
            )}
          </CollapsibleSection>
        </div>

        {/* Disks — collapsible */}
        {data.disks.length > 0 && (
          <CollapsibleSection
            id="disks"
            icon={<HardDrive className="h-4 w-4" />}
            iconColor="text-amber-400"
            title="Disk Usage"
            summary={
              <>
                {data.disks.map((d, i) => (
                  <span key={d.mountpoint}>
                    {i > 0 && <span className="text-muted-foreground/40 mx-1">·</span>}
                    <code className="text-[10px] font-mono">{d.mountpoint}</code>{" "}
                    <span className={`font-mono ${getUsageColor(d.usedPercent)}`}>{d.usedPercent}%</span>
                  </span>
                ))}
              </>
            }
          >
            <div className="space-y-3">
              {data.disks.map((disk) => (
                <div key={disk.mountpoint}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-2">
                      <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground font-mono">
                        {disk.mountpoint}
                      </code>
                      <span className="text-muted-foreground/60 text-[10px]">{disk.filesystem}</span>
                    </div>
                    <span className={`font-mono font-medium ${getUsageColor(disk.usedPercent)}`}>
                      {disk.usedPercent}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${getUsageBarColor(disk.usedPercent)} transition-all duration-500`}
                      style={{ width: `${Math.max(disk.usedPercent, 1)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {formatMB(disk.usedMB)} used of {formatMB(disk.sizeMB)} &middot; {formatMB(disk.availableMB)} free
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Docker & Services — collapsible side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CollapsibleSection
            id="docker"
            icon={<Container className="h-4 w-4" />}
            iconColor="text-cyan-400"
            title="Docker"
            badge={
              <Badge variant="outline" className="text-[10px]">
                {data.docker.length} running
              </Badge>
            }
            summary={
              <span>{data.docker.filter(c => c.state === "running").length} up</span>
            }
          >
            {data.docker.length === 0 ? (
              <p className="text-xs text-muted-foreground">No running containers</p>
            ) : (
              <div className="space-y-2">
                {data.docker.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs rounded-lg bg-muted/20 px-2.5 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        c.state === "running" ? "bg-emerald-500" : "bg-red-500"
                      }`} />
                      <span className="font-medium truncate">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[10px] text-muted-foreground/60 truncate max-w-[100px]">
                              {c.image.split(":")[0].split("/").pop()}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <div>Image: {c.image}</div>
                            <div>Status: {c.status}</div>
                            {c.ports && <div>Ports: {c.ports}</div>}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="services"
            icon={<Server className="h-4 w-4" />}
            iconColor="text-violet-400"
            title="Services"
            badge={
              <Badge variant="outline" className="text-[10px]">
                {data.services.filter((s) => s.active).length}/{data.services.length} active
              </Badge>
            }
            summary={
              <>
                {data.services.some(s => !s.active) && (
                  <span className="text-red-400 font-medium">
                    {data.services.filter(s => !s.active).length} down
                  </span>
                )}
              </>
            }
          >
            <div className="space-y-2">
              {data.services.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-xs rounded-lg bg-muted/20 px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    {s.active ? (
                      <CircleCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <CircleX className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                    )}
                    <span className="font-medium">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.uptime && (
                      <span className="text-[10px] text-muted-foreground/60">{s.uptime}</span>
                    )}
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1 py-0 ${
                        s.active
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-red-500/10 text-red-400 border-red-500/20"
                      }`}
                    >
                      {s.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>

        {/* Network — collapsible */}
        {data.network.length > 0 && (
          <CollapsibleSection
            id="network"
            icon={<Network className="h-4 w-4" />}
            iconColor="text-sky-400"
            title="Network"
            defaultOpen={false}
            summary={
              networkRates.length > 0 ? (
                <>
                  <span className="text-sky-400">
                    ↓ {formatRate(networkRates.reduce((s, r) => s + r.rxRate, 0))}
                  </span>
                  <span className="text-amber-400">
                    ↑ {formatRate(networkRates.reduce((s, r) => s + r.txRate, 0))}
                  </span>
                </>
              ) : undefined
            }
            badge={
              networkRates.length > 0 ? (
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground sm:hidden">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400" />
                    RX {formatRate(networkRates.reduce((s, r) => s + r.rxRate, 0))}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                    TX {formatRate(networkRates.reduce((s, r) => s + r.txRate, 0))}
                  </span>
                </div>
              ) : undefined
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/30">
                    <th className="text-left py-1.5 pr-3 font-medium">Interface</th>
                    <th className="text-right py-1.5 px-2 font-medium">RX Rate</th>
                    <th className="text-right py-1.5 px-2 font-medium">TX Rate</th>
                    <th className="text-right py-1.5 px-2 font-medium">RX Total</th>
                    <th className="text-right py-1.5 pl-2 font-medium">TX Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.network.map((n) => {
                    const rate = networkRates.find((r) => r.interface === n.interface);
                    return (
                      <tr key={n.interface} className="border-b border-border/10 hover:bg-muted/20">
                        <td className="py-1.5 pr-3 font-mono text-muted-foreground">{n.interface}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-sky-400">
                          {rate ? formatRate(rate.rxRate) : "—"}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-amber-400">
                          {rate ? formatRate(rate.txRate) : "—"}
                        </td>
                        <td className="py-1.5 px-2 text-right text-muted-foreground/60">{formatBytes(n.rxBytes)}</td>
                        <td className="py-1.5 pl-2 text-right text-muted-foreground/60">{formatBytes(n.txBytes)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        )}

        {/* Top Processes — collapsible, default closed, grouped by command */}
        {data.topProcesses.length > 0 && (
          <CollapsibleSection
            id="processes"
            icon={<Gauge className="h-4 w-4" />}
            iconColor="text-orange-400"
            title="Top Processes"
            defaultOpen={false}
            summary={
              <>
                <span>
                  Top: {data.topProcesses[0]?.command.split("/").pop()?.split(" ")[0] || "—"}
                </span>
                <span className={`font-mono ${data.topProcesses[0]?.cpu > 50 ? "text-red-400" : data.topProcesses[0]?.cpu > 10 ? "text-amber-400" : ""}`}>
                  {data.topProcesses[0]?.cpu.toFixed(1)}% CPU
                </span>
              </>
            }
          >
            <ProcessGroupView processes={data.topProcesses} />
          </CollapsibleSection>
        )}
      </CardContent>
    </Card>
  );
}

/** Extract a short base name from a command string */
function getProcessBaseName(command: string): string {
  // Strip path prefixes and get the executable name
  const parts = command.split(/\s+/);
  const exe = parts[0] || command;
  const base = exe.split("/").pop() || exe;
  // Group common variants: node, python, docker, etc.
  if (base.startsWith("node") || base === "npm" || base === "npx" || base === "tsx") return "node";
  if (base.startsWith("python") || base === "pip") return "python";
  if (base.startsWith("docker")) return "docker";
  if (base === "claude" || base.startsWith("claude-")) return "claude";
  if (base === "bash" || base === "sh" || base === "zsh") return "shell";
  return base;
}

const PROCESS_GROUP_COLORS: Record<string, string> = {
  node: "bg-green-500",
  python: "bg-yellow-500",
  docker: "bg-cyan-500",
  claude: "bg-purple-500",
  shell: "bg-gray-500",
};

function getProcessColor(name: string): string {
  return PROCESS_GROUP_COLORS[name] || "bg-orange-500";
}

interface ProcessGroup {
  name: string;
  totalCpu: number;
  totalMem: number;
  count: number;
  processes: Array<{ pid: number; user: string; cpu: number; mem: number; command: string }>;
}

/** Grouped process view — aggregates by base command name with visual CPU/MEM bars */
function ProcessGroupView({ processes }: { processes: Array<{ pid: number; user: string; cpu: number; mem: number; command: string }> }) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const groups: ProcessGroup[] = (() => {
    const map = new Map<string, ProcessGroup>();
    for (const p of processes) {
      const name = getProcessBaseName(p.command);
      const existing = map.get(name);
      if (existing) {
        existing.totalCpu += p.cpu;
        existing.totalMem += p.mem;
        existing.count++;
        existing.processes.push(p);
      } else {
        map.set(name, {
          name,
          totalCpu: p.cpu,
          totalMem: p.mem,
          count: 1,
          processes: [p],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalCpu - a.totalCpu);
  })();

  const maxCpu = Math.max(...groups.map(g => g.totalCpu), 1);

  return (
    <div className="space-y-1.5" data-testid="process-groups">
      {groups.map((group) => (
        <div key={group.name}>
          <button
            onClick={() => setExpandedGroup(expandedGroup === group.name ? null : group.name)}
            className="w-full flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/20 transition-colors text-left group"
          >
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getProcessColor(group.name)}`} />
            <span className="text-xs font-medium w-16 truncate">{group.name}</span>
            {group.count > 1 && (
              <span className="text-[10px] text-muted-foreground/50">×{group.count}</span>
            )}
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className={`h-full rounded-full ${getProcessColor(group.name)} transition-all duration-500`}
                  style={{ width: `${Math.max((group.totalCpu / maxCpu) * 100, 2)}%`, opacity: 0.7 }}
                />
              </div>
            </div>
            <span className={`text-xs font-mono w-14 text-right ${group.totalCpu > 50 ? "text-red-400" : group.totalCpu > 10 ? "text-amber-400" : "text-muted-foreground"}`}>
              {group.totalCpu.toFixed(1)}%
            </span>
            <span className={`text-xs font-mono w-14 text-right ${group.totalMem > 50 ? "text-red-400" : group.totalMem > 10 ? "text-amber-400" : "text-muted-foreground/60"}`}>
              {group.totalMem.toFixed(1)}%
            </span>
            <ChevronDown className={`h-3 w-3 text-muted-foreground/40 transition-transform ${expandedGroup === group.name ? "" : "-rotate-90"}`} />
          </button>
          {expandedGroup === group.name && (
            <div className="ml-6 mt-0.5 space-y-0.5 border-l border-border/30 pl-2">
              {group.processes.map((p) => (
                <div key={p.pid} className="flex items-center gap-2 text-[10px] text-muted-foreground/70 py-0.5">
                  <span className="font-mono w-12">{p.pid}</span>
                  <span className="w-12 truncate">{p.user}</span>
                  <span className={`font-mono w-10 text-right ${p.cpu > 50 ? "text-red-400" : p.cpu > 10 ? "text-amber-400" : ""}`}>
                    {p.cpu.toFixed(1)}%
                  </span>
                  <span className={`font-mono w-10 text-right ${p.mem > 50 ? "text-red-400" : p.mem > 10 ? "text-amber-400" : ""}`}>
                    {p.mem.toFixed(1)}%
                  </span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="font-mono truncate flex-1">{p.command}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[500px]">
                        <pre className="whitespace-pre-wrap break-all font-mono text-[10px]">{p.command}</pre>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {/* Column headers — subtle */}
      <div className="flex items-center gap-2 px-2 pt-1 text-[9px] text-muted-foreground/30 uppercase tracking-wider">
        <span className="w-2" />
        <span className="w-16">Process</span>
        <span className="w-6" />
        <span className="flex-1 text-center">CPU bar</span>
        <span className="w-14 text-right">CPU%</span>
        <span className="w-14 text-right">MEM%</span>
        <span className="w-3" />
      </div>
    </div>
  );
}

// Mini sparkline SVG
function Sparkline({ data, height = 24, color = "currentColor" }: { data: number[]; height?: number; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 200;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  });
  const areaPoints = [...points, `${w},${height}`, `0,${height}`];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none">
      <polygon points={areaPoints.join(" ")} fill={color} fillOpacity={0.1} />
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
