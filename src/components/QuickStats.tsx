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
  ArrowRight,
  Circle,
} from "lucide-react";
import { formatCost, formatTokens, formatRelativeTime, getModelColor } from "@/lib/formatters";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

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

/** Mini horizontal bar — used in model breakdowns */
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="w-full h-1 rounded-full bg-muted/40 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Model cost/token breakdown card content */
function ModelBreakdown({
  models,
  totalCost,
  totalTokens,
  mode,
}: {
  models: Array<{ model: string; cost: number; tokens: number; count: number }>;
  totalCost: number;
  totalTokens: number;
  mode: "cost" | "tokens";
}) {
  const sorted = [...models].sort((a, b) =>
    mode === "cost" ? b.cost - a.cost : b.tokens - a.tokens
  );

  if (sorted.length === 0) {
    return (
      <div className="text-xs text-muted-foreground/60 text-center py-2">
        No model usage today
      </div>
    );
  }

  const maxVal = mode === "cost"
    ? Math.max(...sorted.map((m) => m.cost))
    : Math.max(...sorted.map((m) => m.tokens));

  return (
    <div className="space-y-2">
      {sorted.map((m) => {
        const colors = getModelColor(m.model);
        const modelName = (() => {
          const lower = m.model.toLowerCase();
          if (lower.includes("haiku")) return "Haiku";
          if (lower.includes("sonnet")) return "Sonnet";
          if (lower.includes("opus")) return "Opus";
          return m.model.split("/").pop() || m.model;
        })();
        const value = mode === "cost" ? m.cost : m.tokens;
        const pct = mode === "cost"
          ? totalCost > 0 ? ((m.cost / totalCost) * 100).toFixed(0) : "0"
          : totalTokens > 0 ? ((m.tokens / totalTokens) * 100).toFixed(0) : "0";

        return (
          <div key={m.model} className="space-y-0.5">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                <span className="font-medium">{modelName}</span>
                <span className="text-muted-foreground/50">{m.count} calls</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono tabular-nums">
                  {mode === "cost" ? formatCost(m.cost) : formatTokens(m.tokens)}
                </span>
                <span className="text-muted-foreground/40 text-[10px]">{pct}%</span>
              </div>
            </div>
            <MiniBar value={value} max={maxVal} color={colors.bar} />
          </div>
        );
      })}
    </div>
  );
}

