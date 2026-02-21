"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import useSWR from "swr";
import {
  Activity,
  CalendarDays,
  CheckSquare,
  Server,
  Plus,
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  Command,
  ArrowRight,
  Clock,
  Zap,
  FileText,
  Hash,
  BarChart3,
  Bot,
  History,
  ScrollText,
  File,
  Loader2,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { searchDocuments, getDocumentContent } from "@/lib/supabase/queries";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  section: string;
  keywords?: string[];
  action: () => void | Promise<void>;
  shortcut?: string;
}

function fuzzyMatch(text: string, query: string): { matches: boolean; score: number } {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();

  // Exact substring match scores highest
  if (lower.includes(q)) {
    const index = lower.indexOf(q);
    // Prefer matches at word boundaries
    const atBoundary = index === 0 || lower[index - 1] === " " || lower[index - 1] === "-";
    return { matches: true, score: atBoundary ? 100 - index : 50 - index };
  }

  // Fuzzy: every character of query must appear in order
  let qi = 0;
  let consecutiveBonus = 0;
  let lastMatchIdx = -2;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) {
      if (i === lastMatchIdx + 1) consecutiveBonus += 5;
      lastMatchIdx = i;
      qi++;
    }
  }

  if (qi === q.length) {
    return { matches: true, score: 10 + consecutiveBonus };
  }

  return { matches: false, score: 0 };
}

function bestMatch(item: PaletteItem, query: string): number {
  const fields = [item.label, item.description ?? "", ...(item.keywords ?? [])];
  let best = 0;
  for (const field of fields) {
    const { matches, score } = fuzzyMatch(field, query);
    if (matches && score > best) best = score;
  }
  return best;
}

function fileIcon(path: string): React.ReactNode {
  if (path.endsWith(".md")) return <FileText className="h-4 w-4" />;
  if (path.endsWith(".json")) return <File className="h-4 w-4" />;
  return <File className="h-4 w-4" />;
}

