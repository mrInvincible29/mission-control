"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RefreshCw,
  Search,
  X,
  ChevronDown,
  Terminal,
  Pause,
  Play,
  ArrowDown,
} from "lucide-react";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface LogSourceInfo {
  id: string;
  name: string;
  type: string;
  description: string;
  available: boolean;
}

const LEVEL_STYLES: Record<string, { badge: string; text: string }> = {
  error: { badge: "bg-red-500/20 text-red-400 border-red-500/30", text: "text-red-300" },
  warn: { badge: "bg-amber-500/20 text-amber-400 border-amber-500/30", text: "text-amber-300" },
  info: { badge: "bg-blue-500/20 text-blue-400 border-blue-500/30", text: "text-foreground/80" },
  debug: { badge: "bg-gray-500/20 text-gray-400 border-gray-500/30", text: "text-muted-foreground/60" },
};

const LINE_COUNTS = [50, 100, 200, 500];

function getLevelStyle(level: string) {
  return LEVEL_STYLES[level] || LEVEL_STYLES.info;
}

/** Highlight matching search terms in log messages with a yellow background */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-400/30 text-inherit rounded-sm px-px">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function LogViewer() {
  const [sources, setSources] = useState<LogSourceInfo[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>("mission-control");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(0);
  const [lineCount, setLineCount] = useState(100);
  const [filterText, setFilterText] = useState("");
  const [filterLevel, setFilterLevel] = useState<string>("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [, setTick] = useState(0);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const prevEntryCountRef = useRef(0);

  // Fetch available log sources on mount
  useEffect(() => {
    fetch("/api/logs")
      .then(res => res.json())
      .then(data => {
        if (data.sources) setSources(data.sources);
      })
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/logs?source=${selectedSource}&lines=${lineCount}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEntries(data.entries || []);
      setError(null);
      setLastRefresh(Date.now());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch logs");
    } finally {
      setLoading(false);
    }
  }, [selectedSource, lineCount]);

  // Initial fetch and when source/lineCount changes
  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  // Refresh on tab visibility
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) fetchLogs();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchLogs]);

  // Listen for global "r" key refresh event
  useEffect(() => {
    const handler = () => fetchLogs();
    window.addEventListener("refresh-view", handler);
    return () => window.removeEventListener("refresh-view", handler);
  }, [fetchLogs]);

  // "Updated Xs ago" ticker
  useEffect(() => {
    if (lastRefresh === 0) return;
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [lastRefresh]);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current && entries.length > prevEntryCountRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
    prevEntryCountRef.current = entries.length;
  }, [entries, autoScroll]);

  // Detect user scroll position to toggle auto-scroll indicator
  const handleScroll = useCallback(() => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      setAutoScroll(true);
    }
  }, []);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    let result = entries;
    if (filterLevel) {
      result = result.filter(e => e.level === filterLevel);
    }
    if (filterText.trim()) {
      const lower = filterText.toLowerCase();
      result = result.filter(e => e.message.toLowerCase().includes(lower));
    }
    return result;
  }, [entries, filterLevel, filterText]);

  // Stats
  const stats = useMemo(() => {
    const counts: Record<string, number> = { error: 0, warn: 0, info: 0, debug: 0 };
    for (const e of entries) {
      counts[e.level] = (counts[e.level] || 0) + 1;
    }
    return counts;
  }, [entries]);

  const currentSource = sources.find(s => s.id === selectedSource);

  return (
    <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
      {/* Connection error banner */}
      {error && entries.length > 0 && (
        <div className="mx-4 mt-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex items-center gap-2 text-xs">
          <RefreshCw className="h-3.5 w-3.5 text-amber-400 animate-spin flex-shrink-0" />
          <span className="text-amber-300">Connection lost — retrying...</span>
          <span className="text-muted-foreground/60 ml-auto">{error}</span>
        </div>
      )}

      <CardHeader className="pb-2 flex-shrink-0 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg font-semibold">Log Viewer</CardTitle>
            {currentSource && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {currentSource.name}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/60">
              {lastRefresh > 0 && `Updated ${Math.round((Date.now() - lastRefresh) / 1000)}s ago`}
            </span>
            <Button
              variant={autoRefresh ? "secondary" : "ghost"}
              size="sm"
              className="text-xs h-7 px-2 gap-1"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {autoRefresh ? "Live" : "Paused"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={fetchLogs}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Source selector */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {sources.map(source => (
            <Button
              key={source.id}
              variant={selectedSource === source.id ? "default" : "outline"}
              size="sm"
              className="text-xs h-7 px-2.5 gap-1.5"
              onClick={() => setSelectedSource(source.id)}
              disabled={!source.available}
            >
              <Terminal className="h-3 w-3" />
              {source.name}
            </Button>
          ))}
        </div>

        {/* Stats & Filters row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-3">
          {/* Level stats/filter buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant={filterLevel === "" ? "secondary" : "ghost"}
              size="sm"
              className="text-xs h-6 px-2"
              onClick={() => setFilterLevel("")}
            >
              All ({entries.length})
            </Button>
            {stats.error > 0 && (
              <Button
                variant={filterLevel === "error" ? "secondary" : "ghost"}
                size="sm"
                className="text-xs h-6 px-2 text-red-400"
                onClick={() => setFilterLevel(filterLevel === "error" ? "" : "error")}
              >
                Errors ({stats.error})
              </Button>
            )}
            {stats.warn > 0 && (
              <Button
                variant={filterLevel === "warn" ? "secondary" : "ghost"}
                size="sm"
                className="text-xs h-6 px-2 text-amber-400"
                onClick={() => setFilterLevel(filterLevel === "warn" ? "" : "warn")}
              >
                Warnings ({stats.warn})
              </Button>
            )}
          </div>

          {/* Line count selector */}
          <div className="flex items-center gap-1 sm:ml-auto">
            {LINE_COUNTS.map(n => (
              <Button
                key={n}
                variant={lineCount === n ? "secondary" : "ghost"}
                size="sm"
                className="text-xs h-6 px-2"
                onClick={() => setLineCount(n)}
              >
                {n}
              </Button>
            ))}
            <span className="text-[10px] text-muted-foreground/60 ml-1">lines</span>
          </div>
        </div>

        {/* Text search */}
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Filter log messages..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="pl-8 pr-8 h-8 text-xs font-mono"
          />
          {filterText && (
            <button
              onClick={() => setFilterText("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden flex flex-col px-4 relative">
        {/* Loading state */}
        {loading && entries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Loading logs...</span>
            </div>
          </div>
        ) : error && entries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-red-400 font-medium">Failed to load logs</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={fetchLogs}>
                Retry
              </Button>
            </div>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            {filterText || filterLevel ? "No matching log lines" : "No log entries"}
          </div>
        ) : (
          /* Log output — terminal-style */
          <div
            ref={logContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto rounded-lg bg-black/40 border border-border/30 font-mono text-[11px] leading-[1.6] p-3"
          >
            {filteredEntries.map((entry, i) => {
              const style = getLevelStyle(entry.level);
              return (
                <div
                  key={i}
                  className={`flex gap-2 py-px hover:bg-white/[0.03] ${style.text} ${
                    entry.level === "error" ? "bg-red-500/5" : ""
                  }`}
                >
                  {entry.timestamp && (
                    <span className="text-muted-foreground/40 flex-shrink-0 select-none whitespace-nowrap">
                      {entry.timestamp.length > 19 ? entry.timestamp.slice(11, 19) : entry.timestamp.slice(-8)}
                    </span>
                  )}
                  <span
                    className={`flex-shrink-0 w-[3ch] text-right select-none ${
                      entry.level === "error" ? "text-red-400 font-semibold" :
                      entry.level === "warn" ? "text-amber-400" :
                      entry.level === "debug" ? "text-gray-500" :
                      "text-blue-400/50"
                    }`}
                  >
                    {entry.level === "error" ? "ERR" :
                     entry.level === "warn" ? "WRN" :
                     entry.level === "debug" ? "DBG" :
                     "INF"}
                  </span>
                  <span className="break-all min-w-0">
                    <HighlightMatch text={entry.message} query={filterText} />
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Scroll-to-bottom FAB */}
        {!autoScroll && filteredEntries.length > 0 && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-6 right-8 rounded-full bg-primary/90 text-primary-foreground p-2 shadow-lg hover:bg-primary transition-colors"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}

        {/* Footer: entry count and source description */}
        <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/30 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground/60">
            {filteredEntries.length} of {entries.length} lines
            {(filterText || filterLevel) && " (filtered)"}
          </span>
          {currentSource && (
            <span className="text-[10px] text-muted-foreground/60">
              {currentSource.description} — {currentSource.type}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
