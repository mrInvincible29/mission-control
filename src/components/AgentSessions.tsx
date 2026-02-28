"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, RefreshCw, Clock, ChevronDown, ChevronRight, Copy, Check, Timer } from "lucide-react";
import { formatTokens, formatCost, formatRelativeTime } from "@/lib/formatters";

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

// formatTokens, formatCost, formatRelativeTime imported from @/lib/formatters

function getPromptLabel(prompt: string): string {
  if (!prompt) return "No prompt";
  const firstLine = prompt.split("\n")[0].trim();
  return firstLine.slice(0, 80) + (firstLine.length > 80 ? "..." : "");
}

/** Format a duration in ms to a human-readable string */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/** Try to pretty-print a JSON string; returns null if not valid JSON */
function tryFormatJson(str: string): string | null {
  if (!str || (!str.startsWith("{") && !str.startsWith("["))) return null;
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}

/** Compute session duration from timeline timestamps */
function getSessionDuration(detail: SessionDetail): number | null {
  const timestamps = detail.timeline
    .map((item) => item.timestamp)
    .filter((t): t is number => t != null && t > 0);
  if (timestamps.length < 2) return null;
  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  const diff = max - min;
  return diff > 0 ? diff : null;
}

/** Copy text to clipboard with a temporary visual confirmation */
function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for non-HTTPS contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      title={label || "Copy to clipboard"}
      aria-label={label || "Copy to clipboard"}
    >
      {copied ? (
        <Check className="size-3 text-emerald-400" />
      ) : (
        <Copy className="size-3" />
      )}
      {copied && <span className="text-emerald-400">Copied</span>}
    </button>
  );
}

const PAGE_SIZE = 25;
const THINKING_COLLAPSE_THRESHOLD = 200;

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

  // Listen for global "r" key refresh event
  useEffect(() => {
    const handler = () => {
      fetchSessions();
      if (selectedId) fetchDetail(selectedId, false);
    };
    window.addEventListener("refresh-view", handler);
    return () => window.removeEventListener("refresh-view", handler);
  }, [fetchSessions, fetchDetail, selectedId]);

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
                  Updated {formatRelativeTime(lastFetch)}
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
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                {searchText ? (
                  <>
                    <Search className="size-8 opacity-20" />
                    <p className="text-sm">No sessions matching &ldquo;{searchText}&rdquo;</p>
                  </>
                ) : (
                  <>
                    <Clock className="size-8 opacity-20" />
                    <p className="text-sm">No active sessions</p>
                    <p className="text-xs text-muted-foreground/50">Sessions appear when agents start working</p>
                  </>
                )}
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
                      Prev
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
                      Next
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
                Back
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
  // Compute session duration from first to last activity
  const durationLabel = useMemo(() => {
    if (!session.timestamp || !session.lastActivity) return null;
    const diff = session.lastActivity - session.timestamp;
    return diff > 0 ? formatDuration(diff) : null;
  }, [session.timestamp, session.lastActivity]);

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
        {durationLabel && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 bg-orange-500/20 text-orange-400 border-orange-500/30"
          >
            {durationLabel}
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{session.messageCount} messages</span>
        <span>{formatRelativeTime(session.lastActivity || session.timestamp)}</span>
      </div>
    </div>
  );
}

function SessionDetailView({ detail }: { detail: SessionDetail }) {
  const duration = useMemo(() => getSessionDuration(detail), [detail]);

  return (
    <ScrollArea className="h-full pr-1 sm:pr-4">
      <div className="space-y-4 min-w-0">
        {/* Header Stats */}
        <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 overflow-hidden">
          <div className="flex items-start gap-2">
            <span className="text-xs text-muted-foreground w-20 shrink-0">Session ID</span>
            <span className="text-xs font-mono break-all min-w-0 flex-1">{detail.id}</span>
            <CopyButton text={detail.id} label="Copy session ID" />
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
          {duration != null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Duration</span>
              <span className="text-xs text-orange-400 flex items-center gap-1">
                <Timer className="size-3" />
                {formatDuration(duration)}
              </span>
            </div>
          )}
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

        {/* Timeline — chronological order (oldest first) */}
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">
            Timeline ({detail.timeline.length} messages)
          </div>
          {detail.timeline.map((item, idx) => (
            <TimelineMessage key={idx} item={item} index={idx + 1} />
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}

function TimelineMessage({ item, index }: { item: TimelineItem; index: number }) {
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
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/50 font-mono">#{index}</span>
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
        </div>
        {item.timestamp && (
          <span className="text-xs text-muted-foreground">{formatRelativeTime(item.timestamp)}</span>
        )}
      </div>

      {/* Collapsible Thinking Block */}
      {item.thinking && (
        <CollapsibleThinking text={item.thinking} />
      )}

      {/* Text Content */}
      {item.text && (
        <div className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
          {item.text}
        </div>
      )}

      {/* Tool Calls with JSON formatting and copy */}
      {item.tools.length > 0 && (
        <div className="space-y-1.5">
          {item.tools.map((tool, toolIdx) => (
            <ToolCallBlock key={toolIdx} tool={tool} />
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

/** Collapsible thinking block — collapses long thinking text by default */
function CollapsibleThinking({ text }: { text: string }) {
  const isLong = text.length > THINKING_COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(!isLong);

  return (
    <div className="rounded bg-muted/50 border border-border/40 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-muted/70 transition-colors text-left"
        aria-label={expanded ? "Collapse thinking" : "Expand thinking"}
      >
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground flex-shrink-0" />
        )}
        <span className="text-[10px] font-medium text-muted-foreground">Thinking</span>
        {!expanded && (
          <span className="text-[10px] text-muted-foreground/50 truncate ml-1">
            {text.slice(0, 80)}...
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/40 ml-auto flex-shrink-0">
          {text.length > 1000
            ? `${(text.length / 1000).toFixed(1)}K chars`
            : `${text.length} chars`}
        </span>
      </button>
      {expanded && (
        <div className="px-2 pb-2 border-t border-border/30">
          <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words mt-1.5 max-h-[300px] overflow-y-auto">
            {text}
          </div>
        </div>
      )}
    </div>
  );
}

/** Tool call block with JSON formatting and copy button */
function ToolCallBlock({ tool }: { tool: { name: string; arguments: string } }) {
  const [expanded, setExpanded] = useState(true);
  const formatted = useMemo(() => tryFormatJson(tool.arguments), [tool.arguments]);
  const displayText = formatted || tool.arguments;
  const isLong = displayText.length > 300;

  return (
    <div className="rounded bg-cyan-500/10 border border-cyan-500/20 overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-left hover:text-cyan-300 transition-colors"
        >
          {isLong && (
            expanded ? (
              <ChevronDown className="size-3 text-cyan-400/60 flex-shrink-0" />
            ) : (
              <ChevronRight className="size-3 text-cyan-400/60 flex-shrink-0" />
            )
          )}
          <span className="text-[10px] font-medium text-cyan-400">
            {tool.name}
          </span>
        </button>
        <CopyButton text={tool.arguments} label={`Copy ${tool.name} arguments`} />
      </div>
      {expanded && (
        <div className="px-2 pb-2 border-t border-cyan-500/10">
          <pre className={`text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono mt-1.5 ${
            isLong ? "max-h-[200px] overflow-y-auto" : ""
          }`}>
            {displayText}
          </pre>
        </div>
      )}
    </div>
  );
}