function folderPath(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

// --- File Viewer Dialog (loads content on-demand) ---

function PaletteFileViewer({
  fileId,
  fileName,
  filePath,
  onClose,
}: {
  fileId: string;
  fileName: string;
  filePath: string;
  onClose: () => void;
}) {
  const { data: file } = useSWR(
    ["palette-file-content", fileId],
    () => getDocumentContent(fileId)
  );

  const lines = useMemo(() => {
    if (!file?.content) return [];
    return file.content.split("\n");
  }, [file]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-[90vw] h-[70vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-sm font-medium truncate">
            {fileName}
          </DialogTitle>
          <div className="text-xs text-muted-foreground truncate">
            {filePath}
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto px-4 pb-4">
          {!file ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : (
            <table className="w-full text-xs font-mono bg-muted/30 rounded-lg">
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="hover:bg-muted/50">
                    <td className="text-right pr-3 pl-3 py-0 text-muted-foreground/40 select-none align-top w-[1%] whitespace-nowrap">
                      {i + 1}
                    </td>
                    <td className="pr-4 py-0 whitespace-pre-wrap break-words align-top">
                      {line || "\u00A0"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="border-t border-border/50 px-4 py-2 text-[10px] text-muted-foreground flex justify-between">
          <span>{file?.size ? `${(file.size / 1024).toFixed(1)} KB` : "\u2014"}</span>
          <span>{lines.length} lines</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Main Component ---

// Priority options for quick task creation
const QUICK_TASK_PRIORITIES = [
  { value: "medium", label: "Medium priority", color: "text-blue-400", dotColor: "bg-blue-400" },
  { value: "high", label: "High priority", color: "text-orange-400", dotColor: "bg-orange-400" },
  { value: "urgent", label: "Urgent", color: "text-red-400", dotColor: "bg-red-400" },
  { value: "low", label: "Low priority", color: "text-gray-400", dotColor: "bg-gray-400" },
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [executing, setExecuting] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<{ id: string; name: string; path: string } | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const close = useCallback(() => setOpen(false), []);

  const navigateToTab = useCallback(
    (tab: string, view?: string) => {
      const params = new URLSearchParams();
      if (tab !== "activity") params.set("tab", tab);
      if (view) params.set("view", view);
      const url = params.toString() ? `/?${params}` : "/";
      router.replace(url, { scroll: false });
      close();
    },
    [router, close]
  );

  const handleSync = useCallback(async () => {
    setExecuting("sync-cron");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (res.ok) {
        toast("Cron jobs synced", "success");
      } else {
        toast("Sync failed", "error");
      }
    } catch {
      toast("Sync failed — network error", "error");
    } finally {
      setExecuting(null);
      setOpen(false);
    }
  }, [toast]);

  const handleRefreshIndex = useCallback(async () => {
    setExecuting("refresh-index");
    try {
      const res = await fetch("/api/index", { method: "POST" });
      if (res.ok) {
        toast("File index refreshed", "success");
      } else {
        toast("Indexing failed", "error");
      }
    } catch {
      toast("Indexing failed — network error", "error");
    } finally {
      setExecuting(null);
      setOpen(false);
    }
  }, [toast]);

  const handleCreateTask = useCallback(
    async (title: string, priority: string) => {
      const execId = `create-task-${priority}`;
      setExecuting(execId);
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), priority, status: "todo" }),
        });
        if (res.ok) {
          toast(`Task created: "${title.trim()}"`, "success");
          setOpen(false);
        } else {
          toast("Failed to create task", "error");
        }
      } catch {
        toast("Failed to create task — network error", "error");
      } finally {
        setExecuting(null);
      }
    },
    [toast]
  );

  // Detect "> task title" quick-create prefix
  const quickTaskTitle = useMemo(() => {
    if (!query.startsWith("> ")) return "";
    return query.slice(2).trim();
  }, [query]);

  // Debounce query for file search (200ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  // File search via Supabase full-text search
  const { data: fileResults, isLoading: fileSearchLoading } = useSWR(
    open && debouncedQuery.length >= 2 ? ["cmd-palette-search", debouncedQuery] : null,
    () => searchDocuments(debouncedQuery, 8)
  );

  const items = useMemo((): PaletteItem[] => {
    return [
      // Tab navigation
      {
        id: "nav-activity",
        label: "Activity",
        description: "Feed, Analytics, Agents",
        icon: <Activity className="h-4 w-4" />,
        section: "Navigation",
        keywords: ["activity", "feed", "logs", "events"],
        action: () => navigateToTab("activity"),
        shortcut: "1",
      },
      {
        id: "nav-schedule",
        label: "Schedule",
        description: "Calendar, Run History",
        icon: <CalendarDays className="h-4 w-4" />,
        section: "Navigation",
        keywords: ["schedule", "calendar", "cron", "week", "day"],
        action: () => navigateToTab("schedule"),
        shortcut: "2",
      },
      {
        id: "nav-tasks",
        label: "Tasks",
        description: "Kanban board",
        icon: <CheckSquare className="h-4 w-4" />,
        section: "Navigation",
        keywords: ["tasks", "kanban", "board", "todo"],
        action: () => navigateToTab("tasks"),
        shortcut: "3",
      },
      {
        id: "nav-system",
        label: "System",
        description: "Health, Logs",
        icon: <Server className="h-4 w-4" />,
        section: "Navigation",
        keywords: ["system", "health", "logs", "server"],
        action: () => navigateToTab("system"),
        shortcut: "4",
      },
      // Sub-view navigation
      {
        id: "nav-analytics",
        label: "Analytics",
        description: "Token usage, cost charts",
        icon: <BarChart3 className="h-4 w-4" />,
        section: "Go to",
        keywords: ["charts", "tokens", "cost", "usage", "analytics", "trends", "stats"],
        action: () => navigateToTab("activity", "analytics"),
      },
      {
        id: "nav-agents",
        label: "Agent Sessions",
        description: "Active agent monitoring",
        icon: <Bot className="h-4 w-4" />,
        section: "Go to",
        keywords: ["agents", "sessions", "bots", "timeline"],
        action: () => navigateToTab("activity", "agents"),
      },
      {
        id: "nav-calendar",
        label: "Calendar",
        description: "Cron job schedule grid",
        icon: <CalendarDays className="h-4 w-4" />,
        section: "Go to",
        keywords: ["calendar", "schedule", "cron", "grid"],
        action: () => navigateToTab("schedule", "calendar"),
      },
      {
        id: "nav-runs",
        label: "Run History",
        description: "Cron execution history",
        icon: <History className="h-4 w-4" />,
        section: "Go to",
        keywords: ["runs", "cron", "history", "jobs", "execution"],
        action: () => navigateToTab("schedule", "runs"),
      },
      {
        id: "nav-health",
        label: "System Health",
        description: "CPU, memory, disk, Docker",
        icon: <Server className="h-4 w-4" />,
        section: "Go to",
        keywords: ["health", "cpu", "memory", "docker", "disk", "monitor"],
        action: () => navigateToTab("system", "health"),
      },
      {
        id: "nav-logs",
        label: "Log Viewer",
        description: "Service logs",
        icon: <ScrollText className="h-4 w-4" />,
        section: "Go to",
        keywords: ["logs", "viewer", "journal", "systemd", "tail"],
        action: () => navigateToTab("system", "logs"),
      },
      {
        id: "nav-services",
        label: "Services Directory",
        description: "Service status and health checks",
        icon: <Server className="h-4 w-4" />,
        section: "Go to",
        keywords: ["services", "directory", "status", "uptime", "monitoring", "health check"],
        action: () => navigateToTab("system", "services"),
      },
      // Actions
      {
        id: "action-new-task",
        label: "New Task",
        description: "Create a task — or type \"> task title\" for quick add",
        icon: <Plus className="h-4 w-4" />,
        section: "Actions",
        keywords: ["create", "new", "task", "todo", "add", "kanban", "quick"],
        action: () => {
          setQuery("> ");
          // Stay open — user continues typing
          requestAnimationFrame(() => inputRef.current?.focus());
        },
      },
      {
        id: "action-create-cron",
        label: "Create Cron Job",
        description: "Schedule a new recurring or one-time task",
        icon: <Plus className="h-4 w-4" />,
        section: "Actions",
        keywords: ["create", "new", "cron", "job", "schedule", "task"],
        action: () => {
          navigateToTab("schedule", "calendar");
          window.dispatchEvent(new CustomEvent("open-create-cron"));
        },
      },
      {
        id: "action-sync-cron",
        label: "Sync Cron Jobs",
        description: "Sync cron jobs from OpenClaw config",
        icon: <RefreshCw className="h-4 w-4" />,
        section: "Actions",
        keywords: ["sync", "cron", "refresh", "openclaw", "update"],
        action: handleSync,
      },
      {
        id: "action-refresh-index",
        label: "Refresh File Index",
        description: "Re-index workspace files for search",
        icon: <FileText className="h-4 w-4" />,
        section: "Actions",
        keywords: ["index", "refresh", "reindex", "files", "workspace"],
        action: handleRefreshIndex,
      },
      // Theme
      {
        id: "theme-light",
        label: "Switch to Light Theme",
        icon: <Sun className="h-4 w-4" />,
        section: "Theme",
        keywords: ["light", "theme", "bright", "white"],
        action: () => { setTheme("light"); close(); },
      },
      {
        id: "theme-dark",
        label: "Switch to Dark Theme",
        icon: <Moon className="h-4 w-4" />,
        section: "Theme",
        keywords: ["dark", "theme", "night", "black"],
        action: () => { setTheme("dark"); close(); },
      },
      {
        id: "theme-system",
        label: "Use System Theme",
        icon: <Monitor className="h-4 w-4" />,
        section: "Theme",
        keywords: ["system", "theme", "auto", "os"],
        action: () => { setTheme("system"); close(); },
      },
      // Quick filters (activity)
      {
        id: "filter-errors",
        label: "Show Error Activities",
        description: "Filter activity feed to errors only",
        icon: <Zap className="h-4 w-4 text-red-400" />,
        section: "Quick Filters",
        keywords: ["errors", "filter", "failed", "important", "red"],
        action: () => {
          navigateToTab("activity", "feed");
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("set-activity-filter", { detail: { category: "important" } }));
          }, 100);
        },
      },
      {
        id: "filter-model",
        label: "Show Model Usage",
        description: "Filter activity feed to model usage",
        icon: <Hash className="h-4 w-4 text-purple-400" />,
        section: "Quick Filters",
        keywords: ["model", "tokens", "cost", "usage", "ai", "llm"],
        action: () => {
          navigateToTab("activity", "feed");
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("set-activity-filter", { detail: { category: "model" } }));
          }, 100);
        },
      },
      {
        id: "filter-today",
        label: "Show Today's Activity",
        description: "Filter to activities from today",
        icon: <Clock className="h-4 w-4 text-blue-400" />,
        section: "Quick Filters",
        keywords: ["today", "recent", "now", "latest"],
        action: () => {
          navigateToTab("activity", "feed");
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("set-activity-filter", { detail: { dateRange: 1 } }));
          }, 100);
        },
      },
    ];
  }, [navigateToTab, handleSync, handleRefreshIndex, setTheme, close]);

  // Quick task creation items (shown when query starts with "> ")
  const quickTaskItems = useMemo((): PaletteItem[] => {
    if (!quickTaskTitle) return [];
    return QUICK_TASK_PRIORITIES.map(({ value, label, color, dotColor }) => ({
      id: `create-task-${value}`,
      label: quickTaskTitle,
      description: label,
      icon: (
        <div className="relative">
          <CheckSquare className={`h-4 w-4 ${color}`} />
          <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${dotColor} border border-background`} />
        </div>
      ),
      section: "Create Task",
      action: () => handleCreateTask(quickTaskTitle, value),
    }));
  }, [quickTaskTitle, handleCreateTask]);

  // Filter commands by query, then append file search results
  const filtered = useMemo(() => {
    // Quick task mode: show task creation options first, then regular items
    if (quickTaskItems.length > 0) {
      return quickTaskItems;
    }

    let commandResults: PaletteItem[];
    if (!query.trim()) {
      commandResults = items;
    } else {
      commandResults = items
        .map((item) => ({ item, score: bestMatch(item, query) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.item);
    }

    // Append file results from Supabase full-text search
    if (fileResults && fileResults.length > 0) {
      const fileItems: PaletteItem[] = fileResults.map((result) => ({
        id: `file-${result.id}`,
        label: result.fileName,
        description: folderPath(result.filePath),
        icon: fileIcon(result.filePath),
        section: "Files",
        action: () => {
          setViewingFile({ id: result.id, name: result.fileName, path: result.filePath });
          close();
        },
      }));
      return [...commandResults, ...fileItems];
    }

    return commandResults;
  }, [items, query, fileResults, close, quickTaskItems]);

  // Group items by section
  const grouped = useMemo(() => {
    const groups: { section: string; items: PaletteItem[] }[] = [];
    const seen = new Set<string>();
    for (const item of filtered) {
      if (!seen.has(item.section)) {
        seen.add(item.section);
        groups.push({ section: item.section, items: [] });
      }
      groups.find((g) => g.section === item.section)!.items.push(item);
    }
    return groups;
  }, [filtered]);

  // Flatten for keyboard navigation
  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
      }
    };
    // Use capture phase so we intercept before GlobalSearch's listener
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setSelectedIndex(0);
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  const executeItem = useCallback(
    (item: PaletteItem) => {
      if (executing) return;
      const result = item.action();
      if (result instanceof Promise) {
        // Action handles its own close
      } else {
        // Sync action — close after execution
      }
    },
    [executing]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatItems[selectedIndex]) {
          executeItem(flatItems[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    },
    [flatItems, selectedIndex, executeItem]
  );

  if (!open && !viewingFile) return null;

  let flatIndex = 0;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Palette */}
          <div
            className="absolute left-1/2 top-[15%] w-full max-w-lg -translate-x-1/2 rounded-xl border border-border/80 bg-background shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-border/50 px-4">
              <Command className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder='Type a command, search files, or "> task" to add...'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground/60"
              />
              {(executing || (debouncedQuery.length >= 2 && fileSearchLoading)) && (
                <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0" />
              )}
              <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
              {flatItems.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No matching commands or files
                </div>
              ) : (
                grouped.map((group) => (
                  <div key={group.section} className="mb-1">
                    <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                      {group.section}
                    </div>
                    {group.items.map((item) => {
                      const idx = flatIndex++;
                      const isSelected = idx === selectedIndex;
                      const isExecuting = executing === item.id;

                      return (
                        <button
                          key={item.id}
                          data-index={idx}
                          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            isSelected
                              ? "bg-primary/10 text-foreground"
                              : "text-foreground/80 hover:bg-muted/50"
                          }`}
                          onClick={() => executeItem(item)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                        >
                          <span
                            className={`shrink-0 ${
                              isSelected ? "text-primary" : "text-muted-foreground"
                            }`}
                          >
                            {isExecuting ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              item.icon
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium">{item.label}</div>
                            {item.description && (
                              <div className="truncate text-xs text-muted-foreground/60">
                                {item.description}
                              </div>
                            )}
                          </div>
                          {item.shortcut && (
                            <kbd className="hidden sm:inline-flex items-center rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono shrink-0">
                              {item.shortcut}
                            </kbd>
                          )}
                          {isSelected && (
                            <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border/50 px-4 py-2 flex items-center justify-between text-[10px] text-muted-foreground/60">
              {quickTaskTitle ? (
                <div className="flex items-center gap-3">
                  <span className="text-blue-400/70 font-medium">Quick task mode</span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 font-mono">↑↓</kbd>
                    priority
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 font-mono">↵</kbd>
                    create
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 font-mono">esc</kbd>
                    cancel
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 font-mono">
                      ↑↓
                    </kbd>
                    navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 font-mono">
                      ↵
                    </kbd>
                    select
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 font-mono">
                      esc
                    </kbd>
                    close
                  </span>
                </div>
              )}
              {!quickTaskTitle && (
                <span>
                  <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 font-mono">
                    ⌘K
                  </kbd>
                  {" "}to toggle
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {viewingFile && (
        <PaletteFileViewer
          fileId={viewingFile.id}
          fileName={viewingFile.name}
          filePath={viewingFile.path}
          onClose={() => setViewingFile(null)}
        />
      )}
    </>
  );
}
