"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import {
  DollarSign,
  Zap,
  CheckSquare,
  AlertTriangle,
  Bot,
  Timer,
} from "lucide-react";
import { formatCost, formatTokens } from "@/lib/formatters";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

interface QuickStatBadgeProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  onClick: () => void;
  alert?: boolean;
}

function QuickStatBadge({ icon, label, value, color, onClick, alert }: QuickStatBadgeProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors hover:bg-muted/50 ${
        alert
          ? "border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/10"
          : "border-border/40 bg-muted/20 text-muted-foreground hover:text-foreground"
      }`}
      title={label}
    >
      <span className={alert ? "text-red-400" : color}>{icon}</span>
      <span className="font-mono tabular-nums">{value}</span>
      <span className="hidden sm:inline text-muted-foreground/60">{label}</span>
    </button>
  );
}

export function QuickStats() {
  const router = useRouter();

  // Today's analytics (cost + tokens)
  const { data: analytics } = useSWR("quick-stats-analytics", () => fetcher("/api/analytics?days=1"), {
    refreshInterval: 120000,
    dedupingInterval: 30000,
  });

  // Task counts
  const { data: tasksData } = useSWR("quick-stats-tasks", () => fetcher("/api/tasks?archived=false"), {
    refreshInterval: 60000,
    dedupingInterval: 15000,
  });

  // Agent sessions
  const { data: agents } = useSWR("quick-stats-agents", () => fetcher("/api/agents?action=list&limit=20"), {
    refreshInterval: 60000,
    dedupingInterval: 15000,
  });

  const stats = useMemo(() => {
    const todayCost = analytics?.totalCost ?? 0;
    const todayTokens = analytics?.totalTokens ?? 0;

    const tasks = tasksData?.tasks ?? [];
    const activeTasks = tasks.filter((t: any) => t.status === "in_progress").length;
    const blockedTasks = tasks.filter((t: any) => t.status === "blocked").length;
    const todoTasks = tasks.filter((t: any) => t.status === "todo").length;

    // Count sessions active in last 30 minutes
    const thirtyMinsAgo = Date.now() - 30 * 60 * 1000;
    const activeSessions = Array.isArray(agents)
      ? agents.filter((s: any) => {
          const lastActive = s.lastActivity || (s.modifiedAt ? new Date(s.modifiedAt).getTime() : 0);
          return lastActive > thirtyMinsAgo;
        }).length
      : 0;

    return { todayCost, todayTokens, activeTasks, blockedTasks, todoTasks, activeSessions };
  }, [analytics, tasksData, agents]);

  const navigate = (tab: string, view?: string) => {
    const params = new URLSearchParams();
    if (tab !== "activity") params.set("tab", tab);
    if (view) params.set("view", view);
    const url = params.toString() ? `/?${params}` : "/";
    router.replace(url, { scroll: false });
  };

  // Don't render until at least one data source has loaded
  if (!analytics && !tasksData && !agents) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap" data-testid="quick-stats">
      {/* Today's cost */}
      {analytics && (
        <QuickStatBadge
          icon={<DollarSign className="h-3 w-3" />}
          label="today"
          value={formatCost(stats.todayCost)}
          color="text-emerald-400"
          onClick={() => navigate("activity", "analytics")}
        />
      )}

      {/* Today's tokens */}
      {analytics && stats.todayTokens > 0 && (
        <QuickStatBadge
          icon={<Zap className="h-3 w-3" />}
          label="tokens"
          value={formatTokens(stats.todayTokens)}
          color="text-blue-400"
          onClick={() => navigate("activity", "analytics")}
        />
      )}

      {/* Active tasks */}
      {tasksData && (stats.activeTasks > 0 || stats.todoTasks > 0) && (
        <QuickStatBadge
          icon={<CheckSquare className="h-3 w-3" />}
          label={stats.activeTasks > 0 ? "active" : "to do"}
          value={String(stats.activeTasks > 0 ? stats.activeTasks : stats.todoTasks)}
          color="text-blue-400"
          onClick={() => navigate("tasks")}
        />
      )}

      {/* Blocked tasks */}
      {tasksData && stats.blockedTasks > 0 && (
        <QuickStatBadge
          icon={<AlertTriangle className="h-3 w-3" />}
          label="blocked"
          value={String(stats.blockedTasks)}
          color="text-amber-400"
          onClick={() => navigate("tasks")}
          alert
        />
      )}

      {/* Active agent sessions */}
      {agents && stats.activeSessions > 0 && (
        <QuickStatBadge
          icon={<Bot className="h-3 w-3" />}
          label="agents"
          value={String(stats.activeSessions)}
          color="text-purple-400"
          onClick={() => navigate("activity", "agents")}
        />
      )}
    </div>
  );
}
