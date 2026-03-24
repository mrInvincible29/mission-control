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
  RefreshCw,
  ExternalLink,
  Search,
  Server,
  Zap,
  ArrowUpDown,
  Shield,
  TrendingUp,
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

export function ServicesView() {
  const [services, setServices] = useState<ServiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [lastRefresh, setLastRefresh] = useState<number>(0);
  const [sortBy, setSortBy] = useState<"name" | "status" | "response">("status");
  const [, setTick] = useState(0);

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

  const filtered = useMemo(() => {
    const statusOrder = { down: 0, degraded: 1, up: 2 };
    return services
      .filter((svc) => {
        if (categoryFilter && svc.category !== categoryFilter) return false;
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
        // status: down first, then degraded, then up
        return statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name);
      });
  }, [services, categoryFilter, filter, sortBy]);

  const upCount = services.filter((s) => s.status === "up").length;

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
          <div className="mt-3">
            <FleetUptimeSummary
              services={services}
              historyMap={historyMap}
              fleetUptime={fleetUptime}
              totalPings={totalPings}
            />
          </div>

          {/* Filter bar */}
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 z-10" />
            <Input
              placeholder="Filter services..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8 h-8 text-xs bg-muted/30"
            />
          </div>

          {/* Sort + Category filter pills */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {/* Sort toggle */}
            <div className="flex items-center gap-1 mr-1">
              <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
              {(["status", "name", "response"] as const).map((s) => (
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
                  {s === "response" ? "speed" : s}
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

              return (
                <div
                  key={svc.name}
                  data-testid="service-card"
                  className="rounded-xl border border-border/50 bg-card/30 p-4 flex flex-col gap-2 hover:bg-card/50 transition-colors"
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
                  : "No services found"}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
