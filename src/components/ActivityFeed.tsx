"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
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
];

const CATEGORIES = [
  { label: "All", value: "" },
  { label: "🔴 Important", value: "important" },
  { label: "🤖 Model", value: "model" },
  { label: "💬 Messages", value: "message" },
  { label: "⚙️ System", value: "system" },
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

export function ActivityFeed() {
  const [category, setCategory] = useState<string>("");
  const [dateRange, setDateRange] = useState<number>(1); // Default to today
  
  // Memoize to prevent recalculating on every render (Date.now() changes)
  const sinceTimestamp = useMemo(() => {
    return Date.now() - dateRange * 24 * 60 * 60 * 1000;
  }, [dateRange]);
  
  const activities = useQuery(api.activities.list, {
    limit: 100,
    category: category || undefined,
    excludeCategories: category ? undefined : ["noise"],
    sinceTimestamp,
  }) as Activity[] | undefined;
  
  const stats = useQuery(api.activities.stats);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Activity Feed</CardTitle>
          {stats && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{stats.total} today</span>
              {stats.totalTokens > 0 && (
                <span>• {formatTokens(stats.totalTokens)} tokens</span>
              )}
              {stats.totalCost > 0 && (
                <span>• {formatCost(stats.totalCost)}</span>
              )}
            </div>
          )}
        </div>
        
        {/* Filters */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* Category filter */}
          <div className="flex items-center gap-1">
            {CATEGORIES.map(cat => (
              <Button
                key={cat.value}
                variant={category === cat.value ? "default" : "outline"}
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setCategory(cat.value)}
              >
                {cat.label}
              </Button>
            ))}
          </div>
          
          {/* Date range */}
          <div className="flex items-center gap-1 ml-auto">
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
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full pr-4">
          {!activities ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Loading activities...
            </div>
          ) : activities.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              No activities in this period
            </div>
          ) : (
            <div className="space-y-2">
              {activities.map((activity: Activity) => (
                <ActivityItem key={activity._id} activity={activity} />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function ActivityItem({ activity }: { activity: Activity }) {
  const icon = ACTION_TYPE_ICONS[activity.actionType] || "📌";
  const categoryColor = CATEGORY_COLORS[activity.category ?? "system"] || CATEGORY_COLORS.system;
  
  return (
    <div className={`p-2.5 rounded-lg border transition-colors ${
      activity.status === "error" 
        ? "border-red-500/30 bg-red-500/5" 
        : "border-border bg-card/50 hover:bg-card/80"
    }`}>
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
            <span className="text-xs text-muted-foreground ml-auto">
              {formatTime(activity.timestamp)}
            </span>
          </div>
          
          <p className="text-sm text-foreground/90 mt-1 line-clamp-2">
            {activity.description}
          </p>
          
          {/* Metadata row */}
          {activity.metadata && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {activity.metadata.model && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                  {activity.metadata.model}
                </span>
              )}
              {activity.metadata.tokens && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                  {formatTokens(activity.metadata.tokens)} tokens
                </span>
              )}
              {activity.metadata.cost && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                  {formatCost(activity.metadata.cost)}
                </span>
              )}
              {activity.metadata.duration && (
                <span className="text-[10px] text-muted-foreground">
                  {activity.metadata.duration > 1000 
                    ? `${(activity.metadata.duration / 1000).toFixed(1)}s`
                    : `${activity.metadata.duration}ms`
                  }
                </span>
              )}
              {activity.metadata.channel && (
                <span className="text-[10px] text-muted-foreground">
                  via {activity.metadata.channel}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
