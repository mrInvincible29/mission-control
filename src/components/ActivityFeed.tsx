"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import type { Activity } from "@/types";

const CATEGORY_COLORS: Record<string, string> = {
  important: "bg-red-500/20 text-red-400 border-red-500/30",
  model: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  message: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  system: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  noise: "bg-zinc-500/20 text-zinc-500 border-zinc-500/30",
};

const ACTION_TYPE_ICONS: Record<string, string> = {
  model_usage: "🤖",
  message_processed: "💬",
  message_error: "❌",
  session_stuck: "⚠️",
  webhook_error: "🔴",
  session_state: "🔄",
  exec: "⚡",
  read: "📖",
  write: "✏️",
  message: "📨",
  task: "✅",
  fix: "🔧",
  system: "⚙️",
};

const STATUS_COLORS: Record<string, string> = {
  success: "bg-emerald-500/20 text-emerald-400",
  error: "bg-red-500/20 text-red-400",
  pending: "bg-amber-500/20 text-amber-400",
};

const DATE_RANGES = [
  { label: "Today", value: 1 },
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
];

const CATEGORIES = [
  { label: "All", value: "" },
  { label: "🔴 Important", value: "important" },
  { label: "🤖 Model", value: "model" },
  { label: "💬 Messages", value: "message" },
  { label: "⚙️ System", value: "system" },
  { label: "🔇 Noise", value: "noise" },
];

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function getDateLabel(days: number): string {
  if (days === 1) return "Today";
  return `${days}-day`;
}

const PAGE_SIZE = 50;

export function ActivityFeed() {
  const [category, setCategory] = useState<string>("");
  const [dateRange, setDateRange] = useState<number>(1);
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [searchText, setSearchText] = useState("");

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Auto-refresh relative timestamps every 60 seconds
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // Reset cursors and search when filters change
  useEffect(() => {
    setCursors([undefined]);
    setSearchText("");
  }, [dateRange, category]);

  const sinceTimestamp = useMemo(() => {
    if (!mounted) return 0;
    return Date.now() - dateRange * 24 * 60 * 60 * 1000;
  }, [dateRange, mounted]);

  const currentCursor = cursors[cursors.length - 1];

  const result = useQuery(api.activities.listPaginated, {
    limit: PAGE_SIZE,
    category: category || undefined,
    excludeCategories: category ? undefined : ["noise"],
    sinceTimestamp,
    cursor: currentCursor,
  });

  const stats = useQuery(api.activities.stats, { sinceTimestamp });

  const rawActivities = result?.items as Activity[] | undefined;
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
      a.actionType.toLowerCase().includes(lower)
    );
  }, [rawActivities, searchText]);

  const loadNext = useCallback(() => {
    if (nextCursor !== undefined) {
      setCursors(prev => [...prev, nextCursor]);
    }
  }, [nextCursor]);

  const loadPrev = useCallback(() => {
    setCursors(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  }, []);

  const dateLabel = getDateLabel(dateRange);

  return (
    <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
      <CardHeader className="pb-2 flex-shrink-0 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Activity Feed</CardTitle>
        </div>

        {/* Stats Banner */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            <div className="rounded-lg bg-muted/50 p-2.5">
              <div className="text-xs text-muted-foreground">{dateLabel} Activities</div>
              <div className="text-base sm:text-lg font-semibold mt-0.5">{stats.total}</div>
            </div>
            <div className="rounded-lg bg-purple-500/5 border border-purple-500/10 p-2.5">
              <div className="text-xs text-purple-400">Tokens</div>
              <div className="text-base sm:text-lg font-semibold text-purple-400 dark:text-purple-300 mt-0.5">
                {stats.totalTokens > 0 ? formatTokens(stats.totalTokens) : "—"}
              </div>
            </div>
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-2.5">
              <div className="text-xs text-emerald-400">Cost</div>
              <div className="text-base sm:text-lg font-semibold text-emerald-400 dark:text-emerald-300 mt-0.5">
                {stats.totalCost > 0 ? formatCost(stats.totalCost) : "—"}
              </div>
            </div>
            <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-2.5">
              <div className="text-xs text-blue-400">Categories</div>
              <div className="flex flex-wrap gap-1 mt-1 min-h-[24px]">
                {Object.entries(stats.byCategory).map(([cat, count]) => (
                  <Badge
                    key={cat}
                    variant="outline"
                    className={`text-[9px] px-1 py-0 ${CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.system}`}
                  >
                    {cat} {count}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-3">
          <div className="flex flex-wrap items-center gap-1">
            {CATEGORIES.map(cat => (
              <Button
                key={cat.value}
                variant={category === cat.value ? "default" : "outline"}
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setCategory(cat.value)}
              >
                <span className="sm:hidden">{cat.value ? cat.label.split(" ")[0] : "All"}</span>
                <span className="hidden sm:inline">{cat.label}</span>
              </Button>
            ))}
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
            placeholder="Filter activities..."
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
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden flex flex-col px-4">
        <ScrollArea className="flex-1 pr-4">
          {!activities ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Loading activities...
            </div>
          ) : activities.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              {searchText ? `No activities matching "${searchText}"` : "No activities in this period"}
            </div>
          ) : (
            <div className="space-y-1.5">
              {activities.map((activity: Activity) => (
                <ActivityItem key={activity._id} activity={activity} />
              ))}
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
            <span className="text-xs text-muted-foreground">
              Page {currentPage}
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

function ActivityItem({ activity }: { activity: Activity }) {
  const [expanded, setExpanded] = useState(false);
  const icon = ACTION_TYPE_ICONS[activity.actionType] || "📌";
  const categoryColor = CATEGORY_COLORS[activity.category ?? "system"] || CATEGORY_COLORS.system;

  const meta = activity.metadata;
  const hasExpandableContent = meta && (
    meta.error || meta.tool || meta.session || meta.sessionKey || meta.channel ||
    meta.model || meta.tokens || meta.cost || meta.duration
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={`p-2.5 rounded-lg border transition-colors cursor-pointer ${
        activity.status === "error"
          ? "border-red-500/30 bg-red-500/5"
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
        <span className="text-base mt-0.5">{icon}</span>
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
            <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
              {formatTime(activity.timestamp)}
              {hasExpandableContent && (
                <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
              )}
            </span>
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
                  {meta.duration > 1000
                    ? `${(meta.duration / 1000).toFixed(1)}s`
                    : `${meta.duration}ms`
                  }
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
                    <span>{meta.duration > 1000 ? `${(meta.duration / 1000).toFixed(1)}s` : `${meta.duration}ms`}</span>
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
