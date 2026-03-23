"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Bell,
  AlertTriangle,
  Server,
  Clock,
  CheckSquare,
  XCircle,
  Cpu,
  ArrowRight,
  X,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useHealthData } from "@/hooks/useHealthData";
import { formatRelativeTime } from "@/lib/formatters";

// --- Types ---

type NotifSeverity = "critical" | "warning" | "info";
type NotifCategory = "system" | "services" | "tasks" | "cron";

interface Notification {
  id: string;
  title: string;
  description: string;
  severity: NotifSeverity;
  category: NotifCategory;
  timestamp: number;
  navigateTo?: { tab: string; view?: string };
  icon: React.ReactNode;
}

// --- Dismissed storage ---

const DISMISSED_KEY = "mc-notif-dismissed";

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function setDismissed(ids: Set<string>): void {
  try {
    // Keep max 200 entries to prevent localStorage bloat
    const arr = Array.from(ids).slice(-200);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(arr));
  } catch {
    // localStorage unavailable
  }
}

// --- Fetchers ---

const jsonFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
};

// --- Severity helpers ---

const SEVERITY_CONFIG: Record<NotifSeverity, { dot: string; bg: string; border: string; text: string }> = {
  critical: { dot: "bg-red-500", bg: "bg-red-500/5", border: "border-red-500/20", text: "text-red-400" },
  warning: { dot: "bg-amber-500", bg: "bg-amber-500/5", border: "border-amber-500/20", text: "text-amber-400" },
  info: { dot: "bg-blue-500", bg: "bg-blue-500/5", border: "border-blue-500/20", text: "text-blue-400" },
};

const CATEGORY_LABELS: Record<NotifCategory, string> = {
  system: "System",
  services: "Services",
  tasks: "Tasks",
  cron: "Schedule",
};

