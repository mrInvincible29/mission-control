"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  ArrowUpDown,
  CalendarDays,
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

// Sparkline bar chart for run history
function RunSparkline({ runs }: { runs: CronRun[] }) {
  // Show last 14 runs as tiny bars
  const recent = runs.slice(0, 14).reverse();
  if (recent.length === 0) return null;

  const maxDuration = Math.max(...recent.map((r) => r.durationMs || 0), 1);

  return (
    <div className="flex items-end gap-[2px] h-6">
      {recent.map((run, i) => {
        const height = run.durationMs
          ? Math.max(4, (run.durationMs / maxDuration) * 24)
          : 4;
        return (
          <div
            key={i}
            className={`w-1.5 rounded-t-sm transition-all ${
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

  // Group runs by job
  const runsByJob = useMemo(() => {
    const map: Record<string, CronRun[]> = {};
    for (const run of runs) {
      if (!map[run.jobId]) map[run.jobId] = [];
      map[run.jobId].push(run);
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
          return bRate - aRate; // Best health first
        });
        break;
    }

    return filtered;
  }, [jobs, sortMode, selectedJobId]);

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

  if (loading) {
    return (
      <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading cron history...</p>
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
          </div>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchRuns}
            className="text-xs gap-1"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
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

        {/* Filters */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
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
                    <div className="flex items-center gap-2">
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
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                      <span>{job.stats.total} runs</span>
                      {job.stats.error > 0 && (
                        <span className="text-red-400">{job.stats.error} failed</span>
                      )}
                      <span>avg {formatDuration(job.stats.avgDuration)}</span>
                      {job.stats.lastRun > 0 && (
                        <span>last {formatRelativeTime(job.stats.lastRun)}</span>
                      )}
                    </div>
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

          {sortedJobs.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <History className="size-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No cron job execution history found</p>
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
                    <div className="text-sm font-medium">{formatDuration(selectedRun.durationMs)}</div>
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
                  <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    {selectedRun.sessionId}
                  </code>
                </div>
              )}

              {/* Summary */}
              {selectedRun.summary && (
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">Summary</div>
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