/** Task list card content */
function TaskPreview({
  tasks,
  filter,
}: {
  tasks: Array<{ id: string; title: string; status: string; priority: string; assignee?: string }>;
  filter: "active" | "blocked";
}) {
  const filtered = tasks.filter((t) =>
    filter === "active" ? t.status === "in_progress" || t.status === "todo" : t.status === "blocked"
  ).slice(0, 5);

  if (filtered.length === 0) {
    return (
      <div className="text-xs text-muted-foreground/60 text-center py-2">
        No {filter} tasks
      </div>
    );
  }

  const priorityColors: Record<string, string> = {
    urgent: "text-red-400",
    high: "text-orange-400",
    medium: "text-blue-400",
    low: "text-gray-400",
  };

  const statusIcons: Record<string, string> = {
    in_progress: "text-blue-400",
    todo: "text-muted-foreground/50",
    blocked: "text-red-400",
  };

  return (
    <div className="space-y-1.5">
      {filtered.map((t) => (
        <div key={t.id} className="flex items-start gap-2 text-[11px]">
          <Circle
            className={`h-3 w-3 mt-0.5 flex-shrink-0 ${statusIcons[t.status] || "text-muted-foreground"}`}
            fill={t.status === "in_progress" ? "currentColor" : "none"}
          />
          <div className="flex-1 min-w-0">
            <div className="truncate font-medium">{t.title}</div>
            <div className="flex items-center gap-1.5 text-muted-foreground/50">
              <span className={priorityColors[t.priority] || ""}>{t.priority}</span>
              {t.assignee && (
                <>
                  <span>·</span>
                  <span>{t.assignee}</span>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Agent session preview card content */
function AgentPreview({
  agents,
}: {
  agents: Array<{ id: string; model: string; prompt: string; totalCost: number; lastActivity?: number; modifiedAt?: string }>;
}) {
  const thirtyMinsAgo = Date.now() - 30 * 60 * 1000;
  const active = agents
    .filter((s) => {
      const lastActive = s.lastActivity || (s.modifiedAt ? new Date(s.modifiedAt).getTime() : 0);
      return lastActive > thirtyMinsAgo;
    })
    .slice(0, 5);

  if (active.length === 0) {
    return (
      <div className="text-xs text-muted-foreground/60 text-center py-2">
        No active agents
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {active.map((a) => {
        const colors = getModelColor(a.model);
        const modelName = (() => {
          const lower = (a.model || "").toLowerCase();
          if (lower.includes("haiku")) return "Haiku";
          if (lower.includes("sonnet")) return "Sonnet";
          if (lower.includes("opus")) return "Opus";
          return "Agent";
        })();
        const lastActive = a.lastActivity || (a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0);

        return (
          <div key={a.id} className="space-y-0.5">
            <div className="flex items-start gap-1.5 text-[11px]">
              <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${colors.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">
                  {a.prompt ? a.prompt.slice(0, 60) + (a.prompt.length > 60 ? "…" : "") : a.id.slice(0, 8)}
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground/50">
                  <span className={colors.text}>{modelName}</span>
                  <span>·</span>
                  <span className="font-mono">{formatCost(a.totalCost)}</span>
                  {lastActive > 0 && (
                    <>
                      <span>·</span>
                      <span>{formatRelativeTime(lastActive)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Hover card wrapper with consistent styling */
function StatHoverCard({
  children,
  title,
  content,
  footer,
  wide,
}: {
  children: React.ReactNode;
  title: string;
  content: React.ReactNode;
  footer?: string;
  wide?: boolean;
}) {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        className={`${wide ? "w-80" : "w-64"} p-0`}
      >
        <div className="px-3 py-2 border-b border-border/40">
          <div className="text-xs font-semibold">{title}</div>
        </div>
        <div className="px-3 py-2.5">{content}</div>
        {footer && (
          <div className="px-3 py-1.5 border-t border-border/40 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/50">{footer}</span>
            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/30" />
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
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
    const models = analytics?.models ?? [];

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

    return { todayCost, todayTokens, models, activeTasks, blockedTasks, todoTasks, activeSessions };
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

  const tasks = tasksData?.tasks ?? [];

  return (
    <div className="flex items-center gap-1.5 flex-wrap" data-testid="quick-stats">
      {/* Today's cost — hover shows model breakdown */}
      {analytics && (
        <StatHoverCard
          title="Today's Cost"
          content={
            <ModelBreakdown
              models={stats.models}
              totalCost={stats.todayCost}
              totalTokens={stats.todayTokens}
              mode="cost"
            />
          }
          footer="Click for full analytics"
        >
          <QuickStatBadge
            icon={<DollarSign className="h-3 w-3" />}
            label="today"
            value={formatCost(stats.todayCost)}
            color="text-emerald-400"
            onClick={() => navigate("activity", "analytics")}
          />
        </StatHoverCard>
      )}

      {/* Today's tokens — hover shows model breakdown */}
      {analytics && stats.todayTokens > 0 && (
        <StatHoverCard
          title="Today's Tokens"
          content={
            <ModelBreakdown
              models={stats.models}
              totalCost={stats.todayCost}
              totalTokens={stats.todayTokens}
              mode="tokens"
            />
          }
          footer="Click for full analytics"
        >
          <QuickStatBadge
            icon={<Zap className="h-3 w-3" />}
            label="tokens"
            value={formatTokens(stats.todayTokens)}
            color="text-blue-400"
            onClick={() => navigate("activity", "analytics")}
          />
        </StatHoverCard>
      )}

      {/* Active tasks — hover shows task list */}
      {tasksData && (stats.activeTasks > 0 || stats.todoTasks > 0) && (
        <StatHoverCard
          title={stats.activeTasks > 0 ? "Active Tasks" : "To Do Tasks"}
          content={<TaskPreview tasks={tasks} filter="active" />}
          footer="Click for task board"
          wide
        >
          <QuickStatBadge
            icon={<CheckSquare className="h-3 w-3" />}
            label={stats.activeTasks > 0 ? "active" : "to do"}
            value={String(stats.activeTasks > 0 ? stats.activeTasks : stats.todoTasks)}
            color="text-blue-400"
            onClick={() => navigate("tasks")}
          />
        </StatHoverCard>
      )}

      {/* Blocked tasks — hover shows blocked task list */}
      {tasksData && stats.blockedTasks > 0 && (
        <StatHoverCard
          title="Blocked Tasks"
          content={<TaskPreview tasks={tasks} filter="blocked" />}
          footer="Click for task board"
          wide
        >
          <QuickStatBadge
            icon={<AlertTriangle className="h-3 w-3" />}
            label="blocked"
            value={String(stats.blockedTasks)}
            color="text-amber-400"
            onClick={() => navigate("tasks")}
            alert
          />
        </StatHoverCard>
      )}

      {/* Active agent sessions — hover shows session list */}
      {agents && stats.activeSessions > 0 && (
        <StatHoverCard
          title="Active Agents"
          content={<AgentPreview agents={Array.isArray(agents) ? agents : []} />}
          footer="Click for agent sessions"
          wide
        >
          <QuickStatBadge
            icon={<Bot className="h-3 w-3" />}
            label="agents"
            value={String(stats.activeSessions)}
            color="text-purple-400"
            onClick={() => navigate("activity", "agents")}
          />
        </StatHoverCard>
      )}
    </div>
  );
}
