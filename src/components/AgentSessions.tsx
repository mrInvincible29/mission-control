"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, RefreshCw, Clock } from "lucide-react";

interface SessionMeta {
  id: string;
  timestamp?: number;
  model: string;
  provider: string;
  messageCount: number;
  toolCallCount: number;
  prompt: string;
  totalCost: number;
  totalTokens: number;
  lastActivity?: number;
  file?: string;
  fileSize?: number;
  modifiedAt?: string;
}

interface TimelineItem {
  timestamp?: number;
  role: string;
  text: string;
  tools: Array<{ name: string; arguments: string }>;
  thinking: string;
  usage: { tokens?: number; cost?: number } | null;
}

interface SessionDetail extends SessionMeta {
  timeline: TimelineItem[];
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return "unknown";
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

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

function getPromptLabel(prompt: string): string {
  if (!prompt) return "No prompt";
  const firstLine = prompt.split("\n")[0].trim();
  return firstLine.slice(0, 80) + (firstLine.length > 80 ? "..." : "");
}

const PAGE_SIZE = 25;

export function AgentSessions() {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastFetch, setLastFetch] = useState<number>(0);
  const [page, setPage] = useState(0);

  // Abort controllers to prevent request pileup
  const sessionsAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const sessionsEtagRef = useRef<string>("");

