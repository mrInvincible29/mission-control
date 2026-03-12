"use client";

import useSWR from "swr";
import { listActivitiesPaginated, getActivityStats, getAnalytics } from "@/lib/supabase/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import {
  Search, X, ChevronDown, ChevronRight, ArrowRight,
  Bot, MessageSquare, XCircle, AlertTriangle, Circle, RefreshCw,
  Zap, BookOpen, Pencil, Mail, CheckCircle2, Wrench, Settings,
  CalendarDays,
} from "lucide-react";
import type { Activity } from "@/types";
import { formatTokens, formatCost, formatRelativeTime, formatDuration } from "@/lib/formatters";

const CATEGORY_COLORS: Record<string, string> = {
  important: "bg-red-500/20 text-red-400 border-red-500/30",
  model: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  message: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  system: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  noise: "bg-zinc-500/20 text-zinc-500 border-zinc-500/30",
};

const CATEGORY_DOT_COLORS: Record<string, string> = {
  important: "bg-red-400",
  model: "bg-purple-400",
  message: "bg-blue-400",
  system: "bg-gray-400",
  noise: "bg-zinc-400",
};

const ACTION_TYPE_ICONS: Record<string, React.ReactNode> = {
  model_usage: <Bot className="h-4 w-4" />,
  message_processed: <MessageSquare className="h-4 w-4" />,
  message_error: <XCircle className="h-4 w-4 text-red-400" />,
  session_stuck: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  webhook_error: <Circle className="h-4 w-4 text-red-400" />,
  session_state: <RefreshCw className="h-4 w-4" />,
  exec: <Zap className="h-4 w-4" />,
  read: <BookOpen className="h-4 w-4" />,
  write: <Pencil className="h-4 w-4" />,
  message: <Mail className="h-4 w-4" />,
  task: <CheckCircle2 className="h-4 w-4" />,
  fix: <Wrench className="h-4 w-4" />,
  system: <Settings className="h-4 w-4" />,
};

const STATUS_COLORS: Record<string, string> = {
  success: "bg-emerald-500/20 text-emerald-400",
  error: "bg-red-500/20 text-red-400",
  pending: "bg-amber-500/20 text-amber-400",
};

const STATUS_BAR_COLORS: Record<string, string> = {
  success: "bg-emerald-500",
  error: "bg-red-500",
  pending: "bg-amber-500",
};

/** Left border color per category — for quick visual scanning */
const CATEGORY_BORDERS: Record<string, string> = {
  important: "border-l-red-500",
  model: "border-l-purple-500",
  message: "border-l-blue-500",
  system: "border-l-gray-500",
  noise: "border-l-zinc-400",
};

/** Returns "Today", "Yesterday", or a formatted date like "Mon, Feb 17" */
function getActivityDateGroup(ts: number): string {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Visual separator between date groups in the feed */
function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2" role="separator" aria-label={label}>
      <div className="h-px flex-1 bg-border/50" />
      <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider shrink-0">
        {label}
      </span>
      <div className="h-px flex-1 bg-border/50" />
    </div>
  );
}

