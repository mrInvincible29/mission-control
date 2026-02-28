"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Timer,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  History,
  Filter,
  CalendarDays,
  Search,
  X,
  Copy,
  Check,
  ArrowRight,
} from "lucide-react";

interface CronRun {
  ts: number;
  jobId: string;
  jobName?: string;
  action: string;
  status: string;
  summary?: string;
  sessionId?: string;
  runAtMs?: number;
  durationMs?: number;
  nextRunAtMs?: number;
}

interface JobInfo {
  id: string;
  name: string;
  model?: string;
  enabled?: boolean;
  schedule?: { kind: string; expr?: string; tz?: string };
  stats: {
    total: number;
    ok: number;
    error: number;
    avgDuration: number;
    lastRun: number;
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatCountdown(futureMs: number): string | null {
  const diff = futureMs - Date.now();
  if (diff <= 0) return null;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "< 1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function getModelColor(model?: string): string {
  if (!model) return "bg-gray-500";
  const m = model.toLowerCase();
  if (m.includes("haiku")) return "bg-green-500";
  if (m.includes("sonnet")) return "bg-blue-500";
  if (m.includes("opus")) return "bg-purple-500";
  return "bg-gray-500";
}

function getModelLabel(model?: string): string {
  if (!model) return "Unknown";
  const m = model.toLowerCase();
  if (m.includes("haiku")) return "Haiku";
  if (m.includes("sonnet")) return "Sonnet";
  if (m.includes("opus")) return "Opus";
  return model.split("/").pop() || model;
}

// Sparkline bar chart for run history — visible on all screen sizes
function RunSparkline({ runs, compact }: { runs: CronRun[]; compact?: boolean }) {
  const recent = runs.slice(0, 14).reverse();
  if (recent.length === 0) return null;

  const maxDuration = Math.max(...recent.map((r) => r.durationMs || 0), 1);
  const barHeight = compact ? 16 : 24;

  return (
    <div className={`flex items-end gap-[2px]`} style={{ height: `${barHeight}px` }}>
      {recent.map((run, i) => {
        const height = run.durationMs
          ? Math.max(3, (run.durationMs / maxDuration) * barHeight)
          : 3;
        return (
          <div
            key={i}
            className={`${compact ? "w-1" : "w-1.5"} rounded-t-sm transition-all ${
              run.status === "ok"
                ? "bg-emerald-500/70"
                : "bg-red-500/70"
            }`}
            style={{ height: `${height}px` }}
            title={`${formatDateTime(run.ts)} — ${formatDuration(run.durationMs || 0)} — ${run.status}`}
          />
        );
      })}
    </div>
  );
}

// Duration comparison bar — shows latest run vs average
function DurationBar({ latestMs, avgMs }: { latestMs: number; avgMs: number }) {
  if (avgMs <= 0 || latestMs <= 0) return null;

  const ratio = latestMs / avgMs;
  const pct = Math.min(ratio, 2) / 2; // Normalize to 0-1, cap at 2x
  const isFaster = ratio < 0.85;
  const isSlower = ratio > 1.15;

  return (
    <div className="flex items-center gap-1.5" title={`Latest: ${formatDuration(latestMs)} / Avg: ${formatDuration(avgMs)}`}>
      <div className="w-16 h-1.5 rounded-full bg-muted/50 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isFaster ? "bg-emerald-500/70" : isSlower ? "bg-amber-500/70" : "bg-blue-500/50"
          }`}
          style={{ width: `${Math.max(8, pct * 100)}%` }}
        />
      </div>
      <span className={`text-[10px] tabular-nums ${
        isFaster ? "text-emerald-400" : isSlower ? "text-amber-400" : "text-muted-foreground"
      }`}>
        {ratio < 0.01 ? "<0.01x" : `${ratio.toFixed(1)}x`}
      </span>
    </div>
  );
}

// Success rate ring
function SuccessRing({ ok, total }: { ok: number; total: number }) {
  const pct = total > 0 ? (ok / total) * 100 : 0;
  const r = 14;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="flex-shrink-0">
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="currentColor"
        className="text-muted/30"
        strokeWidth="3"
      />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="currentColor"
        className={pct >= 90 ? "text-emerald-500" : pct >= 70 ? "text-amber-500" : "text-red-500"}
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
      <text
        x="18"
        y="18"
        textAnchor="middle"
        dy="0.35em"
        className="fill-current text-foreground"
        fontSize="8"
        fontWeight="600"
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

// Copy button with temporary "Copied!" feedback
function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      aria-label={label || "Copy to clipboard"}
      title={label || "Copy to clipboard"}
    >
      {copied ? (
        <Check className="size-3 text-emerald-400" />
      ) : (
        <Copy className="size-3" />
      )}
    </button>
  );
}

type SortMode = "recent" | "name" | "runs" | "success";

export function CronHistory() {
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<CronRun | null>(null);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [statusFilter, setStatusFilter] = useState<"all" | "ok" | "error">("all");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastRefresh, setLastRefresh] = useState(0);
  const [, setTick] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchRuns = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("limit", "500");
      if (selectedJobId) params.set("jobId", selectedJobId);

      const res = await fetch(`/api/cron-runs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRuns(data.runs || []);
      setJobs(data.jobs || []);
      setError(null);
      setLastRefresh(Date.now());
    } catch (err) {
      console.error("Failed to fetch cron runs:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [selectedJobId]);

  // Initial fetch
  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchRuns, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchRuns]);

  // Refresh data when tab becomes visible again
  useEffect(() => {
    const handler = () => {
      if (!document.hidden) fetchRuns();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [fetchRuns]);

  // Listen for global "r" key refresh event
  useEffect(() => {
    const handler = () => fetchRuns();
    window.addEventListener("refresh-view", handler);
    return () => window.removeEventListener("refresh-view", handler);
  }, [fetchRuns]);

  // "Updated Xs ago" ticker
  useEffect(() => {
    if (lastRefresh === 0) return;
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [lastRefresh]);

  // Countdown ticker — re-render every 60s to update next run countdowns
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  // Group runs by job
  const runsByJob = useMemo(() => {
    const map: Record<string, CronRun[]> = {};
    for (const run of runs) {
      if (!map[run.jobId]) map[run.jobId] = [];
      map[run.jobId].push(run);
    }
    return map;
  }, [runs]);

  // Get next run time for each job (from the most recent run's nextRunAtMs)
  const nextRunByJob = useMemo(() => {
    const map: Record<string, number> = {};
    for (const run of runs) {
      if (run.nextRunAtMs && run.nextRunAtMs > Date.now()) {
        if (!map[run.jobId] || run.ts > (runs.find(r => r.jobId === run.jobId && r.nextRunAtMs === map[run.jobId])?.ts || 0)) {
          map[run.jobId] = run.nextRunAtMs;
        }
      }
    }
    return map;
  }, [runs]);

  // Filtered and sorted jobs
  const sortedJobs = useMemo(() => {
    let filtered = [...jobs];

    // If a specific job is selected, show only that
    if (selectedJobId) {
      filtered = filtered.filter((j) => j.id === selectedJobId);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      filtered = filtered.filter((j) =>
        j.name.toLowerCase().includes(lower) ||
        (j.model && getModelLabel(j.model).toLowerCase().includes(lower))
      );
    }

    switch (sortMode) {
      case "recent":
        filtered.sort((a, b) => (b.stats.lastRun || 0) - (a.stats.lastRun || 0));
        break;
      case "name":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "runs":
        filtered.sort((a, b) => b.stats.total - a.stats.total);
        break;
      case "success":
        filtered.sort((a, b) => {
          const aRate = a.stats.total > 0 ? a.stats.ok / a.stats.total : 0;
          const bRate = b.stats.total > 0 ? b.stats.ok / b.stats.total : 0;
          return bRate - aRate;
        });
        break;
    }

    return filtered;
  }, [jobs, sortMode, selectedJobId, searchQuery]);

  // Filtered runs for timeline view
  const filteredRuns = useMemo(() => {
    let filtered = runs;
    if (statusFilter !== "all") {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }
    return filtered;
  }, [runs, statusFilter]);

  // Aggregate stats
  const totalStats = useMemo(() => {
    const total = runs.length;
    const ok = runs.filter((r) => r.status === "ok").length;
    const error = total - ok;
    const totalDuration = runs.reduce((sum, r) => sum + (r.durationMs || 0), 0);
    const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;
    const activeJobs = jobs.filter((j) => j.stats.total > 0).length;
    return { total, ok, error, avgDuration, activeJobs };
  }, [runs, jobs]);

  // Group runs by date for timeline
  const runsByDate = useMemo(() => {
    const groups: Record<string, CronRun[]> = {};
    for (const run of filteredRuns) {
      const dateKey = new Date(run.ts).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(run);
    }
    return groups;
  }, [filteredRuns]);

  const toggleJobExpand = (jobId: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  // Get latest run duration for a job
  const getLatestRunDuration = (jobId: string): number | null => {
    const jobRuns = runsByJob[jobId];
    if (!jobRuns || jobRuns.length === 0) return null;
    return jobRuns[0].durationMs || null;
  };

  if (loading) {
    return (
      <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Loading cron history...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && runs.length === 0) {
    return (
      <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 font-medium">Failed to load cron history</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchRuns}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
      {/* Connection error banner — shown when fetch fails but stale data is displayed */}
      {error && runs.length > 0 && (
        <div className="mx-4 mt-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex items-center gap-2 text-xs">
          <RefreshCw className="h-3.5 w-3.5 text-amber-400 animate-spin flex-shrink-0" />
          <span className="text-amber-300">Connection lost — retrying...</span>
          <span className="text-muted-foreground/60 ml-auto">{error}</span>
        </div>
      )}
      {/* Header */}
      <CardHeader className="pb-3 flex-shrink-0 px-4 pt-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <History className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">Cron Run History</h2>
            <Badge variant="outline" className="text-[10px] font-mono">
              {jobs.length} job{jobs.length !== 1 ? "s" : ""}
            </Badge>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/60">
              {lastRefresh > 0 && `Updated ${Math.round((Date.now() - lastRefresh) / 1000)}s ago`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchRuns}
              className="text-xs gap-1"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats banner */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <div className="text-2xl font-bold">{totalStats.total}</div>
            <div className="text-[11px] text-muted-foreground">Total Runs</div>
          </div>
          <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
            <div className="text-2xl font-bold text-emerald-500">{totalStats.ok}</div>
            <div className="text-[11px] text-muted-foreground">Succeeded</div>
          </div>
          <div className="rounded-lg bg-red-500/10 p-3 text-center">
            <div className="text-2xl font-bold text-red-500">{totalStats.error}</div>
            <div className="text-[11px] text-muted-foreground">Failed</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <div className="text-2xl font-bold">{formatDuration(totalStats.avgDuration)}</div>
            <div className="text-[11px] text-muted-foreground">Avg Duration</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <div className="text-2xl font-bold">{totalStats.activeJobs}</div>
            <div className="text-[11px] text-muted-foreground">Active Jobs</div>
          </div>
        </div>

        {/* Search input */}
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search jobs by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-8 h-8 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {selectedJobId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedJobId(null)}
              className="text-xs gap-1"
            >
              <Filter className="size-3" />
              {jobs.find((j) => j.id === selectedJobId)?.name || "Job"}
              <span className="text-muted-foreground">×</span>
            </Button>
          )}

          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {(["all", "ok", "error"] as const).map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setStatusFilter(s)}
                className="text-[11px]"
              >
                {s === "all" ? "All" : s === "ok" ? "Success" : "Failed"}
              </Button>
            ))}
          </div>

          {searchQuery && (
            <span className="text-[10px] text-muted-foreground ml-1">
              {sortedJobs.length} of {jobs.length} jobs
            </span>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {(["recent", "name", "runs", "success"] as const).map((s) => (
              <Button
                key={s}
                variant={sortMode === s ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setSortMode(s)}
                className="text-[11px]"
              >
                {s === "recent" ? "Recent" : s === "name" ? "Name" : s === "runs" ? "Runs" : "Health"}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Jobs overview with expandable run lists */}
        <div className="space-y-2">
          {sortedJobs.map((job) => {
            const jobRuns = runsByJob[job.id] || [];
            const isExpanded = expandedJobs.has(job.id);
            const filteredJobRuns = statusFilter === "all"
              ? jobRuns
              : jobRuns.filter((r) => r.status === statusFilter);
            const nextRun = nextRunByJob[job.id];
            const latestDuration = getLatestRunDuration(job.id);

            return (
              <div key={job.id} className="rounded-lg border border-border/50 overflow-hidden">
                {/* Job header */}
                <button
                  onClick={() => toggleJobExpand(job.id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
                  )}

                  <SuccessRing ok={job.stats.ok} total={job.stats.total} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{job.name}</span>
                      {job.model && (
                        <div className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full ${getModelColor(job.model)}`} />
                          <span className="text-[10px] text-muted-foreground">{getModelLabel(job.model)}</span>
                        </div>
                      )}
                      {job.enabled === false && (
                        <Badge variant="secondary" className="text-[10px] h-4">Disabled</Badge>
                      )}
                      {nextRun && (
                        <span className="text-[10px] text-primary/70 flex items-center gap-0.5" title={`Next run: ${formatDateTime(nextRun)}`}>
                          <Clock className="size-2.5" />
                          in {formatCountdown(nextRun)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                      <span>{job.stats.total} runs</span>
                      {job.stats.error > 0 && (
                        <span className="text-red-400">{job.stats.error} failed</span>
                      )}
                      <span>avg {formatDuration(job.stats.avgDuration)}</span>
                      {job.stats.lastRun > 0 && (
                        <span className="hidden sm:inline">last {formatRelativeTime(job.stats.lastRun)}</span>
                      )}
                      {latestDuration != null && job.stats.avgDuration > 0 && (
                        <span className="hidden sm:inline">
                          <DurationBar latestMs={latestDuration} avgMs={job.stats.avgDuration} />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Sparkline — visible on all sizes, compact on mobile */}
                  <div className="sm:hidden">
                    <RunSparkline runs={jobRuns} compact />
                  </div>
                  <div className="hidden sm:block">
                    <RunSparkline runs={jobRuns} />
                  </div>
                </button>

                {/* Expanded run list */}
                {isExpanded && (
                  <div className="border-t border-border/30">
                    {filteredJobRuns.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No runs found{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}
                      </div>
                    ) : (
                      <div className="divide-y divide-border/20">
                        {filteredJobRuns.map((run, i) => (
                          <button
                            key={`${run.ts}-${i}`}
                            onClick={() => setSelectedRun(run)}
                            className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors text-left"
                          >
                            {/* Status icon */}
                            {run.status === "ok" ? (
                              <CheckCircle2 className="size-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            ) : (
                              <XCircle className="size-4 text-red-500 mt-0.5 flex-shrink-0" />
                            )}

                            {/* Time & duration */}
                            <div className="flex-shrink-0 w-28 sm:w-36">
                              <div className="text-xs font-medium">
                                {formatDateTime(run.ts)}
                              </div>
                              {run.durationMs != null && (
                                <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                                  <Timer className="size-3" />
                                  {formatDuration(run.durationMs)}
                                  {/* Duration vs average mini indicator */}
                                  {job.stats.avgDuration > 0 && (
                                    <span className={`text-[9px] ${
                                      run.durationMs < job.stats.avgDuration * 0.85 ? "text-emerald-400" :
                                      run.durationMs > job.stats.avgDuration * 1.15 ? "text-amber-400" :
                                      "text-muted-foreground/50"
                                    }`}>
                                      ({(run.durationMs / job.stats.avgDuration).toFixed(1)}x)
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Summary */}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {run.summary || "No summary available"}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {sortedJobs.length === 0 && !searchQuery && (
            <div className="text-center py-12 text-muted-foreground">
              <History className="size-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No cron job execution history found</p>
            </div>
          )}

          {sortedJobs.length === 0 && searchQuery && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="size-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No jobs matching &ldquo;{searchQuery}&rdquo;</p>
              <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setSearchQuery("")}>
                Clear search
              </Button>
            </div>
          )}
        </div>

        {/* Timeline view — grouped by date */}
        {!selectedJobId && filteredRuns.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <CalendarDays className="size-4" />
              Timeline
            </h3>
            <div className="space-y-4">
              {Object.entries(runsByDate).map(([date, dateRuns]) => (
                <div key={date}>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5 sticky top-0 bg-background/95 py-1">
                    {date} · {dateRuns.length} run{dateRuns.length !== 1 ? "s" : ""}
                  </div>
                  <div className="relative pl-6 border-l-2 border-border/30 space-y-1">
                    {dateRuns.map((run, i) => (
                      <button
                        key={`${run.ts}-${i}`}
                        onClick={() => setSelectedRun(run)}
                        className="block w-full text-left relative group"
                      >
                        {/* Timeline dot */}
                        <div
                          className={`absolute -left-[25px] top-2 w-2.5 h-2.5 rounded-full border-2 border-background ${
                            run.status === "ok" ? "bg-emerald-500" : "bg-red-500"
                          }`}
                        />
                        <div className="rounded-md px-3 py-2 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">
                              {new Date(run.ts).toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true,
                              })}
                            </span>
                            <span className="text-xs text-primary font-medium truncate">
                              {run.jobName || run.jobId.slice(0, 8)}
                            </span>
                            {run.durationMs != null && (
                              <span className="text-[11px] text-muted-foreground">
                                {formatDuration(run.durationMs)}
                              </span>
                            )}
                          </div>
                          {run.summary && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 group-hover:line-clamp-3 transition-all">
                              {run.summary}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Run detail dialog */}
      <Dialog open={!!selectedRun} onOpenChange={(open) => !open && setSelectedRun(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRun?.status === "ok" ? (
                <CheckCircle2 className="size-5 text-emerald-500" />
              ) : (
                <XCircle className="size-5 text-red-500" />
              )}
              {selectedRun?.jobName || selectedRun?.jobId?.slice(0, 8)}
            </DialogTitle>
          </DialogHeader>
          {selectedRun && (
            <div className="space-y-4 mt-2">
              {/* Status & timing */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="text-[11px] text-muted-foreground mb-1">Status</div>
                  <Badge variant={selectedRun.status === "ok" ? "default" : "destructive"}>
                    {selectedRun.status === "ok" ? "Success" : "Failed"}
                  </Badge>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="text-[11px] text-muted-foreground mb-1">Completed</div>
                  <div className="text-sm font-medium">{formatDateTime(selectedRun.ts)}</div>
                </div>
                {selectedRun.durationMs != null && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="text-[11px] text-muted-foreground mb-1">Duration</div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{formatDuration(selectedRun.durationMs)}</span>
                      {/* Show comparison to average */}
                      {(() => {
                        const job = jobs.find(j => j.id === selectedRun.jobId);
                        if (!job || job.stats.avgDuration <= 0 || !selectedRun.durationMs) return null;
                        const ratio = selectedRun.durationMs / job.stats.avgDuration;
                        const isFaster = ratio < 0.85;
                        const isSlower = ratio > 1.15;
                        return (
                          <span className={`text-[10px] ${
                            isFaster ? "text-emerald-400" : isSlower ? "text-amber-400" : "text-muted-foreground/60"
                          }`}>
                            {ratio.toFixed(1)}x avg
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {selectedRun.runAtMs && (
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">Scheduled For</div>
                  <div className="text-sm">{formatDateTime(selectedRun.runAtMs)}</div>
                </div>
              )}

              {selectedRun.sessionId && (
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">Session ID</div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      {selectedRun.sessionId}
                    </code>
                    <CopyButton text={selectedRun.sessionId} label="Copy session ID" />
                  </div>
                </div>
              )}

              {/* Summary */}
              {selectedRun.summary && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[11px] text-muted-foreground">Summary</div>
                    <CopyButton text={selectedRun.summary} label="Copy summary" />
                  </div>
                  <div className="text-sm bg-muted/50 rounded-lg p-3 whitespace-pre-wrap break-words leading-relaxed">
                    {selectedRun.summary}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