  // Fetch sessions list (with AbortController + ETag)
  const fetchSessions = useCallback(async () => {
    if (sessionsAbortRef.current) sessionsAbortRef.current.abort();
    const controller = new AbortController();
    sessionsAbortRef.current = controller;

    try {
      const headers: HeadersInit = {};
      if (sessionsEtagRef.current) {
        headers["If-None-Match"] = sessionsEtagRef.current;
      }

      const res = await fetch("/api/agents?action=list&limit=50", {
        signal: controller.signal,
        headers,
      });

      if (res.status === 304) {
        setLastFetch(Date.now());
        return;
      }

      const etag = res.headers.get("etag");
      if (etag) sessionsEtagRef.current = etag;

      const data: SessionMeta[] = await res.json();

      setSessions((prev) => {
        if (prev.length !== data.length) return data;
        for (let i = 0; i < data.length; i++) {
          if (prev[i].id !== data[i].id || prev[i].modifiedAt !== data[i].modifiedAt) {
            return data;
          }
        }
        return prev;
      });

      setLastFetch(Date.now());
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error("Failed to fetch sessions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch session detail (with AbortController)
  const fetchDetail = useCallback(async (id: string, showLoading = true) => {
    if (detailAbortRef.current) detailAbortRef.current.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;

    if (showLoading) setDetailLoading(true);
    try {
      const res = await fetch(
        `/api/agents?action=detail&id=${encodeURIComponent(id)}`,
        { signal: controller.signal }
      );
      const data: SessionDetail = await res.json();
      setDetail(data);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error("Failed to fetch session detail:", err);
      if (showLoading) setDetail(null);
    } finally {
      if (showLoading) setDetailLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Auto-refresh with Page Visibility API (pause when tab hidden / phone locked)
  useEffect(() => {
    if (!autoRefresh) return;

    const poll = () => {
      if (document.hidden) return;
      fetchSessions();
      if (selectedId) fetchDetail(selectedId, false);
    };

    const interval = setInterval(poll, 10000);

    const onVisible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [autoRefresh, fetchSessions, fetchDetail, selectedId]);

  // Load detail when selection changes
  useEffect(() => {
    if (selectedId) {
      fetchDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, fetchDetail]);

  // Filter sessions by search
  const filteredSessions = useMemo(() => {
    if (!searchText.trim()) return sessions;
    const lower = searchText.toLowerCase();
    return sessions.filter(
      (s) =>
        s.prompt.toLowerCase().includes(lower) ||
        s.model.toLowerCase().includes(lower) ||
        s.id.toLowerCase().includes(lower)
    );
  }, [sessions, searchText]);

  // Pagination
  const totalPages = Math.ceil(filteredSessions.length / PAGE_SIZE);
  const paginatedSessions = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filteredSessions.slice(start, start + PAGE_SIZE);
  }, [filteredSessions, page]);

  // Reset page when search changes
  useEffect(() => {
    setPage(0);
  }, [searchText]);

  // Prevent unnecessary re-renders with memoization
  const handleSelectSession = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleRefresh = useCallback(() => {
    fetchSessions();
    if (selectedId) {
      fetchDetail(selectedId);
    }
  }, [fetchSessions, fetchDetail, selectedId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-200px)]">
      {/* Session List - hidden on mobile when detail is selected */}
      <Card className={`border-border/60 bg-muted/30 shadow-sm flex flex-col min-h-0 ${selectedId ? "hidden lg:flex" : "flex"}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">Sessions</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant={autoRefresh ? "default" : "outline"}
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${autoRefresh ? "animate-spin" : ""}`} />
                Auto
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 px-2"
                onClick={handleRefresh}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Search/Filter */}
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search sessions..."
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

          {/* Stats */}
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>{filteredSessions.length} sessions</span>
            <span className="flex items-center gap-1">
              {lastFetch > 0 && (
                <>
                  <Clock className="h-3 w-3" />
                  Updated {formatTime(lastFetch)}
                </>
              )}
            </span>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden">
          <ScrollArea className="h-full pr-4">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                Loading sessions...
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                {searchText ? `No sessions matching "${searchText}"` : "No sessions found"}
              </div>
            ) : (
              <div className="space-y-2">
                {paginatedSessions.map((session) => (
                  <SessionListItem
                    key={session.id}
                    session={session}
                    isSelected={selectedId === session.id}
                    onSelect={handleSelectSession}
                  />
                ))}

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-3 pb-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 px-3"
                      disabled={page === 0}
                      onClick={() => setPage(p => p - 1)}
                    >
                      ← Prev
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {page + 1} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 px-3"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(p => p + 1)}
                    >
                      Next →
                    </Button>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Detail View - hidden on mobile when no selection */}
      <Card className={`border-border/60 bg-muted/30 shadow-sm flex flex-col min-h-0 ${!selectedId ? "hidden lg:flex" : "flex"}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">Detail</CardTitle>
            {selectedId && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 px-2 lg:hidden"
                onClick={() => setSelectedId(null)}
              >
                ← Back
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden">
          {!selectedId ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select a session to view details
            </div>
          ) : detailLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Loading...
            </div>
          ) : detail ? (
            <SessionDetailView detail={detail} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Failed to load session
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SessionListItem({
  session,
  isSelected,
  onSelect,
}: {
  session: SessionMeta;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`p-3 rounded-lg border transition-colors cursor-pointer ${
        isSelected
          ? "border-primary bg-primary/10"
          : "border-border/50 bg-card/50 hover:bg-card/80"
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      onClick={() => onSelect(session.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(session.id);
        }
      }}
    >
      <div className="text-sm text-foreground/90 font-medium line-clamp-2 mb-2">
        {getPromptLabel(session.prompt)}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 bg-purple-500/20 text-purple-400 border-purple-500/30"
        >
          {session.model}
        </Badge>
        {session.totalCost > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
          >
            {formatCost(session.totalCost)}
          </Badge>
        )}
        {session.totalTokens > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 bg-blue-500/20 text-blue-400 border-blue-500/30"
          >
            {formatTokens(session.totalTokens)} tokens
          </Badge>
        )}
        {session.toolCallCount > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
          >
            {session.toolCallCount} tools
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{session.messageCount} messages</span>
        <span>{formatTime(session.lastActivity || session.timestamp)}</span>
      </div>
    </div>
  );
}

function SessionDetailView({ detail }: { detail: SessionDetail }) {
  return (
    <ScrollArea className="h-full pr-1 sm:pr-4">
      <div className="space-y-4 min-w-0">
        {/* Header Stats */}
        <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 overflow-hidden">
          <div className="flex items-start gap-2">
            <span className="text-xs text-muted-foreground w-20 shrink-0">Session ID</span>
            <span className="text-xs font-mono break-all min-w-0">{detail.id}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-20 shrink-0">Model</span>
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 bg-purple-500/20 text-purple-400 border-purple-500/30"
            >
              {detail.model}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-20 shrink-0">Messages</span>
            <span className="text-xs">{detail.messageCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-20 shrink-0">Tool Calls</span>
            <span className="text-xs">{detail.toolCallCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-20 shrink-0">Total Cost</span>
            <span className="text-xs text-emerald-400">{formatCost(detail.totalCost)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-20 shrink-0">Total Tokens</span>
            <span className="text-xs text-blue-400">{formatTokens(detail.totalTokens)}</span>
          </div>
        </div>

        {/* Initial Prompt */}
        {detail.prompt && (
          <div className="rounded-lg border border-border/60 bg-card/50 p-2 sm:p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">Initial Prompt</div>
            <div className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
              {detail.prompt}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Timeline</div>
          {[...detail.timeline].reverse().map((item, idx) => (
            <TimelineMessage key={idx} item={item} />
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}

function TimelineMessage({ item }: { item: TimelineItem }) {
  const borderColor =
    item.role === "user"
      ? "border-blue-500/50"
      : item.role === "assistant"
      ? "border-purple-500/50"
      : "border-border/60";

  return (
    <div className={`rounded-lg border-2 ${borderColor} bg-card/50 p-2 sm:p-3 space-y-2 min-w-0`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 ${
            item.role === "user"
              ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
              : item.role === "assistant"
              ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
              : "bg-gray-500/20 text-gray-400 border-gray-500/30"
          }`}
        >
          {item.role}
        </Badge>
        {item.timestamp && (
          <span className="text-xs text-muted-foreground">{formatTime(item.timestamp)}</span>
        )}
      </div>

      {/* Thinking Block */}
      {item.thinking && (
        <div className="rounded bg-muted/50 p-2 border border-border/40">
          <div className="text-[10px] font-medium text-muted-foreground mb-1">💭 Thinking</div>
          <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
            {item.thinking}
          </div>
        </div>
      )}

      {/* Text Content */}
      {item.text && (
        <div className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
          {item.text}
        </div>
      )}

      {/* Tool Calls */}
      {item.tools.length > 0 && (
        <div className="space-y-1.5">
          {item.tools.map((tool, toolIdx) => (
            <div
              key={toolIdx}
              className="rounded bg-cyan-500/10 border border-cyan-500/20 p-1.5 sm:p-2"
            >
              <div className="text-[10px] font-medium text-cyan-400 mb-1">
                🔧 {tool.name}
              </div>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono overflow-x-auto">
                {tool.arguments}
              </pre>
            </div>
          ))}
        </div>
      )}

      {/* Usage Stats */}
      {item.usage && (item.usage.tokens || item.usage.cost) && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
          {item.usage.tokens && <span>{formatTokens(item.usage.tokens)} tokens</span>}
          {item.usage.cost && (
            <span className="text-emerald-400">{formatCost(item.usage.cost)}</span>
          )}
        </div>
      )}
    </div>
  );
}
