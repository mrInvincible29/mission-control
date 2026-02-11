"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Activity,
  Calendar,
  Search,
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
} from "lucide-react";
import { useToast } from "@/components/Toast";

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

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [executing, setExecuting] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const navigateToTab = useCallback(
    (tab: string) => {
      const url = tab === "activity" ? "/" : `/?tab=${tab}`;
      router.replace(url, { scroll: false });
      setOpen(false);
    },
    [router]
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

  const items = useMemo((): PaletteItem[] => {
    const currentTab = searchParams.get("tab") || "activity";

    return [
      // Navigation
      {
        id: "nav-activity",
        label: "Go to Activity Feed",
        description: "View recent agent activity and logs",
        icon: <Activity className="h-4 w-4" />,
        section: "Navigation",
        keywords: ["activity", "feed", "logs", "events"],
        action: () => navigateToTab("activity"),
        shortcut: "1",
      },
      {
        id: "nav-calendar",
        label: "Go to Calendar",
        description: "View scheduled cron jobs on the calendar",
        icon: <Calendar className="h-4 w-4" />,
        section: "Navigation",
        keywords: ["calendar", "schedule", "cron", "week", "day"],
        action: () => navigateToTab("calendar"),
        shortcut: "2",
      },
      {
        id: "nav-search",
        label: "Go to Files & Search",
        description: "Search indexed workspace files",
        icon: <Search className="h-4 w-4" />,
        section: "Navigation",
        keywords: ["search", "files", "documents", "browse", "memory"],
        action: () => navigateToTab("search"),
        shortcut: "3",
      },
      {
        id: "nav-agents",
        label: "Go to Agent Sessions",
        description: "Browse agent session history and timelines",
        icon: <Zap className="h-4 w-4" />,
        section: "Navigation",
        keywords: ["agents", "sessions", "agent", "timeline", "history"],
        action: () => navigateToTab("agents"),
        shortcut: "4",
      },
      {
        id: "nav-analytics",
        label: "Go to Analytics",
        description: "View token usage, costs, and trends",
        icon: <Activity className="h-4 w-4" />,
        section: "Navigation",
        keywords: ["analytics", "usage", "tokens", "cost", "charts", "trends", "stats"],
        action: () => navigateToTab("analytics"),
        shortcut: "5",
      },
      // Actions
      {
        id: "action-create-cron",
        label: "Create Cron Job",
        description: "Schedule a new recurring or one-time task",
        icon: <Plus className="h-4 w-4" />,
        section: "Actions",
        keywords: ["create", "new", "cron", "job", "schedule", "task"],
        action: () => {
          // Navigate to calendar and trigger the create dialog
          navigateToTab("calendar");
          // Dispatch a custom event that CalendarView listens for
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
        action: () => {
          setTheme("light");
          setOpen(false);
        },
      },
      {
        id: "theme-dark",
        label: "Switch to Dark Theme",
        icon: <Moon className="h-4 w-4" />,
        section: "Theme",
        keywords: ["dark", "theme", "night", "black"],
        action: () => {
          setTheme("dark");
          setOpen(false);
        },
      },
      {
        id: "theme-system",
        label: "Use System Theme",
        icon: <Monitor className="h-4 w-4" />,
        section: "Theme",
        keywords: ["system", "theme", "auto", "os"],
        action: () => {
          setTheme("system");
          setOpen(false);
        },
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
          navigateToTab("activity");
          // Dispatch custom event for ActivityFeed to handle
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
          navigateToTab("activity");
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
          navigateToTab("activity");
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("set-activity-filter", { detail: { dateRange: 1 } }));
          }, 100);
        },
      },
    ];
  }, [searchParams, navigateToTab, handleSync, handleRefreshIndex, setTheme, theme]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    return items
      .map((item) => ({ item, score: bestMatch(item, query) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);
  }, [items, query]);

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

  if (!open) return null;

  let flatIndex = 0;

  return (
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
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground/60"
          />
          {executing && (
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0" />
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {flatItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No matching commands
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
          <span>
            <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 font-mono">
              ⌘K
            </kbd>
            {" "}to toggle
          </span>
        </div>
      </div>
    </div>
  );
}
