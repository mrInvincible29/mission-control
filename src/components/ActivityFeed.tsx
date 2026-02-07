"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import type { Activity } from "@/types";

const ACTION_TYPE_COLORS: Record<string, string> = {
  exec: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  read: "bg-green-500/20 text-green-400 border-green-500/30",
  write: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  message: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  search: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  browser: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  default: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  success: "bg-emerald-500/20 text-emerald-400",
  error: "bg-red-500/20 text-red-400",
  pending: "bg-amber-500/20 text-amber-400",
};

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

export function ActivityFeed() {
  const [filter, setFilter] = useState<string | undefined>();
  const activities = useQuery(api.activities.list, { limit: 100, actionType: filter }) as Activity[] | undefined;
  const actionTypes = useQuery(api.activities.getActionTypes) as string[] | undefined;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Activity Feed</CardTitle>
          <select
            value={filter || ""}
            onChange={(e) => setFilter(e.target.value || undefined)}
            className="text-sm bg-background border border-border rounded px-2 py-1"
          >
            <option value="">All Types</option>
            {actionTypes?.map((type: string) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          {!activities ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Loading activities...
            </div>
          ) : activities.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              No activities yet
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((activity: Activity) => (
                <div
                  key={activity._id}
                  className="p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant="outline"
                          className={ACTION_TYPE_COLORS[activity.actionType] || ACTION_TYPE_COLORS.default}
                        >
                          {activity.actionType}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={STATUS_COLORS[activity.status]}
                        >
                          {activity.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-foreground/90 line-clamp-2">
                        {activity.description}
                      </p>
                      {activity.metadata && (
                        <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                          {activity.metadata.tool && (
                            <span>Tool: {activity.metadata.tool}</span>
                          )}
                          {activity.metadata.session && (
                            <span>Session: {activity.metadata.session}</span>
                          )}
                          {activity.metadata.duration && (
                            <span>{activity.metadata.duration}ms</span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTime(activity.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