// --- Main Component ---

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissedState] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);
  const router = useRouter();
  const { data: healthData, healthStatus } = useHealthData();

  // Fetch data sources
  const { data: servicesData } = useSWR(
    "notif-services",
    () => jsonFetcher("/api/services"),
    { refreshInterval: 60000, dedupingInterval: 15000 }
  );

  const { data: tasksData } = useSWR(
    "notif-tasks",
    () => jsonFetcher("/api/tasks?archived=false"),
    { refreshInterval: 60000, dedupingInterval: 15000 }
  );

  const { data: cronData } = useSWR(
    "notif-cron",
    () => jsonFetcher("/api/cron-runs?limit=50"),
    { refreshInterval: 60000, dedupingInterval: 15000 }
  );

  // Load dismissed IDs on mount
  useEffect(() => {
    setDismissedState(getDismissed());
  }, []);

  // Tick for relative times
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  // Listen for custom event to open
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-notification-center", handler);
    return () => window.removeEventListener("open-notification-center", handler);
  }, []);

  // Build notifications from all sources
  const notifications = useMemo((): Notification[] => {
    const items: Notification[] = [];
    const now = Date.now();

    // 1. System health
    if (healthData && healthStatus === "critical") {
      if (healthData.cpu >= 90) {
        items.push({
          id: "sys-cpu-critical",
          title: "CPU usage critical",
          description: `CPU at ${healthData.cpu}% — investigate high-load processes`,
          severity: "critical",
          category: "system",
          timestamp: now,
          navigateTo: { tab: "system", view: "health" },
          icon: <Cpu className="h-4 w-4" />,
        });
      }
      if (healthData.memPercent >= 90) {
        items.push({
          id: "sys-mem-critical",
          title: "Memory usage critical",
          description: `Memory at ${healthData.memPercent}% — risk of OOM`,
          severity: "critical",
          category: "system",
          timestamp: now,
          navigateTo: { tab: "system", view: "health" },
          icon: <Server className="h-4 w-4" />,
        });
      }
      if (healthData.diskPercent >= 90) {
        items.push({
          id: "sys-disk-critical",
          title: "Disk space critical",
          description: `Disk at ${healthData.diskPercent}% — free space urgently`,
          severity: "critical",
          category: "system",
          timestamp: now,
          navigateTo: { tab: "system", view: "health" },
          icon: <Server className="h-4 w-4" />,
        });
      }
    } else if (healthData && healthStatus === "warn") {
      if (healthData.cpu >= 70) {
        items.push({
          id: "sys-cpu-warn",
          title: "CPU usage elevated",
          description: `CPU at ${healthData.cpu}%`,
          severity: "warning",
          category: "system",
          timestamp: now,
          navigateTo: { tab: "system", view: "health" },
          icon: <Cpu className="h-4 w-4" />,
        });
      }
      if (healthData.memPercent >= 70) {
        items.push({
          id: "sys-mem-warn",
          title: "Memory usage elevated",
          description: `Memory at ${healthData.memPercent}%`,
          severity: "warning",
          category: "system",
          timestamp: now,
          navigateTo: { tab: "system", view: "health" },
          icon: <Server className="h-4 w-4" />,
        });
      }
    }

    // 2. Service outages
    if (Array.isArray(servicesData)) {
      const downServices = servicesData.filter((s: any) => s.status === "down");
      const degradedServices = servicesData.filter((s: any) => s.status === "degraded");
      for (const svc of downServices) {
        items.push({
          id: `svc-down-${svc.name}`,
          title: `${svc.name} is down`,
          description: svc.url?.replace("https://", "") || "Service unreachable",
          severity: "critical",
          category: "services",
          timestamp: now,
          navigateTo: { tab: "system", view: "services" },
          icon: <XCircle className="h-4 w-4" />,
        });
      }
      for (const svc of degradedServices) {
        items.push({
          id: `svc-degraded-${svc.name}`,
          title: `${svc.name} degraded`,
          description: `${svc.responseTime ? `${svc.responseTime}ms response` : "Degraded performance"}`,
          severity: "warning",
          category: "services",
          timestamp: now,
          navigateTo: { tab: "system", view: "services" },
          icon: <AlertTriangle className="h-4 w-4" />,
        });
      }
    }

    // 3. Blocked tasks
    const tasks = tasksData?.tasks ?? [];
    const blockedTasks = tasks.filter((t: any) => t.status === "blocked");
    for (const task of blockedTasks) {
      items.push({
        id: `task-blocked-${task.id}`,
        title: task.title || "Blocked task",
        description: task.description?.slice(0, 80) || "Task is blocked",
        severity: "warning",
        category: "tasks",
        timestamp: task.updated_at ? new Date(task.updated_at).getTime() : now,
        navigateTo: { tab: "tasks" },
        icon: <CheckSquare className="h-4 w-4" />,
      });
    }

    // 4. Cron failures (last 24h)
    const dayAgo = now - 86400000;
    const runs = cronData?.runs ?? [];
    const failedRuns = runs.filter(
      (r: any) => r.status !== "ok" && (r.ts || 0) > dayAgo
    );
    // Group by job name, show latest failure per job
    const failedByJob = new Map<string, any>();
    for (const run of failedRuns) {
      const jobName = run.jobId || run.job || "unknown";
      const existing = failedByJob.get(jobName);
      if (!existing || (run.ts || 0) > (existing.ts || 0)) {
        failedByJob.set(jobName, run);
      }
    }
    for (const [jobName, run] of failedByJob.entries()) {
      items.push({
        id: `cron-fail-${jobName}-${run.ts || 0}`,
        title: `Cron failed: ${jobName}`,
        description: run.error?.slice(0, 80) || `Status: ${run.status}`,
        severity: "warning",
        category: "cron",
        timestamp: run.ts || now,
        navigateTo: { tab: "schedule", view: "runs" },
        icon: <Clock className="h-4 w-4" />,
      });
    }

    // Sort: critical first, then by timestamp desc
    const severityOrder: Record<NotifSeverity, number> = { critical: 0, warning: 1, info: 2 };
    items.sort((a, b) => {
      const sev = severityOrder[a.severity] - severityOrder[b.severity];
      if (sev !== 0) return sev;
      return b.timestamp - a.timestamp;
    });

    return items;
  }, [healthData, healthStatus, servicesData, tasksData, cronData]);

  // Active (non-dismissed) notifications
  const active = useMemo(
    () => notifications.filter((n) => !dismissed.has(n.id)),
    [notifications, dismissed]
  );

  const criticalCount = active.filter((n) => n.severity === "critical").length;
  const totalCount = active.length;

  // Group by category
  const grouped = useMemo(() => {
    const groups: { category: NotifCategory; items: Notification[] }[] = [];
    const seen = new Set<NotifCategory>();
    for (const n of active) {
      if (!seen.has(n.category)) {
        seen.add(n.category);
        groups.push({ category: n.category, items: [] });
      }
      groups.find((g) => g.category === n.category)!.items.push(n);
    }
    return groups;
  }, [active]);

  const dismiss = useCallback((id: string) => {
    setDismissedState((prev) => {
      const next = new Set(prev);
      next.add(id);
      setDismissed(next);
      return next;
    });
  }, []);

  const dismissAll = useCallback(() => {
    setDismissedState((prev) => {
      const next = new Set(prev);
      for (const n of notifications) next.add(n.id);
      setDismissed(next);
      return next;
    });
  }, [notifications]);

  const navigate = useCallback(
    (to: { tab: string; view?: string }) => {
      const params = new URLSearchParams();
      if (to.tab !== "activity") params.set("tab", to.tab);
      if (to.view) params.set("view", to.view);
      const url = params.toString() ? `/?${params}` : "/";
      router.replace(url, { scroll: false });
      setOpen(false);
    },
    [router]
  );

  return (
    <>
      {/* Bell button */}
      <button
        onClick={() => setOpen(true)}
        className="relative flex items-center justify-center rounded-lg border border-border/60 bg-muted/30 w-8 h-8 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        title={totalCount > 0 ? `${totalCount} notification${totalCount !== 1 ? "s" : ""}` : "No notifications"}
        aria-label="Notifications"
        data-testid="notification-bell"
      >
        <Bell className="h-4 w-4" />
        {totalCount > 0 && (
          <span
            className={`absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full text-[9px] font-bold leading-none px-1 ${
              criticalCount > 0
                ? "bg-red-500 text-white animate-pulse"
                : "bg-amber-500 text-white"
            }`}
            data-testid="notification-badge"
          >
            {totalCount > 99 ? "99+" : totalCount}
          </span>
        )}
      </button>

      {/* Sheet panel */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[400px] sm:max-w-[400px] p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                Notifications
                {totalCount > 0 && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      criticalCount > 0
                        ? "bg-red-500/10 text-red-400 border-red-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}
                  >
                    {totalCount}
                  </Badge>
                )}
              </SheetTitle>
              {totalCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={dismissAll}
                  data-testid="dismiss-all"
                >
                  <Check className="h-3 w-3 mr-1" />
                  Dismiss all
                </Button>
              )}
            </div>
            <SheetDescription className="text-xs">
              Aggregated alerts from system health, services, tasks, and cron jobs
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto" data-testid="notification-list">
            {totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Check className="h-6 w-6 text-emerald-400" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-foreground/80">All clear</p>
                  <p className="text-xs mt-0.5">No active alerts right now</p>
                </div>
              </div>
            ) : (
              <div className="py-2">
                {grouped.map((group) => (
                  <div key={group.category} className="mb-1">
                    <div className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                      {CATEGORY_LABELS[group.category]}
                    </div>
                    {group.items.map((notif) => {
                      const config = SEVERITY_CONFIG[notif.severity];
                      return (
                        <div
                          key={notif.id}
                          data-testid="notification-item"
                          className={`mx-2 mb-1 rounded-lg border px-3 py-2.5 ${config.bg} ${config.border} transition-colors hover:bg-muted/30 group`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span className={`shrink-0 mt-0.5 ${config.text}`}>
                              {notif.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm truncate">
                                  {notif.title}
                                </span>
                                <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${config.dot}`} />
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {notif.description}
                              </p>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-[10px] text-muted-foreground/60">
                                  {formatRelativeTime(notif.timestamp)}
                                </span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {notif.navigateTo && (
                                    <button
                                      onClick={() => navigate(notif.navigateTo!)}
                                      className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-medium"
                                    >
                                      View
                                      <ArrowRight className="h-2.5 w-2.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => dismiss(notif.id)}
                                    className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground ml-2"
                                    title="Dismiss"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border/50 px-4 py-2.5 flex items-center justify-between text-[10px] text-muted-foreground/60">
            <span>Auto-refreshes every 60s</span>
            <span className="flex items-center gap-1">
              <RefreshCw className="h-2.5 w-2.5" />
              Live
            </span>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