/** Session group header — shown when multiple activities share the same session */
function SessionHeader({
  sessionId,
  count,
  totalTokens,
  totalCost,
  isCollapsed,
  onToggle,
}: {
  sessionId: string;
  count: number;
  totalTokens: number;
  totalCost: number;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      data-testid="session-group-header"
      className="w-full flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors text-left group"
    >
      <ChevronRight className={`h-3 w-3 text-muted-foreground/60 transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
      <Bot className="h-3 w-3 text-muted-foreground/40" />
      <span className="text-[10px] font-mono text-muted-foreground/60 truncate max-w-[120px]">
        {sessionId.slice(0, 8)}...
      </span>
      <span className="text-[10px] text-muted-foreground/40">
        {count} activities
      </span>
      {totalTokens > 0 && (
        <span className="text-[10px] px-1.5 py-0 rounded bg-purple-500/10 text-purple-400/70">
          {formatTokens(totalTokens)}
        </span>
      )}
      {totalCost > 0 && (
        <span className="text-[10px] px-1.5 py-0 rounded bg-green-500/10 text-green-400/70">
          {formatCost(totalCost)}
        </span>
      )}
    </button>
  );
}

/** Status distribution mini-bar */
function StatusDistribution({ byStatus, total }: { byStatus: Record<string, number>; total: number }) {
  if (total === 0) return null;
  const statuses = ["success", "error", "pending"] as const;
  const entries = statuses
    .map(s => ({ status: s, count: byStatus[s] ?? 0 }))
    .filter(e => e.count > 0);

  if (entries.length === 0) return null;

  return (
    <div className="flex items-center gap-2" data-testid="status-distribution">
      <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden flex">
        {entries.map(({ status, count }) => (
          <TooltipProvider key={status}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`h-full ${STATUS_BAR_COLORS[status]} transition-all duration-500 first:rounded-l-full last:rounded-r-full`}
                  style={{ width: `${(count / total) * 100}%` }}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {status}: {count} ({((count / total) * 100).toFixed(0)}%)
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 shrink-0">
        {entries.map(({ status, count }) => (
          <span key={status} className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_BAR_COLORS[status]}`} />
            {count}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Compact 24-hour activity histogram — shows activity density per hour */
function HourlyTimeline({
  hourly,
}: {
  hourly: Array<{ hour: number; count: number; tokens: number; cost: number }>;
}) {
  const maxCount = Math.max(...hourly.map((h) => h.count), 1);
  const currentHour = new Date().getHours();
  const totalCount = hourly.reduce((s, h) => s + h.count, 0);

  if (totalCount === 0) return null;

  // Hour label markers
  const HOUR_LABELS = [0, 6, 12, 18];

  return (
    <div data-testid="hourly-timeline" className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/60 font-medium">Hourly Activity</span>
        <span className="text-[10px] text-muted-foreground/40">
          Peak: {hourly.reduce((best, h) => (h.count > best.count ? h : best), hourly[0]).hour}:00
        </span>
      </div>
      <div className="flex items-end gap-[2px] h-7">
        {hourly.map(({ hour, count, tokens, cost }) => {
          const pct = count > 0 ? Math.max((count / maxCount) * 100, 8) : 3;
          const isCurrent = hour === currentHour;
          const isPeak = count === maxCount && count > 0;
          return (
            <TooltipProvider key={hour}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`flex-1 rounded-t-[2px] transition-all duration-300 cursor-default ${
                      isCurrent
                        ? "bg-primary/60 ring-1 ring-primary/40 ring-offset-0"
                        : isPeak
                        ? "bg-primary/50"
                        : count > 0
                        ? "bg-primary/25 hover:bg-primary/40"
                        : "bg-muted/20"
                    }`}
                    style={{ height: `${pct}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <div className="font-medium">
                    {String(hour).padStart(2, "0")}:00 – {String(hour + 1).padStart(2, "0")}:00
                    {isCurrent && " (now)"}
                  </div>
                  <div>{count} activities</div>
                  {tokens > 0 && <div>{formatTokens(tokens)} tokens</div>}
                  {cost > 0 && <div>{formatCost(cost)}</div>}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
      {/* Hour labels */}
      <div className="flex items-center relative h-3">
        {HOUR_LABELS.map((h) => (
          <span
            key={h}
            className="absolute text-[8px] text-muted-foreground/40 font-mono -translate-x-1/2"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {h}
          </span>
        ))}
        <span
          className="absolute text-[8px] text-muted-foreground/40 font-mono"
          style={{ right: 0 }}
        >
          24
        </span>
      </div>
    </div>
  );
}

const DATE_RANGES = [
  { label: "Today", value: 1 },
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
];

const CATEGORIES = [
  { label: "All", value: "" },
  { label: "Important", value: "important" },
  { label: "Model", value: "model" },
  { label: "Messages", value: "message" },
  { label: "System", value: "system" },
  { label: "Noise", value: "noise" },
];

function getDateLabel(days: number): string {
  if (days === 1) return "Today";
  return `${days}-day`;
}

const PAGE_SIZE = 50;

/** Minimum session size to show a group header */
const SESSION_GROUP_MIN = 3;

/** "New since last visit" separator */
function NewSeparator() {
  return (
    <div className="flex items-center gap-3 py-2" role="separator" aria-label="New since last visit" data-testid="new-separator">
      <div className="h-px flex-1 bg-primary/40" />
      <span className="text-[10px] font-semibold text-primary/70 uppercase tracking-wider shrink-0 flex items-center gap-1">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse" />
        New since last visit
      </span>
      <div className="h-px flex-1 bg-primary/40" />
    </div>
  );
}

interface ActivityFeedProps {
  lastVisit?: number | null;
  onNewCount?: (count: number) => void;
}

export function ActivityFeed({ lastVisit, onNewCount }: ActivityFeedProps = {}) {
  const [category, setCategory] = useState<string>("");
  const [dateRange, setDateRange] = useState<number>(1);
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [searchText, setSearchText] = useState("");
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set());

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Track last refresh time for the "Updated Xs ago" indicator
  const [lastRefresh, setLastRefresh] = useState(0);

  // Auto-refresh relative timestamps every 60 seconds (+ "Updated Xs ago" every second)
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Reset cursors when filters change (preserve search text)
  useEffect(() => {
    setCursors([undefined]);
  }, [dateRange, category]);

  // Listen for command palette filter events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.category !== undefined) setCategory(detail.category);
      if (detail?.dateRange !== undefined) setDateRange(detail.dateRange);
    };
    window.addEventListener("set-activity-filter", handler);
    return () => window.removeEventListener("set-activity-filter", handler);
  }, []);

  const sinceTimestamp = useMemo(() => {
    if (!mounted) return 0;
    return Date.now() - dateRange * 24 * 60 * 60 * 1000;
  }, [dateRange, mounted]);

  const currentCursor = cursors[cursors.length - 1];

  const { data: result, mutate: mutateActivities, isValidating } = useSWR(
    mounted ? ["activities", currentCursor, category, sinceTimestamp] : null,
    () =>
      listActivitiesPaginated({
        limit: PAGE_SIZE,
        category: category || undefined,
        excludeCategories: category ? undefined : ["noise"],
        sinceTimestamp,
        cursor: currentCursor,
      }),
    { refreshInterval: 30000, onSuccess: () => setLastRefresh(Date.now()) }
  );

  const { data: stats, mutate: mutateStats } = useSWR(
    mounted ? ["activity-stats", sinceTimestamp] : null,
    () => getActivityStats(sinceTimestamp),
    { refreshInterval: 30000 }
  );

  // Hourly analytics for the timeline — uses same day range
  const { data: analytics, mutate: mutateAnalytics } = useSWR(
    mounted ? ["feed-analytics", dateRange] : null,
    () => getAnalytics(dateRange),
    { refreshInterval: 60000, dedupingInterval: 30000 }
  );

  // Listen for global "r" key refresh event
  useEffect(() => {
    const handler = () => {
      mutateActivities();
      mutateStats();
      mutateAnalytics();
    };
    window.addEventListener("refresh-view", handler);
    return () => window.removeEventListener("refresh-view", handler);
  }, [mutateActivities, mutateStats, mutateAnalytics]);

  const rawActivities = result?.items;
  const hasMore = result?.hasMore ?? false;
  const nextCursor = result?.nextCursor;
  const currentPage = cursors.length;
  const hasPrev = cursors.length > 1;

  // Client-side text search filter
  const activities = useMemo(() => {
    if (!rawActivities) return undefined;
    if (!searchText.trim()) return rawActivities;
    const lower = searchText.toLowerCase();
    return rawActivities.filter(a =>
      a.description.toLowerCase().includes(lower) ||
      a.actionType.toLowerCase().includes(lower) ||
      (a.metadata?.model?.toLowerCase().includes(lower)) ||
      (a.metadata?.tool?.toLowerCase().includes(lower))
    );
  }, [rawActivities, searchText]);

  // Build session groups from activities — group consecutive activities with same session
  const sessionGroups = useMemo(() => {
    if (!activities) return new Map<string, { indices: number[]; tokens: number; cost: number }>();
    const groups = new Map<string, { indices: number[]; tokens: number; cost: number }>();
    for (let i = 0; i < activities.length; i++) {
      const session = activities[i].metadata?.session;
      if (!session) continue;
      const existing = groups.get(session);
      if (existing) {
        existing.indices.push(i);
        existing.tokens += activities[i].metadata?.tokens ?? 0;
        existing.cost += activities[i].metadata?.cost ?? 0;
      } else {
        groups.set(session, {
          indices: [i],
          tokens: activities[i].metadata?.tokens ?? 0,
          cost: activities[i].metadata?.cost ?? 0,
        });
      }
    }
    // Only keep groups with enough activities to merit grouping
    for (const [key, val] of groups) {
      if (val.indices.length < SESSION_GROUP_MIN) groups.delete(key);
    }
    return groups;
  }, [activities]);

  const toggleSession = useCallback((sessionId: string) => {
    setCollapsedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }, []);

  const loadNext = useCallback(() => {
    if (nextCursor !== undefined) {
      setCursors(prev => [...prev, nextCursor]);
    }
  }, [nextCursor]);

  const loadPrev = useCallback(() => {
    setCursors(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  }, []);

  const dateLabel = getDateLabel(dateRange);

  // Count of items on current page after search filter
  const displayCount = activities?.length ?? 0;
  const searchActive = searchText.trim().length > 0;

  // Count new items since last visit and report to parent
  const newSinceLastVisit = useMemo(() => {
    if (!lastVisit || !activities) return { count: 0, insertAfterIndex: -1 };
    let count = 0;
    let insertAfterIndex = -1;
    for (let i = 0; i < activities.length; i++) {
      if (activities[i].timestamp > lastVisit) {
        count++;
      } else {
        if (insertAfterIndex === -1) insertAfterIndex = i;
      }
    }
    // If all items are new, no separator needed
    if (insertAfterIndex === -1 && count > 0) insertAfterIndex = -2;
    return { count, insertAfterIndex };
  }, [lastVisit, activities]);

  // Report new count to parent (for tab badge)
  useEffect(() => {
    if (onNewCount) onNewCount(newSinceLastVisit.count);
  }, [newSinceLastVisit.count, onNewCount]);

  return (
    <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
      <CardHeader className="pb-2 flex-shrink-0 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Activity Feed</CardTitle>
          <div className="flex items-center gap-2">
            {lastRefresh > 0 && (
              <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                Updated {Math.round((Date.now() - lastRefresh) / 1000)}s ago
              </span>
            )}
            <button
              onClick={() => { mutateActivities(); mutateStats(); mutateAnalytics(); }}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              aria-label="Refresh feed"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isValidating ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Stats Banner */}
        {stats && (
          <div className="space-y-2 mt-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-lg bg-muted/50 p-2.5">
                <div className="text-xs text-muted-foreground">{dateLabel} Activities</div>
                <div className="text-base sm:text-lg font-semibold mt-0.5">{stats.total}</div>
              </div>
              <div className="rounded-lg bg-purple-500/5 border border-purple-500/10 p-2.5">
                <div className="text-xs text-purple-400">Tokens</div>
                <div className="text-base sm:text-lg font-semibold text-purple-400 dark:text-purple-300 mt-0.5">
                  {stats.totalTokens > 0 ? formatTokens(stats.totalTokens) : "\u2014"}
                </div>
              </div>
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-2.5">
                <div className="text-xs text-emerald-400">Cost</div>
                <div className="text-base sm:text-lg font-semibold text-emerald-400 dark:text-emerald-300 mt-0.5">
                  {stats.totalCost > 0 ? formatCost(stats.totalCost) : "\u2014"}
                </div>
              </div>
              <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-2.5">
                <div className="text-xs text-blue-400">Categories</div>
                <div className="flex flex-wrap gap-1 mt-1 min-h-[24px]">
                  {Object.entries(stats.byCategory).map(([cat, count]) => (
                    <Badge
                      key={cat}
                      variant="outline"
                      className={`text-[9px] px-1 py-0 cursor-pointer hover:opacity-80 ${CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.system} ${
                        category === cat ? "ring-1 ring-current" : ""
                      }`}
                      onClick={() => setCategory(category === cat ? "" : cat)}
                    >
                      {cat} {count}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            {/* Status distribution bar */}
            {stats.byStatus && stats.total > 0 && (
              <StatusDistribution byStatus={stats.byStatus} total={stats.total} />
            )}
            {/* Hourly activity timeline */}
            {analytics?.hourly && (
              <HourlyTimeline hourly={analytics.hourly} />
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-3">
          <div className="flex flex-wrap items-center gap-1">
            {CATEGORIES.map(cat => {
              const count = cat.value
                ? stats?.byCategory[cat.value] ?? 0
                : stats?.total ?? 0;
              return (
                <Button
                  key={cat.value}
                  variant={category === cat.value ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7 px-2 gap-1"
                  onClick={() => setCategory(cat.value)}
                >
                  {cat.value && (
                    <span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_DOT_COLORS[cat.value] ?? "bg-gray-400"}`} />
                  )}
                  <span className="sm:hidden">{cat.value ? cat.label.split(" ")[0] : "All"}</span>
                  <span className="hidden sm:inline">{cat.label}</span>
                  {stats && count > 0 && (
                    <span className={`text-[9px] tabular-nums ${
                      category === cat.value ? "opacity-80" : "text-muted-foreground/50"
                    }`}>
                      {count > 999 ? `${(count / 1000).toFixed(1)}k` : count}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
          <div className="flex items-center gap-1 sm:ml-auto">
            {DATE_RANGES.map(range => (
              <Button
                key={range.value}
                variant={dateRange === range.value ? "secondary" : "ghost"}
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setDateRange(range.value)}
              >
                {range.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Text Search */}
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Filter by description, type, model, or tool..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-8 pr-8 h-8 text-xs"
          />
          {searchText && (
            <button
              onClick={() => setSearchText("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Search/filter context info */}
        {activities && (searchActive || displayCount > 0) && (
          <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground/50">
            <span>
              {searchActive
                ? `${displayCount} matching${rawActivities ? ` of ${rawActivities.length}` : ""}`
                : `${displayCount} activities`}
            </span>
            {sessionGroups.size > 0 && (
              <span className="flex items-center gap-1">
                <Bot className="h-2.5 w-2.5" />
                {sessionGroups.size} session{sessionGroups.size !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden flex flex-col px-4">
        <ScrollArea className="flex-1 pr-4">
          {!activities ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Loading activities...
            </div>
          ) : activities.length === 0 ? (
            <EmptyState
              searchText={searchText}
              category={category}
              dateRange={dateRange}
              onClearSearch={() => setSearchText("")}
              onClearCategory={() => setCategory("")}
              onExpandDateRange={() => setDateRange(dateRange === 1 ? 7 : dateRange === 7 ? 14 : 30)}
            />
          ) : (
            <div className="space-y-1.5">
              {(() => {
                // Build a set of activities to hide (collapsed session members)
                const hidden = new Set<number>();
                const sessionFirstIndex = new Map<string, number>();
                for (const [sessionId, group] of sessionGroups) {
                  sessionFirstIndex.set(sessionId, group.indices[0]);
                  if (collapsedSessions.has(sessionId)) {
                    // Hide all except the first
                    for (let i = 1; i < group.indices.length; i++) {
                      hidden.add(group.indices[i]);
                    }
                  }
                }

                return activities.map((activity: Activity, index: number) => {
                  if (hidden.has(index)) return null;

                  const prevActivity = index > 0 ? activities[index - 1] : null;
                  const currentGroup = getActivityDateGroup(activity.timestamp);
                  const prevGroup = prevActivity ? getActivityDateGroup(prevActivity.timestamp) : null;
                  const showSeparator = currentGroup !== prevGroup;

                  // Show "New since last visit" separator at the boundary
                  const showNewSeparator = newSinceLastVisit.insertAfterIndex === index && newSinceLastVisit.count > 0 && cursors.length === 1;

                  // Check if this is the first activity in a session group
                  const session = activity.metadata?.session;
                  const group = session ? sessionGroups.get(session) : undefined;
                  const isSessionFirst = group && sessionFirstIndex.get(session!) === index;
                  const isInSession = group && !isSessionFirst;
                  const isCollapsed = session ? collapsedSessions.has(session) : false;

                  return (
                    <Fragment key={activity.id}>
                      {showNewSeparator && <NewSeparator />}
                      {showSeparator && <DateSeparator label={currentGroup} />}
                      {isSessionFirst && group && session && (
                        <SessionHeader
                          sessionId={session}
                          count={group.indices.length}
                          totalTokens={group.tokens}
                          totalCost={group.cost}
                          isCollapsed={isCollapsed}
                          onToggle={() => toggleSession(session)}
                        />
                      )}
                      <div className={isInSession ? "ml-4 border-l-2 border-muted/40 pl-2" : ""}>
                        <ActivityItem activity={activity} />
                      </div>
                    </Fragment>
                  );
                });
              })()}
            </div>
          )}
        </ScrollArea>

        {/* Pagination controls */}
        {(hasPrev || hasMore) && (
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-border/50 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={loadPrev}
              disabled={!hasPrev}
            >
              Newer
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              Page {currentPage}
              {!hasMore && !hasPrev ? "" : hasMore ? "+" : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={loadNext}
              disabled={!hasMore}
            >
              Older
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Contextual empty state with actionable suggestions */
function EmptyState({
  searchText,
  category,
  dateRange,
  onClearSearch,
  onClearCategory,
  onExpandDateRange,
}: {
  searchText: string;
  category: string;
  dateRange: number;
  onClearSearch: () => void;
  onClearCategory: () => void;
  onExpandDateRange: () => void;
}) {
  if (searchText) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-3">
        <Search className="size-8 opacity-20" />
        <p className="text-sm">No activities matching &ldquo;{searchText}&rdquo;</p>
        <button
          onClick={onClearSearch}
          className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
        >
          Clear search <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-3" data-testid="empty-state">
      <Circle className="size-8 opacity-20" />
      <p className="text-sm">
        {category
          ? `No ${category} activities in this period`
          : "No activities in this period"}
      </p>
      <div className="flex flex-wrap items-center gap-2 justify-center">
        {category && (
          <button
            onClick={onClearCategory}
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 px-2 py-1 rounded-md bg-primary/5 hover:bg-primary/10 transition-colors"
          >
            Show all categories <ArrowRight className="h-3 w-3" />
          </button>
        )}
        {dateRange < 30 && (
          <button
            onClick={onExpandDateRange}
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 px-2 py-1 rounded-md bg-primary/5 hover:bg-primary/10 transition-colors"
          >
            <CalendarDays className="h-3 w-3" />
            Try {dateRange === 1 ? "7 days" : dateRange === 7 ? "14 days" : "30 days"}
          </button>
        )}
        {!category && dateRange >= 30 && (
          <p className="text-xs text-muted-foreground/50">Agent activity will appear here as it happens</p>
        )}
      </div>
    </div>
  );
}

function ActivityItem({ activity }: { activity: Activity }) {
  const [expanded, setExpanded] = useState(false);
  const icon = ACTION_TYPE_ICONS[activity.actionType] || <Circle className="h-4 w-4" />;
  const categoryColor = CATEGORY_COLORS[activity.category ?? "system"] || CATEGORY_COLORS.system;
  const categoryBorder = CATEGORY_BORDERS[activity.category ?? "system"] || CATEGORY_BORDERS.system;

  const meta = activity.metadata;
  const hasExpandableContent = meta && (
    meta.error || meta.tool || meta.session || meta.sessionKey || meta.channel ||
    meta.model || meta.tokens || meta.cost || meta.duration
  );

  const absoluteTime = new Date(activity.timestamp).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div
      role="button"
      tabIndex={0}
      className={`p-2.5 rounded-lg border border-l-[3px] transition-colors cursor-pointer ${categoryBorder} ${
        activity.status === "error"
          ? "border-red-500/30 border-l-red-500 bg-red-500/5"
          : "border-border/50 bg-card/50 hover:bg-card/80"
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
      onClick={() => setExpanded(e => !e)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpanded(prev => !prev);
        }
      }}
      aria-expanded={expanded}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${categoryColor}`}
            >
              {activity.actionType.replace(/_/g, " ")}
            </Badge>
            {activity.status === "error" && (
              <Badge variant="secondary" className={STATUS_COLORS.error}>
                error
              </Badge>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1 cursor-default">
                    {formatRelativeTime(activity.timestamp)}
                    {hasExpandableContent && (
                      <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {absoluteTime}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <p className={`text-sm text-foreground/90 mt-1 ${expanded ? "" : "line-clamp-2"}`}>
            {activity.description}
          </p>

          {/* Collapsed: inline metadata badges */}
          {!expanded && meta && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {meta.model && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                  {meta.model}
                </span>
              )}
              {meta.tokens && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                  {formatTokens(meta.tokens)} tokens
                </span>
              )}
              {meta.cost && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                  {formatCost(meta.cost)}
                </span>
              )}
              {meta.duration && (
                <span className="text-[10px] text-muted-foreground">
                  {formatDuration(meta.duration)}
                </span>
              )}
              {meta.channel && (
                <span className="text-[10px] text-muted-foreground">
                  via {meta.channel}
                </span>
              )}
            </div>
          )}

          {/* Expanded: error block + full metadata grid */}
          {expanded && meta && (
            <div className="mt-3 space-y-3">
              {meta.error && (
                <div className="rounded-md bg-red-500/10 border border-red-500/20 p-2.5">
                  <div className="text-[10px] font-medium text-red-400 mb-1">Error</div>
                  <pre className="text-xs text-red-500 dark:text-red-300/90 whitespace-pre-wrap break-words font-mono">
                    {meta.error}
                  </pre>
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {meta.model && (
                  <>
                    <span className="text-muted-foreground">Model</span>
                    <span className="text-purple-400">{meta.model}</span>
                  </>
                )}
                {meta.tokens != null && (
                  <>
                    <span className="text-muted-foreground">Tokens</span>
                    <span className="text-blue-400">{formatTokens(meta.tokens)}</span>
                  </>
                )}
                {meta.cost != null && (
                  <>
                    <span className="text-muted-foreground">Cost</span>
                    <span className="text-green-400">{formatCost(meta.cost)}</span>
                  </>
                )}
                {meta.duration != null && (
                  <>
                    <span className="text-muted-foreground">Duration</span>
                    <span>{formatDuration(meta.duration)}</span>
                  </>
                )}
                {meta.tool && (
                  <>
                    <span className="text-muted-foreground">Tool</span>
                    <span className="font-mono">{meta.tool}</span>
                  </>
                )}
                {meta.session && (
                  <>
                    <span className="text-muted-foreground">Session</span>
                    <span className="font-mono truncate">{meta.session}</span>
                  </>
                )}
                {meta.sessionKey && (
                  <>
                    <span className="text-muted-foreground">Session Key</span>
                    <span className="font-mono truncate">{meta.sessionKey}</span>
                  </>
                )}
                {meta.channel && (
                  <>
                    <span className="text-muted-foreground">Channel</span>
                    <span>{meta.channel}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
