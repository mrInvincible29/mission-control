"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  ExternalLink,
  Search,
  Server,
} from "lucide-react";

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

export function ServicesView() {
  const [services, setServices] = useState<ServiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [lastRefresh, setLastRefresh] = useState<number>(0);
  const [, setTick] = useState(0);

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

  const filtered = services.filter((svc) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      svc.name.toLowerCase().includes(q) ||
      svc.category.toLowerCase().includes(q) ||
      svc.url.toLowerCase().includes(q)
    );
  });

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
        {/* Filter bar */}
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Filter services..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-md border border-border/50 bg-muted/30 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/50"
          />
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((svc) => (
            <div
              key={svc.name}
              data-testid="service-card"
              className="rounded-xl border border-border/50 bg-card/30 p-4 flex flex-col gap-2 hover:bg-card/50 transition-colors"
            >
              {/* Header: name + status dot */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    data-testid="service-status-dot"
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[svc.status]}`}
                  />
                  <span className="font-medium text-sm truncate">{svc.name}</span>
                </div>
                {svc.responseTime !== null && (
                  <span className="text-[10px] text-muted-foreground/60 font-mono flex-shrink-0">
                    {svc.responseTime}ms
                  </span>
                )}
              </div>

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
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No services match &ldquo;{filter}&rdquo;
          </div>
        )}
      </CardContent>
    </Card>
  );
}
