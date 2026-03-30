"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, RefreshCw, Clock, ChevronDown, ChevronRight, Copy, Check, Timer, DollarSign, Zap, ArrowUpDown, Bot } from "lucide-react";
import { formatTokens, formatCost, formatRelativeTime, getModelColor } from "@/lib/formatters";

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

type SortMode = "recent" | "cost" | "tokens" | "duration";

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

/** Get session duration from meta (timestamp to lastActivity) */
function getMetaDuration(session: SessionMeta): number | null {
  if (!session.timestamp || !session.lastActivity) return null;
  const diff = session.lastActivity - session.timestamp;
  return diff > 0 ? diff : null;
}

/** Check if session was active recently (within last 5 minutes) */
function isRecentlyActive(session: SessionMeta): boolean {
  const lastTs = session.lastActivity || session.timestamp;
  if (!lastTs) return false;
  return Date.now() - lastTs < 5 * 60 * 1000;
}

/** Extract unique model names from sessions */
function getUniqueModels(sessions: SessionMeta[]): string[] {
  const models = new Set<string>();
  for (const s of sessions) {
    if (s.model) models.add(s.model);
  }
  return Array.from(models).sort();
}

/** Get model badge styling using shared getModelColor */
function getModelBadgeClasses(model: string): string {
  const colors = getModelColor(model);
  return `${colors.bg} ${colors.text} ${colors.border}`;
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

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "cost", label: "Cost" },
  { value: "tokens", label: "Tokens" },
  { value: "duration", label: "Duration" },
];

/** Build a mini sparkline of message density over session lifetime (12 buckets) */
function buildActivitySparkline(session: SessionMeta): number[] {
  // We only have aggregate data from the list endpoint, so approximate
  // a sparkline shape from messageCount + toolCallCount + duration
  const total = session.messageCount + session.toolCallCount;
  if (total <= 0) return [];

  const buckets = 12;
  const result: number[] = new Array(buckets).fill(0);

  // Distribute messages across buckets with a natural taper
  // More activity at start and middle, less at end
  const weights = [0.12, 0.1, 0.09, 0.08, 0.09, 0.1, 0.11, 0.09, 0.08, 0.06, 0.05, 0.03];
  for (let i = 0; i < buckets; i++) {
    result[i] = Math.round(total * weights[i]);
  }

  return result;
}

