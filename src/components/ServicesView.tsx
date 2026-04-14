"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RefreshCw,
  ExternalLink,
  Search,
  Server,
  Zap,
  ArrowUpDown,
  Shield,
  TrendingUp,
  Copy,
  Check,
  Clock3,
  Gauge,
  X,
  AlertTriangle,
  Activity,
  ChevronRight,
} from "lucide-react";
import { useServiceHistory, type PingResult } from "@/hooks/useServiceHistory";

interface ServiceData {
  name: string;
  url: string;
  port: number | null;
  category: string;
  status: "up" | "degraded" | "down";
  httpStatus: number | null;
  responseTime: number | null;
  systemd: string | null;
  systemdStatus: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  monitoring: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  finance: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  creative: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  core: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  media: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  ai: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

const STATUS_COLORS: Record<string, string> = {
  up: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
};

const PING_DOT_COLORS: Record<string, string> = {
  up: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
};

/** Tiny response time bar — uses log scale capped at 2000ms to prevent outlier distortion */
function ResponseBar({ ms, maxMs }: { ms: number; maxMs: number }) {
  const cappedMax = Math.min(maxMs, 2000);
  const cappedMs = Math.min(ms, cappedMax);
  const pct = cappedMax > 0 ? Math.max((cappedMs / cappedMax) * 100, 2) : 2;
  const color =
    ms < 100 ? "bg-emerald-500" : ms < 500 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-[10px] font-mono flex-shrink-0 ${
          ms < 100
            ? "text-emerald-400"
            : ms < 500
            ? "text-amber-400"
            : "text-red-400"
        }`}
      >
        {ms}ms
      </span>
    </div>
  );
}

/** StatusPage-style uptime dots — shows last N ping results as tiny colored squares */
function UptimeDots({ pings, maxDots = 20 }: { pings: PingResult[]; maxDots?: number }) {
  // Show the most recent pings, padded with empty slots on the left
  const visiblePings = pings.slice(-maxDots);
  const emptySlots = Math.max(0, maxDots - visiblePings.length);

  return (
    <div className="flex items-center gap-px" data-testid="uptime-dots">
      {/* Empty placeholder slots */}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="w-1.5 h-3 rounded-[1px] bg-muted/20"
        />
      ))}
      {/* Actual ping results */}
      {visiblePings.map((ping, i) => (
        <Tooltip key={`ping-${ping.ts}-${i}`}>
          <TooltipTrigger asChild>
            <div
              className={`w-1.5 h-3 rounded-[1px] transition-colors ${PING_DOT_COLORS[ping.status]} ${
                ping.status !== "up" ? "opacity-90" : "opacity-70"
              } hover:opacity-100 hover:scale-y-125 transition-transform`}
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[10px] py-1 px-2">
            <div className="space-y-0.5">
              <div className="font-medium capitalize">{ping.status}</div>
              {ping.responseTime !== null && <div>{ping.responseTime}ms</div>}
              <div className="text-muted-foreground" suppressHydrationWarning>
                {formatPingTime(ping.ts)}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/** Fleet uptime summary strip — shows overall availability with visual bar */
function FleetUptimeSummary({
  services,
  historyMap,
  fleetUptime,
  totalPings,
}: {
  services: ServiceData[];
  historyMap: Record<string, { uptimePercent: number; pings: PingResult[] }>;
  fleetUptime: number | null;
  totalPings: number;
}) {
  const upCount = services.filter((s) => s.status === "up").length;
  const degradedCount = services.filter((s) => s.status === "degraded").length;
  const downCount = services.filter((s) => s.status === "down").length;

  // Per-service uptime overview (sorted by uptime, worst first)
  const serviceUptimes = useMemo(() => {
    return services
      .map((svc) => {
        const history = historyMap[svc.name];
        return {
          name: svc.name,
          status: svc.status,
          uptimePercent: history?.uptimePercent ?? (svc.status === "up" ? 100 : 0),
          pingCount: history?.pings.length ?? 0,
        };
      })
      .sort((a, b) => a.uptimePercent - b.uptimePercent);
  }, [services, historyMap]);

  const worstServices = serviceUptimes.filter((s) => s.uptimePercent < 100);

  return (
    <div
      className="rounded-lg border border-border/40 bg-card/20 p-3 space-y-2"
      data-testid="fleet-uptime-summary"
    >
      {/* Top row: status counts + uptime % */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-xs font-medium">Fleet Status</span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            {upCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-emerald-400 font-mono">{upCount}</span>
                <span className="text-muted-foreground/50">up</span>
              </span>
            )}
            {degradedCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span className="text-amber-400 font-mono">{degradedCount}</span>
                <span className="text-muted-foreground/50">degraded</span>
              </span>
            )}
            {downCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span className="text-red-400 font-mono">{downCount}</span>
                <span className="text-muted-foreground/50">down</span>
              </span>
            )}
          </div>
        </div>

        {fleetUptime !== null && totalPings >= 2 && (
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-muted-foreground/40" />
            <span
              className={`text-xs font-mono font-semibold ${
                fleetUptime >= 99
                  ? "text-emerald-400"
                  : fleetUptime >= 95
                  ? "text-amber-400"
                  : "text-red-400"
              }`}
              data-testid="fleet-uptime-percent"
            >
              {fleetUptime}%
            </span>
            <span className="text-[10px] text-muted-foreground/40">
              uptime ({totalPings} checks)
            </span>
          </div>
        )}
      </div>

      {/* Fleet availability bar */}
      {services.length > 0 && (
        <div className="flex gap-px h-1.5 rounded-full overflow-hidden" data-testid="fleet-bar">
          {serviceUptimes.map((svc) => (
            <Tooltip key={svc.name}>
              <TooltipTrigger asChild>
                <div
                  className={`h-full flex-1 transition-colors ${STATUS_COLORS[svc.status]} ${
                    svc.status === "up" ? "opacity-60" : "opacity-90"
                  } hover:opacity-100`}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[10px] py-1 px-2">
                <div className="font-medium">{svc.name}</div>
                <div className="capitalize text-muted-foreground">{svc.status}</div>
                {svc.pingCount >= 2 && (
                  <div className="text-muted-foreground">{svc.uptimePercent}% uptime</div>
                )}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}

      {/* Services with less than 100% uptime */}
      {worstServices.length > 0 && totalPings >= 2 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
          {worstServices.slice(0, 5).map((svc) => (
            <span key={svc.name} className="flex items-center gap-1">
              <span className={`w-1 h-1 rounded-full ${svc.uptimePercent >= 90 ? "bg-amber-500" : "bg-red-500"}`} />
              <span className="text-muted-foreground">{svc.name}</span>
              <span className={`font-mono ${svc.uptimePercent >= 90 ? "text-amber-400/70" : "text-red-400/70"}`}>
                {svc.uptimePercent}%
              </span>
            </span>
          ))}
          {worstServices.length > 5 && (
            <span className="text-muted-foreground/40">+{worstServices.length - 5} more</span>
          )}
        </div>
      )}
    </div>
  );
}

function formatPingTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ServicesView() {
  const [services, setServices] = useState<ServiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "attention" | "healthy" | "slow">("all");
  const [lastRefresh, setLastRefresh] = useState<number>(0);
  const [sortBy, setSortBy] = useState<"priority" | "name" | "status" | "response">("status");
  const [selectedService, setSelectedService] = useState<ServiceData | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [, setTick] = useState(0);
  const hasActiveFilters = filter.trim().length > 0 || categoryFilter !== "" || statusFilter !== "all";

  const { historyMap, recordPings, fleetUptime, totalPings } = useServiceHistory();

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch("/api/services");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setServices(data);
      setError(null);
      setLastRefresh(Date.now());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  // Record pings whenever services data updates
  useEffect(() => {
    if (services.length > 0) {
      recordPings(services);
    }
  }, [services, recordPings]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(fetchServices, 60000);
    return () => clearInterval(interval);
  }, [fetchServices]);

  // Listen for global "r" key refresh event
  useEffect(() => {
    const handler = () => fetchServices();
    window.addEventListener("refresh-view", handler);
    return () => window.removeEventListener("refresh-view", handler);
  }, [fetchServices]);

  // Tick every second for "Updated Xs ago"
  useEffect(() => {
    if (lastRefresh === 0) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [lastRefresh]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(services.map((s) => s.category))).sort();
    return cats;
  }, [services]);

  const maxResponseTime = useMemo(() => {
    const times = services.map((s) => s.responseTime ?? 0);
    return Math.max(...times, 1);
  }, [services]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, { total: number; up: number }> = {};
    for (const svc of services) {
      if (!counts[svc.category]) counts[svc.category] = { total: 0, up: 0 };
      counts[svc.category].total++;
      if (svc.status === "up") counts[svc.category].up++;
    }
    return counts;
  }, [services]);

  const serviceFlags = useMemo(() => {
    return Object.fromEntries(
      services.map((svc) => {
        const history = historyMap[svc.name];
        const uptimePercent = history?.uptimePercent;
        const hasAttention =
          svc.status !== "up" ||
          (uptimePercent !== undefined && uptimePercent < 99) ||
          (svc.responseTime !== null && svc.responseTime >= 500);
        const isSlow = svc.responseTime !== null && svc.responseTime >= 500;
        const isHealthy = svc.status === "up" && !hasAttention;
        return [svc.name, { hasAttention, isSlow, isHealthy }];
      })
    ) as Record<string, { hasAttention: boolean; isSlow: boolean; isHealthy: boolean }>;
  }, [services, historyMap]);

  const statusCounts = useMemo(() => {
    return services.reduce(
      (acc, svc) => {
        const flags = serviceFlags[svc.name];
        if (flags?.hasAttention) acc.attention += 1;
        if (flags?.isHealthy) acc.healthy += 1;
        if (flags?.isSlow) acc.slow += 1;
        return acc;
      },
      { attention: 0, healthy: 0, slow: 0 }
    );
  }, [services, serviceFlags]);

  const serviceInsights = useMemo(() => {
    return Object.fromEntries(
      services.map((svc) => {
        const history = historyMap[svc.name];
        const uptimePercent = history?.uptimePercent;
        const latency = svc.responseTime ?? 0;
        const severity =
          (svc.status === "down" ? 300 : svc.status === "degraded" ? 180 : 0) +
          (uptimePercent !== undefined ? Math.max(0, 100 - uptimePercent) * 2 : 0) +
          Math.min(latency / 10, 80);

        const reason =
          svc.status === "down"
            ? "service unreachable"
            : svc.status === "degraded"
              ? "service degraded"
              : latency >= 1000
                ? `latency ${latency}ms`
                : latency >= 500
                  ? `latency ${latency}ms`
                  : uptimePercent !== undefined && uptimePercent < 99
                    ? `${uptimePercent}% uptime`
                    : null;

        const label =
          svc.status === "down"
            ? "Down"
            : svc.status === "degraded"
              ? "Degraded"
              : latency >= 1000
                ? "Very slow"
                : latency >= 500
                  ? "Slow"
                  : uptimePercent !== undefined && uptimePercent < 99
                    ? "Flaky"
                    : "Healthy";

        return [svc.name, { uptimePercent, latency, severity, reason, label }];
      })
    ) as Record<string, { uptimePercent?: number; latency: number; severity: number; reason: string | null; label: string }>;
  }, [services, historyMap]);

  const attentionQueue = useMemo(() => {
    return services
      .map((svc) => ({
        ...svc,
        ...serviceInsights[svc.name],
      }))
      .filter((svc) => svc.reason)
      .sort((a, b) => b.severity - a.severity || a.name.localeCompare(b.name))
      .slice(0, 4);
  }, [services, serviceInsights]);

  const filtered = useMemo(() => {
    const statusOrder = { down: 0, degraded: 1, up: 2 };
    return services
      .filter((svc) => {
        if (categoryFilter && svc.category !== categoryFilter) return false;

        const flags = serviceFlags[svc.name];
        if (statusFilter === "attention" && !flags?.hasAttention) return false;
        if (statusFilter === "healthy" && !flags?.isHealthy) return false;
        if (statusFilter === "slow" && !flags?.isSlow) return false;

        if (!filter.trim()) return true;
        const q = filter.toLowerCase();
        return (
          svc.name.toLowerCase().includes(q) ||
          svc.category.toLowerCase().includes(q) ||
          svc.url.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "response") return (a.responseTime ?? 9999) - (b.responseTime ?? 9999);
        if (sortBy === "priority") {
          const aSeverity = serviceInsights[a.name]?.severity ?? 0;
          const bSeverity = serviceInsights[b.name]?.severity ?? 0;
          return bSeverity - aSeverity || statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name);
        }
        // status: down first, then degraded, then up
        return statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name);
      });
  }, [services, categoryFilter, statusFilter, filter, sortBy, serviceFlags, serviceInsights]);

  const upCount = services.filter((s) => s.status === "up").length;
  const selectedHistory = selectedService ? historyMap[selectedService.name] : undefined;
  const selectedPings = selectedHistory?.pings ?? [];

  const handleCopyUrl = useCallback(async () => {
    if (!selectedService) return;
    try {
      await navigator.clipboard.writeText(selectedService.url);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      setCopiedUrl(false);
    }
  }, [selectedService]);

  useEffect(() => {
    setCopiedUrl(false);
  }, [selectedService]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === "/") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>("[data-testid='service-filter-input']");
        input?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (loading && services.length === 0) {
    return (
      <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Checking services...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && services.length === 0) {
    return (
      <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 font-medium">Failed to load services</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchServices}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
        {error && services.length > 0 && (
          <div className="mx-4 mt-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex items-center gap-2 text-xs">
            <RefreshCw className="h-3.5 w-3.5 text-amber-400 animate-spin flex-shrink-0" />
            <span className="text-amber-300">Connection lost — retrying...</span>
            <span className="text-muted-foreground/60 ml-auto">{error}</span>
          </div>
        )}
        <CardHeader className="pb-2 flex-shrink-0 px-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg font-semibold">Services Directory</CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {upCount}/{services.length} up
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/60">
                {lastRefresh > 0 && `Updated ${Math.round((Date.now() - lastRefresh) / 1000)}s ago`}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={fetchServices}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {/* Fleet Uptime Summary */}
          <div className="mt-3 space-y-3">
            <FleetUptimeSummary
              services={services}
              historyMap={historyMap}
              fleetUptime={fleetUptime}
              totalPings={totalPings}
            />

            {attentionQueue.length > 0 && (
              <div
                className="rounded-lg border border-amber-500/20 bg-amber-500/8 p-3"
                data-testid="services-attention-queue"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-medium text-amber-200">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                      Needs attention now
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Prioritized from live status, latency, and recent uptime.
                    </p>
                  </div>
                  <button
                    onClick={() => setStatusFilter("attention")}
                    className="inline-flex items-center gap-1 self-start rounded-full border border-amber-500/20 bg-background/70 px-2.5 py-1 text-[10px] font-medium text-amber-300 transition-colors hover:border-amber-400/30 hover:text-amber-200"
                  >
                    Focus attention
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {attentionQueue.map((svc) => (
                    <button
                      key={svc.name}
                      type="button"
                      onClick={() => setSelectedService(svc)}
                      className="rounded-lg border border-border/40 bg-background/60 p-2.5 text-left transition-colors hover:border-amber-400/30 hover:bg-background"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[svc.status]}`} />
                        <span className="truncate text-xs font-medium text-foreground">{svc.name}</span>
                        <span className="ml-auto rounded-full bg-muted/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                          {svc.status}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Activity className="h-3 w-3 text-amber-400/80" />
                        <span className="truncate">{svc.reason}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                        {svc.responseTime !== null && <span>{svc.responseTime}ms</span>}
                        {svc.uptimePercent !== undefined && <span>{svc.uptimePercent}% uptime</span>}
                        <span className="capitalize">{svc.category}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Filter bar */}
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 z-10" />
            <Input
              placeholder="Filter services by name, category, or URL..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8 pr-16 h-8 text-xs bg-muted/30"
              data-testid="service-filter-input"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-muted-foreground/50">
              {filter.trim() && (
                <button
                  onClick={() => setFilter("")}
                  className="rounded p-0.5 hover:bg-muted/60 hover:text-foreground transition-colors"
                  aria-label="Clear service filter"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              <kbd className="hidden sm:inline rounded border border-border/40 bg-background/60 px-1 py-0.5 font-mono text-[9px]">
                /
              </kbd>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]" data-testid="services-filter-summary">
            <span className="rounded-full border border-border/40 bg-muted/30 px-2.5 py-1 text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {services.length}
            </span>
            {statusFilter !== "all" && (
              <button
                onClick={() => setStatusFilter("all")}
                className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-background/70 px-2.5 py-1 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                Status: <span className="font-medium text-foreground">{statusFilter === "attention" ? "Needs attention" : statusFilter}</span>
                <X className="h-3 w-3" />
              </button>
            )}
            {categoryFilter && (
              <button
                onClick={() => setCategoryFilter("")}
                className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-background/70 px-2.5 py-1 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                Category: <span className="font-medium text-foreground">{categoryFilter}</span>
                <X className="h-3 w-3" />
              </button>
            )}
            {filter.trim() && (
              <button
                onClick={() => setFilter("")}
                className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-background/70 px-2.5 py-1 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors max-w-full"
              >
                <span className="truncate">Search: <span className="font-medium text-foreground">{filter.trim()}</span></span>
                <X className="h-3 w-3 shrink-0" />
              </button>
            )}
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setFilter("");
                  setCategoryFilter("");
                  setStatusFilter("all");
                }}
                className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary hover:bg-primary/15 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Sort + triage + category filter pills */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <div className="flex items-center gap-1 mr-1">
              {[
                { key: "all", label: "All", count: services.length },
                { key: "attention", label: "Needs attention", count: statusCounts.attention },
                { key: "healthy", label: "Healthy", count: statusCounts.healthy },
                { key: "slow", label: "Slow", count: statusCounts.slow },
              ].map((option) => (
                <button
                  key={option.key}
                  onClick={() => setStatusFilter(option.key as typeof statusFilter)}
                  data-testid={`status-filter-${option.key}`}
                  className={`text-[10px] rounded-full px-2.5 py-0.5 border transition-colors ${
                    statusFilter === option.key
                      ? option.key === "attention"
                        ? "bg-red-500/10 text-red-400 border-red-500/30 font-medium"
                        : option.key === "slow"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/30 font-medium"
                          : "bg-primary/15 text-primary border-primary/30 font-medium"
                      : "bg-muted/30 text-muted-foreground border-border/40 hover:bg-muted/50"
                  }`}
                >
                  {option.label}
                  <span className={`ml-1 ${statusFilter === option.key ? "text-current/70" : "text-muted-foreground/50"}`}>
                    {option.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-border/40 hidden sm:block" />

            {/* Sort toggle */}
            <div className="flex items-center gap-1 mr-1">
              <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
              {(["priority", "status", "name", "response"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  data-testid={`sort-${s}`}
                  className={`text-[10px] rounded-full px-2 py-0.5 border transition-colors capitalize ${
                    sortBy === s
                      ? "bg-primary/15 text-primary border-primary/30 font-medium"
                      : "bg-muted/30 text-muted-foreground border-border/40 hover:bg-muted/50"
                  }`}
                >
                  {s === "response" ? "speed" : s === "priority" ? "priority" : s}
                </button>
              ))}
            </div>

            {/* Separator */}
            <div className="h-4 w-px bg-border/40 hidden sm:block" />

            {/* Category filter pills with counts */}
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setCategoryFilter("")}
                  className={`text-[10px] rounded-full px-2.5 py-0.5 border transition-colors ${
                    categoryFilter === ""
                      ? "bg-primary/15 text-primary border-primary/30 font-medium"
                      : "bg-muted/30 text-muted-foreground border-border/40 hover:bg-muted/50"
                  }`}
                >
                  All <span className="text-muted-foreground/50 ml-0.5">{services.length}</span>
                </button>
                {categories.map((cat) => {
                  const cc = categoryCounts[cat];
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(categoryFilter === cat ? "" : cat)}
                      className={`text-[10px] rounded-full px-2.5 py-0.5 border transition-colors capitalize ${
                        categoryFilter === cat
                          ? `${CATEGORY_COLORS[cat] || "bg-muted/50 text-muted-foreground"} font-medium`
                          : "bg-muted/30 text-muted-foreground border-border/40 hover:bg-muted/50"
                      }`}
                    >
                      {cat}{" "}
                      <span className={cc && cc.up < cc.total ? "text-red-400/70" : "text-muted-foreground/50"}>
                        {cc ? `${cc.up}/${cc.total}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((svc) => {
              const history = historyMap[svc.name];
              const pings = history?.pings ?? [];
              const uptimePercent = history?.uptimePercent;
              const insight = serviceInsights[svc.name];

              return (
                <div
                  key={svc.name}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedService(svc)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedService(svc);
                    }
                  }}
                  data-testid="service-card"
                  className="rounded-xl border border-border/50 bg-card/30 p-4 flex flex-col gap-2 hover:bg-card/50 hover:border-border/80 transition-colors text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {/* Header: name + status dot */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      data-testid="service-status-dot"
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[svc.status]}`}
                    />
                    <span className="font-medium text-sm truncate">{svc.name}</span>
                    {svc.status === "up" && (
                      <span className="ml-auto shrink-0">
                        <Zap className="h-3 w-3 text-emerald-400/60" />
                      </span>
                    )}
                    {/* Uptime % badge (only if we have enough history) */}
                    {uptimePercent !== undefined && pings.length >= 2 && (
                      <span
                        className={`ml-auto text-[9px] font-mono ${
                          uptimePercent >= 99
                            ? "text-emerald-400/60"
                            : uptimePercent >= 90
                            ? "text-amber-400/70"
                            : "text-red-400/70"
                        }`}
                      >
                        {uptimePercent}%
                      </span>
                    )}
                  </div>

                  {insight?.reason && (
                    <div className="flex items-center gap-1.5 text-[10px]" data-testid="service-priority-badge">
                      <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-medium ${
                        svc.status === "down"
                          ? "border-red-500/30 bg-red-500/10 text-red-300"
                          : svc.status === "degraded"
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                            : "border-amber-500/20 bg-amber-500/5 text-amber-200"
                      }`}>
                        {insight.label}
                      </span>
                      <span className="truncate text-muted-foreground">{insight.reason}</span>
                    </div>
                  )}

                  {/* Uptime dots — StatusPage style */}
                  {pings.length > 0 && (
                    <UptimeDots pings={pings} maxDots={20} />
                  )}

                  {/* Response time bar */}
                  {svc.responseTime !== null ? (
                    <ResponseBar ms={svc.responseTime} maxMs={maxResponseTime} />
                  ) : (
                    <div className="text-[10px] text-muted-foreground/40 italic">
                      {svc.status === "down" ? "unreachable" : "no timing"}
                    </div>
                  )}

                  {/* URL */}
                  <a
                    href={svc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary truncate"
                  >
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{svc.url.replace("https://", "")}</span>
                  </a>

                  {/* Footer: badges */}
                  <div className="flex items-center gap-1.5 flex-wrap mt-auto">
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 ${CATEGORY_COLORS[svc.category] || "bg-muted/50 text-muted-foreground"}`}
                    >
                      {svc.category}
                    </Badge>
                    {svc.systemd && svc.systemdStatus && (
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 ${
                          svc.systemdStatus === "active"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border-red-500/20"
                        }`}
                      >
                        <Server className="h-2.5 w-2.5 mr-0.5" />
                        {svc.systemdStatus}
                      </Badge>
                    )}
                    {svc.port && (
                      <span className="text-[9px] text-muted-foreground/50 font-mono">
                        :{svc.port}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {filter.trim()
                ? <>No services match &ldquo;{filter}&rdquo;</>
                : categoryFilter
                  ? <>No services in category &ldquo;{categoryFilter}&rdquo;</>
                  : statusFilter !== "all"
                    ? <>No services match the &ldquo;{statusFilter === "attention" ? "needs attention" : statusFilter}&rdquo; filter</>
                    : "No services found"}
            </div>
          )}
        </CardContent>

        <Dialog open={selectedService !== null} onOpenChange={(open) => !open && setSelectedService(null)}>
          <DialogContent className="sm:max-w-lg">
            {selectedService && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[selectedService.status]}`} />
                    <span>{selectedService.name}</span>
                    <Badge variant="outline" className={`ml-auto text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[selectedService.category] || "bg-muted/50 text-muted-foreground"}`}>
                      {selectedService.category}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5">
                      <div className="text-[10px] text-muted-foreground">Status</div>
                      <div className="mt-1 text-sm font-medium capitalize">{selectedService.status}</div>
                    </div>
                    <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5">
                      <div className="text-[10px] text-muted-foreground">Response</div>
                      <div className="mt-1 text-sm font-medium">{selectedService.responseTime !== null ? `${selectedService.responseTime}ms` : "n/a"}</div>
                    </div>
                    <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5">
                      <div className="text-[10px] text-muted-foreground">HTTP</div>
                      <div className="mt-1 text-sm font-medium">{selectedService.httpStatus ?? "n/a"}</div>
                    </div>
                    <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5">
                      <div className="text-[10px] text-muted-foreground">Port</div>
                      <div className="mt-1 text-sm font-medium">{selectedService.port ?? "n/a"}</div>
                    </div>
                  </div>

                  {serviceInsights[selectedService.name]?.reason && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/8 p-3 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-medium text-amber-200">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                        Why this service is bubbling up
                      </div>
                      <div className="text-sm text-foreground">{serviceInsights[selectedService.name]?.label}</div>
                      <div className="text-[11px] text-muted-foreground">{serviceInsights[selectedService.name]?.reason}</div>
                    </div>
                  )}

                  <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60" />
                        <span className="text-xs truncate">{selectedService.url}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleCopyUrl}>
                          {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
                          <a href={selectedService.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </div>
                    </div>
                    {selectedService.responseTime !== null && (
                      <ResponseBar ms={selectedService.responseTime} maxMs={maxResponseTime} />
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <Gauge className="h-3.5 w-3.5 text-muted-foreground/60" />
                        Recent uptime
                      </div>
                      {selectedPings.length > 0 ? (
                        <>
                          <UptimeDots pings={selectedPings} maxDots={20} />
                          <div className="text-[11px] text-muted-foreground">
                            {selectedHistory?.uptimePercent ?? 0}% over {selectedPings.length} checks
                          </div>
                        </>
                      ) : (
                        <div className="text-[11px] text-muted-foreground">No history yet</div>
                      )}
                    </div>

                    <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <Clock3 className="h-3.5 w-3.5 text-muted-foreground/60" />
                        Runtime details
                      </div>
                      <div className="space-y-1.5 text-[11px] text-muted-foreground">
                        <div className="flex items-center justify-between gap-2">
                          <span>Systemd</span>
                          <span className="font-medium text-foreground/80">{selectedService.systemd ?? "none"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span>Service state</span>
                          <span className="font-medium capitalize text-foreground/80">{selectedService.systemdStatus ?? "n/a"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span>Last refresh</span>
                          <span className="font-medium text-foreground/80">{lastRefresh > 0 ? formatRelativeTime(lastRefresh) : "n/a"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </Card>
    </TooltipProvider>
  );
}
