"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
        {/* Overview Gauges */}
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

        {/* CPU & Memory Detail */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border/50 bg-card/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-medium">CPU</h3>
              </div>
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
              {/* Mini sparkline */}
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
          </div>

          <div className="rounded-xl border border-border/50 bg-card/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <MemoryStick className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-medium">Memory</h3>
            </div>
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
            {/* Mini sparkline */}
            {memHistory.length > 1 && (
              <div className="mt-2 pt-2 border-t border-border/30">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 mb-1">
                  <span>Memory history ({memHistory.length * 10}s)</span>
                  <span>{data.memory.usedPercent.toFixed(0)}% now</span>
                </div>
                <Sparkline data={memHistory} height={24} color="rgb(16 185 129)" />
              </div>
            )}
          </div>
        </div>

        {/* Disks */}
        {data.disks.length > 0 && (
          <div className="rounded-xl border border-border/50 bg-card/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <HardDrive className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-medium">Disk Usage</h3>
            </div>
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
          </div>
        )}

        {/* Docker & Services row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Docker Containers */}
          <div className="rounded-xl border border-border/50 bg-card/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Container className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-medium">Docker</h3>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {data.docker.length} running
              </Badge>
            </div>
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
          </div>

          {/* Services */}
          <div className="rounded-xl border border-border/50 bg-card/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-medium">Services</h3>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {data.services.filter((s) => s.active).length}/{data.services.length} active
              </Badge>
            </div>
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
          </div>
        </div>

        {/* Network */}
        {data.network.length > 0 && (
          <div className="rounded-xl border border-border/50 bg-card/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4 text-sky-400" />
                <h3 className="text-sm font-medium">Network</h3>
              </div>
              {networkRates.length > 0 && (
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400" />
                    RX {formatRate(networkRates.reduce((s, r) => s + r.rxRate, 0))}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                    TX {formatRate(networkRates.reduce((s, r) => s + r.txRate, 0))}
                  </span>
                </div>
              )}
            </div>
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
          </div>
        )}

        {/* Top Processes */}
        {data.topProcesses.length > 0 && (
          <div className="rounded-xl border border-border/50 bg-card/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="h-4 w-4 text-orange-400" />
              <h3 className="text-sm font-medium">Top Processes</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/30">
                    <th className="text-left py-1.5 pr-3 font-medium">PID</th>
                    <th className="text-left py-1.5 px-2 font-medium">User</th>
                    <th className="text-right py-1.5 px-2 font-medium">CPU%</th>
                    <th className="text-right py-1.5 px-2 font-medium">MEM%</th>
                    <th className="text-left py-1.5 pl-2 font-medium">Command</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProcesses.map((p) => (
                    <tr key={p.pid} className="border-b border-border/10 hover:bg-muted/20">
                      <td className="py-1.5 pr-3 font-mono text-muted-foreground/60">{p.pid}</td>
                      <td className="py-1.5 px-2 text-muted-foreground">{p.user}</td>
                      <td className={`py-1.5 px-2 text-right font-mono ${p.cpu > 50 ? "text-red-400" : p.cpu > 10 ? "text-amber-400" : ""}`}>
                        {p.cpu.toFixed(1)}
                      </td>
                      <td className={`py-1.5 px-2 text-right font-mono ${p.mem > 50 ? "text-red-400" : p.mem > 10 ? "text-amber-400" : ""}`}>
                        {p.mem.toFixed(1)}
                      </td>
                      <td className="py-1.5 pl-2 font-mono text-[10px] text-muted-foreground truncate max-w-[200px] sm:max-w-[350px]">
                        {p.command}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