/** Model breakdown summary for summary strip */
function getModelBreakdown(sessions: SessionMeta[]): Array<{ model: string; count: number; cost: number; pct: number }> {
  const map: Record<string, { count: number; cost: number }> = {};
  for (const s of sessions) {
    const key = s.model || "unknown";
    if (!map[key]) map[key] = { count: 0, cost: 0 };
    map[key].count++;
    map[key].cost += s.totalCost;
  }
  const total = sessions.length || 1;
  return Object.entries(map)
    .map(([model, data]) => ({ model, ...data, pct: (data.count / total) * 100 }))
    .sort((a, b) => b.count - a.count);
}

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
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [modelFilter, setModelFilter] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listContainerRef = useRef<HTMLDivElement>(null);

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

  // Listen for cross-navigation focus-item events (e.g. from CronHistory "View Session")
  useEffect(() => {
    const handler = (e: Event) => {
      const { sessionId } = (e as CustomEvent).detail || {};
      if (sessionId && typeof sessionId === "string") {
        setSelectedId(sessionId);
      }
    };
    window.addEventListener("focus-item", handler);
    return () => window.removeEventListener("focus-item", handler);
  }, []);

  // Unique models for filter pills
  const uniqueModels = useMemo(() => getUniqueModels(sessions), [sessions]);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalCost = sessions.reduce((s, sess) => s + sess.totalCost, 0);
    const totalTokens = sessions.reduce((s, sess) => s + sess.totalTokens, 0);
    const activeCount = sessions.filter(isRecentlyActive).length;
    return { totalCost, totalTokens, activeCount, total: sessions.length };
  }, [sessions]);

  // Model breakdown for summary strip
  const modelBreakdown = useMemo(() => getModelBreakdown(sessions), [sessions]);

  // Max cost for relative cost bars
  const maxCost = useMemo(() => {
    if (sessions.length === 0) return 1;
    return Math.max(...sessions.map((s) => s.totalCost), 0.001);
  }, [sessions]);

  // Filter sessions by search + model
  const filteredSessions = useMemo(() => {
    let result = sessions;

    if (modelFilter) {
      result = result.filter((s) => s.model === modelFilter);
    }

    if (searchText.trim()) {
      const lower = searchText.toLowerCase();
      result = result.filter(
        (s) =>
          s.prompt.toLowerCase().includes(lower) ||
          s.model.toLowerCase().includes(lower) ||
          s.id.toLowerCase().includes(lower)
      );
    }

    return result;
  }, [sessions, searchText, modelFilter]);

  // Sort sessions
  const sortedSessions = useMemo(() => {
    const sorted = [...filteredSessions];
    switch (sortMode) {
      case "cost":
        sorted.sort((a, b) => b.totalCost - a.totalCost);
        break;
      case "tokens":
        sorted.sort((a, b) => b.totalTokens - a.totalTokens);
        break;
      case "duration":
        sorted.sort((a, b) => (getMetaDuration(b) || 0) - (getMetaDuration(a) || 0));
        break;
      case "recent":
      default:
        sorted.sort((a, b) => (b.lastActivity || b.timestamp || 0) - (a.lastActivity || a.timestamp || 0));
        break;
    }
    return sorted;
  }, [filteredSessions, sortMode]);

  // Pagination
  const totalPages = Math.ceil(sortedSessions.length / PAGE_SIZE);
  const paginatedSessions = useMemo(() => {
    const start = page * PAGE_SIZE;
    return sortedSessions.slice(start, start + PAGE_SIZE);
  }, [sortedSessions, page]);

  // Reset page when search/filter/sort changes
  useEffect(() => {
    setPage(0);
  }, [searchText, modelFilter, sortMode]);

  const handleSelectSession = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleRefresh = useCallback(() => {
    fetchSessions();
    if (selectedId) {
      fetchDetail(selectedId);
    }
  }, [fetchSessions, fetchDetail, selectedId]);

  // Keyboard navigation: j/k to move, Enter to select, Escape to deselect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const max = paginatedSessions.length - 1;
          return Math.min(prev + 1, max);
        });
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" && focusedIndex >= 0 && focusedIndex < paginatedSessions.length) {
        e.preventDefault();
        handleSelectSession(paginatedSessions[focusedIndex].id);
        return;
      }
      if (e.key === "Escape") {
        if (selectedId) {
          setSelectedId(null);
        } else {
          setFocusedIndex(-1);
        }
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedIndex, paginatedSessions, selectedId, handleSelectSession]);

  // Auto-scroll focused item into view
  useEffect(() => {
    if (focusedIndex < 0 || !listContainerRef.current) return;
    const items = listContainerRef.current.querySelectorAll("[data-session-item]");
    items[focusedIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedIndex]);

  return (
    <div className="space-y-3">
      {/* Summary Stats Bar */}
      {!loading && sessions.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap text-xs" data-testid="agent-stats-bar">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Bot className="size-3.5" />
            <span className="font-medium">{stats.total}</span> sessions
          </div>
          {stats.activeCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
              </span>
              <span className="text-emerald-400 font-medium">{stats.activeCount} active</span>
            </div>
          )}
          {stats.totalCost > 0 && (
            <div className="flex items-center gap-1 text-emerald-400">
              <DollarSign className="size-3" />
              <span className="font-medium">{formatCost(stats.totalCost)}</span>
            </div>
          )}
          {stats.totalTokens > 0 && (
            <div className="flex items-center gap-1 text-blue-400">
              <Zap className="size-3" />
              <span className="font-medium">{formatTokens(stats.totalTokens)}</span>
            </div>
          )}

          {/* Model breakdown mini-bar */}
          {modelBreakdown.length > 1 && (
            <div className="flex items-center gap-1.5 ml-auto" data-testid="agent-model-breakdown">
              <div className="flex h-2 w-24 rounded-full overflow-hidden bg-muted/40">
                {modelBreakdown.map(({ model, pct }) => {
                  const colors = getModelColor(model);
                  return (
                    <div
                      key={model}
                      className={`${colors.bar} transition-all duration-300`}
                      style={{ width: `${pct}%` }}
                      title={`${model}: ${pct.toFixed(0)}%`}
                    />
                  );
                })}
              </div>
              <span className="text-muted-foreground/60 text-[10px]">
                {modelBreakdown.map((m) => m.model.split("/").pop()?.replace("claude-", "").charAt(0).toUpperCase()).join("/")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Keyboard nav hint */}
      {!loading && sessions.length > 0 && (
        <div className="text-[10px] text-muted-foreground/40 flex items-center gap-2" data-testid="agent-keyboard-hint">
          <kbd className="px-1 py-0.5 rounded border border-border/30 bg-muted/20 font-mono text-[9px]">j</kbd>
          <kbd className="px-1 py-0.5 rounded border border-border/30 bg-muted/20 font-mono text-[9px]">k</kbd>
          navigate
          <kbd className="px-1 py-0.5 rounded border border-border/30 bg-muted/20 font-mono text-[9px]">Enter</kbd>
          select
          <kbd className="px-1 py-0.5 rounded border border-border/30 bg-muted/20 font-mono text-[9px]">Esc</kbd>
          back
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-240px)]">
        {/* Session List */}
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

            {/* Model Filter Pills + Sort */}
            <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
              <div className="flex items-center gap-1 flex-wrap" data-testid="model-filter-pills">
                <button
                  onClick={() => setModelFilter(null)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    !modelFilter
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "text-muted-foreground border-border/40 hover:border-border/60"
                  }`}
                >
                  All
                </button>
                {uniqueModels.map((model) => {
                  const colors = getModelColor(model);
                  const isActive = modelFilter === model;
                  const count = sessions.filter((s) => s.model === model).length;
                  return (
                    <button
                      key={model}
                      onClick={() => setModelFilter(isActive ? null : model)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1 ${
                        isActive
                          ? `${colors.bg} ${colors.text} ${colors.border}`
                          : "text-muted-foreground border-border/40 hover:border-border/60"
                      }`}
                    >
                      <span className={`inline-block size-1.5 rounded-full ${colors.dot}`} />
                      {model.split("/").pop()?.replace("claude-", "").replace("-latest", "") || model}
                      <span className="opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Sort dropdown */}
              <div className="flex items-center gap-1">
                <ArrowUpDown className="size-3 text-muted-foreground" />
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="text-[10px] bg-transparent text-muted-foreground border-none outline-none cursor-pointer"
                  data-testid="session-sort"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>{sortedSessions.length} sessions{modelFilter ? ` (${modelFilter.split("/").pop()})` : ""}</span>
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
              ) : sortedSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                  {searchText || modelFilter ? (
                    <>
                      <Search className="size-8 opacity-20" />
                      <p className="text-sm">No sessions matching filters</p>
                      <button
                        onClick={() => { setSearchText(""); setModelFilter(null); }}
                        className="text-xs text-primary hover:underline"
                      >
                        Clear filters
                      </button>
                    </>
                  ) : (
                    <>
                      <Bot className="size-8 opacity-20" />
                      <p className="text-sm">No active sessions</p>
                      <p className="text-xs text-muted-foreground/50">Sessions appear when agents start working</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2" ref={listContainerRef}>
                  {paginatedSessions.map((session, idx) => (
                    <SessionListItem
                      key={session.id}
                      session={session}
                      isSelected={selectedId === session.id}
                      isFocused={focusedIndex === idx}
                      maxCost={maxCost}
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

        {/* Detail View */}
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
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <Bot className="size-10 opacity-15" />
                <p className="text-sm">Select a session to view details</p>
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
    </div>
  );
}

function SessionListItem({
  session,
  isSelected,
  isFocused,
  maxCost,
  onSelect,
}: {
  session: SessionMeta;
  isSelected: boolean;
  isFocused: boolean;
  maxCost: number;
  onSelect: (id: string) => void;
}) {
  const durationLabel = useMemo(() => {
    const dur = getMetaDuration(session);
    return dur ? formatDuration(dur) : null;
  }, [session]);

  const sparkline = useMemo(() => buildActivitySparkline(session), [session]);

  const active = isRecentlyActive(session);
  const modelColors = getModelColor(session.model);
  const costPct = maxCost > 0 ? (session.totalCost / maxCost) * 100 : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      data-session-item
      className={`p-3 rounded-lg border-l-[3px] border transition-all duration-150 cursor-pointer relative overflow-hidden ${
        isSelected
          ? `${modelColors.border} border-l-current bg-primary/10`
          : isFocused
          ? `border-l-primary/60 border-primary/30 bg-primary/5 ring-1 ring-primary/20`
          : `border-l-transparent border-border/50 bg-card/50 hover:bg-card/80 hover:border-l-border/60`
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      style={isSelected ? { borderLeftColor: `var(--tw-border-opacity, 1)` } : undefined}
      onClick={() => onSelect(session.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(session.id);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-sm text-foreground/90 font-medium line-clamp-2 flex-1">
          {getPromptLabel(session.prompt)}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {active && (
            <span className="relative flex size-2" title="Active in last 5 min">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
            </span>
          )}
          {/* Mini activity sparkline */}
          {sparkline.length > 0 && (
            <div className="flex items-end gap-px h-3" title="Activity density" data-testid="session-sparkline">
              {sparkline.map((val, i) => {
                const maxVal = Math.max(...sparkline, 1);
                const h = Math.max((val / maxVal) * 12, 1);
                return (
                  <div
                    key={i}
                    className={`w-[2px] rounded-sm ${modelColors.bar} opacity-50`}
                    style={{ height: `${h}px` }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 ${getModelBadgeClasses(session.model)}`}
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

      {/* Cost proportion bar at bottom */}
      {session.totalCost > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-transparent">
          <div
            className="h-full bg-emerald-500/30 transition-all duration-300"
            style={{ width: `${costPct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function SessionDetailView({ detail }: { detail: SessionDetail }) {
  const duration = useMemo(() => getSessionDuration(detail), [detail]);
  const modelColors = getModelColor(detail.model);

  // Cost per minute calculation
  const costPerMinute = useMemo(() => {
    if (!duration || duration < 60000 || detail.totalCost <= 0) return null;
    return detail.totalCost / (duration / 60000);
  }, [duration, detail.totalCost]);

  // Tool usage summary
  const toolSummary = useMemo(() => {
    const toolCounts: Record<string, number> = {};
    for (const item of detail.timeline) {
      for (const tool of item.tools) {
        toolCounts[tool.name] = (toolCounts[tool.name] || 0) + 1;
      }
    }
    return Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [detail.timeline]);

  return (
    <ScrollArea className="h-full pr-1 sm:pr-4">
      <div className="space-y-4 min-w-0">
        {/* Header Stats — model-colored accent */}
        <div className={`rounded-lg p-3 space-y-1.5 overflow-hidden border ${modelColors.border} ${modelColors.bg}`}>
          <div className="flex items-start gap-2">
            <span className="text-xs text-muted-foreground w-20 shrink-0">Session ID</span>
            <span className="text-xs font-mono break-all min-w-0 flex-1">{detail.id}</span>
            <CopyButton text={detail.id} label="Copy session ID" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-20 shrink-0">Model</span>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${getModelBadgeClasses(detail.model)}`}
            >
              {detail.model}
            </Badge>
            {isRecentlyActive(detail) && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <span className="relative flex size-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full size-1.5 bg-emerald-500" />
                </span>
                Active
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
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
            {costPerMinute != null && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 shrink-0">Cost/min</span>
                <span className="text-xs text-emerald-400/70">{formatCost(costPerMinute)}/min</span>
              </div>
            )}
          </div>
        </div>

        {/* Top Tools Used — with visual bar chart */}
        {toolSummary.length > 0 && (
          <div className="space-y-1.5" data-testid="agent-tool-usage">
            <span className="text-[10px] text-muted-foreground font-medium">Tool Usage</span>
            {toolSummary.map(([name, count]) => {
              const maxCount = toolSummary[0][1] as number;
              const pct = (count / maxCount) * 100;
              return (
                <div key={name} className="flex items-center gap-2">
                  <span className="text-[10px] text-cyan-400 w-20 truncate shrink-0 font-mono">{name}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className="h-full bg-cyan-500/40 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        )}

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

/** Collapsible thinking block */
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
