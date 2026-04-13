"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode, useState, useEffect, useCallback, useRef, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SetupGuide } from "@/components/SetupGuide";
import { ToastProvider } from "@/components/Toast";
import { SubViewToggle } from "@/components/SubViewToggle";
import { CommandPalette } from "@/components/CommandPalette";
import { SystemHealth } from "@/components/SystemHealth";
import { ServicesView } from "@/components/ServicesView";
import { useTabNotifications } from "@/hooks/useTabNotifications";
import { Activity, CalendarDays, CheckSquare, Server, Search, ChevronLeft, ChevronRight, History } from "lucide-react";
import {
  ActivitySkeleton,
  CalendarSkeleton,
  AgentsSkeleton,
  AnalyticsSkeleton,
  CronRunsSkeleton,
  LogsSkeleton,
  KanbanSkeleton,
} from "@/components/Skeletons";

const ThemeToggle = dynamic(
  () => import("@/components/ThemeToggle").then((mod) => ({ default: mod.ThemeToggle })),
  { ssr: false }
);

const KeyboardShortcuts = dynamic(
  () => import("@/components/KeyboardShortcuts").then((mod) => ({ default: mod.KeyboardShortcuts })),
  { ssr: false }
);

const StatusStrip = dynamic(
  () => import("@/components/StatusStrip").then((mod) => ({ default: mod.StatusStrip })),
  { ssr: false }
);

const DynamicFavicon = dynamic(
  () => import("@/components/DynamicFavicon").then((mod) => ({ default: mod.DynamicFavicon })),
  { ssr: false }
);

const TabReturnNotifier = dynamic(
  () => import("@/components/TabReturnNotifier").then((mod) => ({ default: mod.TabReturnNotifier })),
  { ssr: false }
);

const NotificationCenter = dynamic(
  () => import("@/components/NotificationCenter").then((mod) => ({ default: mod.NotificationCenter })),
  { ssr: false }
);

const QuickStats = dynamic(
  () => import("@/components/QuickStats").then((mod) => ({ default: mod.QuickStats })),
  { ssr: false }
);

const VALID_TABS = ["activity", "schedule", "tasks", "system"] as const;
type TabValue = (typeof VALID_TABS)[number];

const VALID_VIEWS: Record<TabValue, string[]> = {
  activity: ["feed", "analytics", "agents"],
  schedule: ["calendar", "runs"],
  tasks: ["board"],
  system: ["health", "logs", "services"],
};

const TAB_VIEW_STORAGE_KEY = "mc-last-subviews";
const RECENT_VIEWS_STORAGE_KEY = "mc-recent-views";
const MAX_RECENT_VIEWS = 4;

type RecentView = {
  tab: TabValue;
  view: string;
  timestamp: number;
};

type NavEntry = {
  tab: TabValue;
  view: string;
};

function readStoredTabViews(): Partial<Record<TabValue, string>> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(TAB_VIEW_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, string>;
    const normalized: Partial<Record<TabValue, string>> = {};

    for (const tab of VALID_TABS) {
      const view = parsed[tab];
      if (view && VALID_VIEWS[tab].includes(view)) {
        normalized[tab] = view;
      }
    }

    return normalized;
  } catch {
    return {};
  }
}

function getStoredTabView(tab: TabValue): string | null {
  return readStoredTabViews()[tab] ?? null;
}

function storeTabView(tab: TabValue, view: string) {
  if (typeof window === "undefined") return;

  try {
    const current = readStoredTabViews();
    window.localStorage.setItem(
      TAB_VIEW_STORAGE_KEY,
      JSON.stringify({
        ...current,
        [tab]: view,
      })
    );
  } catch {
    // Best-effort only.
  }
}

function readRecentViews(): RecentView[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(RECENT_VIEWS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as RecentView[];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item) =>
        item &&
        VALID_TABS.includes(item.tab) &&
        typeof item.view === "string" &&
        VALID_VIEWS[item.tab].includes(item.view) &&
        typeof item.timestamp === "number"
    );
  } catch {
    return [];
  }
}

function storeRecentViews(items: RecentView[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(RECENT_VIEWS_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECENT_VIEWS)));
  } catch {
    // Best-effort only.
  }
}

/** Track last visit timestamp in localStorage for "new since" markers */
function useLastVisit() {
  const STORAGE_KEY = "mc-last-visit";
  const [lastVisit, setLastVisit] = useState<number | null>(null);
  const [newCount, setNewCount] = useState(0);

  // Read last visit on mount, then update it
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const ts = stored ? parseInt(stored, 10) : null;
    setLastVisit(ts && !isNaN(ts) ? ts : null);
    // Update last visit to now (will apply on next page load)
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  }, []);

  return { lastVisit, newCount, setNewCount };
}

/** Fade-in wrapper — triggers a quick opacity+translateY transition on mount */
function FadeIn({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      className={`transition-all duration-200 ease-out ${
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
      } ${className}`}
    >
      {children}
    </div>
  );
}

class TabErrorBoundary extends Component<
  { children: ReactNode; fallbackLabel: string },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined as Error | undefined };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <p className="text-red-400 font-medium">
            {this.props.fallbackLabel} failed to load
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {this.state.error?.message}
          </p>
          <button
            className="mt-3 text-sm text-primary underline"
            onClick={() => this.setState({ hasError: false, error: undefined })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Dynamically import heavy components — each with a tab-specific skeleton loader
const ActivityFeed = dynamic(
  () => import("@/components/ActivityFeed").then((mod) => ({ default: mod.ActivityFeed })),
  { ssr: false, loading: () => <ActivitySkeleton /> }
);

const CalendarView = dynamic(
  () => import("@/components/CalendarView").then((mod) => ({ default: mod.CalendarView })),
  { ssr: false, loading: () => <CalendarSkeleton /> }
);

const AgentSessions = dynamic(
  () => import("@/components/AgentSessions").then((mod) => ({ default: mod.AgentSessions })),
  { ssr: false, loading: () => <AgentsSkeleton /> }
);

const AnalyticsView = dynamic(
  () => import("@/components/AnalyticsView").then((mod) => ({ default: mod.AnalyticsView })),
  { ssr: false, loading: () => <AnalyticsSkeleton /> }
);

const CronHistory = dynamic(
  () => import("@/components/CronHistory").then((mod) => ({ default: mod.CronHistory })),
  { ssr: false, loading: () => <CronRunsSkeleton /> }
);

const LogViewer = dynamic(
  () => import("@/components/LogViewer").then((mod) => ({ default: mod.LogViewer })),
  { ssr: false, loading: () => <LogsSkeleton /> }
);

const KanbanBoard = dynamic(
  () => import("@/components/KanbanBoard").then((mod) => ({ default: mod.KanbanBoard })),
  { ssr: false, loading: () => <KanbanSkeleton /> }
);

/** Navigation HUD — brief floating pill when switching via keyboard */
const VIEW_LABELS: Record<string, string> = {
  feed: "Feed", analytics: "Analytics", agents: "Agents",
  calendar: "Calendar", runs: "Run History",
  board: "Kanban",
  health: "Health", logs: "Logs", services: "Services",
};

const TAB_LABELS: Record<string, string> = {
  activity: "Activity", schedule: "Schedule", tasks: "Tasks", system: "System",
};

function NavigationHUD() {
  const [hud, setHud] = useState<{ tab: string; view: string } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tab) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setHud({ tab: detail.tab, view: detail.view || "" });
      timeoutRef.current = setTimeout(() => setHud(null), 1200);
    };
    window.addEventListener("nav-hud", handler);
    return () => {
      window.removeEventListener("nav-hud", handler);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!hud) return null;

  const tabLabel = TAB_LABELS[hud.tab] || hud.tab;
  const viewLabel = hud.view ? VIEW_LABELS[hud.view] || hud.view : "";

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-150"
      data-testid="nav-hud"
    >
      <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/95 backdrop-blur-md shadow-lg px-4 py-2 text-sm font-medium">
        <span className="text-primary">{tabLabel}</span>
        {viewLabel && (
          <>
            <span className="text-muted-foreground/40">&rsaquo;</span>
            <span className="text-foreground/80">{viewLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Notification dot for tabs — shows colored dot or count badge */
function TabDot({ color }: { color: "red" | "amber" | "emerald" }) {
  const colors = {
    red: "bg-red-500",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
  };
  return (
    <span className={`ml-1 inline-block w-1.5 h-1.5 rounded-full ${colors[color]}`} />
  );
}

function TabCount({ count, color }: { count: number; color: "red" | "amber" }) {
  if (count === 0) return null;
  const colors = {
    red: "bg-red-500/80 text-white",
    amber: "bg-amber-500/80 text-white",
  };
  return (
    <span className={`ml-1 inline-flex items-center justify-center min-w-[14px] h-[14px] rounded-full text-[9px] font-bold ${colors[color]} leading-none px-0.5`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function DashboardContent() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const searchParams = useSearchParams();
  const router = useRouter();
  const notifications = useTabNotifications();
  const { lastVisit, newCount, setNewCount } = useLastVisit();
  const [scrolled, setScrolled] = useState(false);

  // Detect scroll for sticky header effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 12);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Read initial tab from URL, default to "activity"
  const tabParam = searchParams.get("tab");
  const initialTab: TabValue = VALID_TABS.includes(tabParam as TabValue)
    ? (tabParam as TabValue)
    : "activity";
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);

  // Read initial view from URL
  const viewParam = searchParams.get("view");
  const initialView =
    viewParam && VALID_VIEWS[initialTab]?.includes(viewParam)
      ? viewParam
      : getStoredTabView(initialTab) ?? VALID_VIEWS[initialTab][0];

  const [activeView, setActiveView] = useState<string>(initialView);
  const [recentViews, setRecentViews] = useState<RecentView[]>([]);
  const navHistoryRef = useRef<NavEntry[]>([{ tab: initialTab, view: initialView }]);
  const navIndexRef = useRef(0);
  const [navState, setNavState] = useState({ canBack: false, canForward: false });

  const recordRecentView = useCallback((tab: TabValue, view: string) => {
    setRecentViews((prev) => {
      const next = [
        { tab, view, timestamp: Date.now() },
        ...prev.filter((item) => !(item.tab === tab && item.view === view)),
      ].slice(0, MAX_RECENT_VIEWS);
      storeRecentViews(next);
      return next;
    });
  }, []);

  useEffect(() => {
    setRecentViews(readRecentViews());
  }, []);

  useEffect(() => {
    recordRecentView(activeTab, activeView);
  }, [activeTab, activeView, recordRecentView]);

  useEffect(() => {
    storeTabView(activeTab, activeView);
  }, [activeTab, activeView]);

  const syncNavState = useCallback(() => {
    setNavState({
      canBack: navIndexRef.current > 0,
      canForward: navIndexRef.current < navHistoryRef.current.length - 1,
    });
  }, []);

  const updateUrl = useCallback((tab: TabValue, view: string) => {
    const params = new URLSearchParams();
    if (tab !== "activity") params.set("tab", tab);
    if (view !== VALID_VIEWS[tab][0]) params.set("view", view);
    const url = params.toString() ? `/?${params}` : "/";
    router.replace(url, { scroll: false });
  }, [router]);

  const pushNavHistory = useCallback((entry: NavEntry) => {
    const current = navHistoryRef.current[navIndexRef.current];
    if (current?.tab === entry.tab && current.view === entry.view) {
      syncNavState();
      return;
    }

    const nextHistory = navHistoryRef.current.slice(0, navIndexRef.current + 1);
    nextHistory.push(entry);

    if (nextHistory.length > 20) {
      nextHistory.shift();
    }

    navHistoryRef.current = nextHistory;
    navIndexRef.current = nextHistory.length - 1;
    syncNavState();
  }, [syncNavState]);

  const applyNavigation = useCallback((tab: TabValue, view: string, options?: { recordHistory?: boolean; showHud?: boolean; context?: Record<string, string> }) => {
    setActiveTab(tab);
    setActiveView(view);
    updateUrl(tab, view);

    if (options?.recordHistory !== false) {
      pushNavHistory({ tab, view });
    }

    if (options?.showHud) {
      window.dispatchEvent(new CustomEvent("nav-hud", { detail: { tab, view } }));
    }

    if (options?.context) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("focus-item", { detail: options.context }));
      }, 300);
    }
  }, [pushNavHistory, updateUrl]);

  const goToHistoryEntry = useCallback((direction: "back" | "forward") => {
    const delta = direction === "back" ? -1 : 1;
    const nextIndex = navIndexRef.current + delta;
    const target = navHistoryRef.current[nextIndex];
    if (!target) return;

    navIndexRef.current = nextIndex;
    syncNavState();
    applyNavigation(target.tab, target.view, { recordHistory: false, showHud: true });
  }, [applyNavigation, syncNavState]);

  // Sync view changes to URL
  const handleViewChange = useCallback((view: string) => {
    applyNavigation(activeTab, view);
  }, [activeTab, applyNavigation]);

  // Sync tab changes to URL and restore the last sub-view used for that tab
  const handleTabChange = useCallback((value: string) => {
    const tab = value as TabValue;
    const nextView = getStoredTabView(tab) ?? VALID_VIEWS[tab][0];
    applyNavigation(tab, nextView);
  }, [applyNavigation]);

  // Cross-view navigation: any component can dispatch "navigate-to" to switch tabs/views
  const navigateTo = useCallback((tab: TabValue, view?: string, context?: Record<string, string>) => {
    const targetView = view && VALID_VIEWS[tab]?.includes(view) ? view : VALID_VIEWS[tab][0];
    applyNavigation(tab, targetView, { showHud: true, context });
  }, [applyNavigation]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { tab, view, context } = (e as CustomEvent).detail || {};
      if (tab && VALID_TABS.includes(tab)) {
        navigateTo(tab as TabValue, view, context);
      }
    };
    window.addEventListener("navigate-to", handler);
    return () => window.removeEventListener("navigate-to", handler);
  }, [navigateTo]);

  const recentViewLinks = useMemo(
    () => recentViews.filter((item) => !(item.tab === activeTab && item.view === activeView)),
    [recentViews, activeTab, activeView]
  );

  const currentViewLabel = VIEW_LABELS[activeView] ?? activeView;

  // Keyboard shortcuts: 1-4 for tabs, Shift+1/2/3 for sub-views, r for refresh
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if (e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          goToHistoryEntry("back");
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          goToHistoryEntry("forward");
          return;
        }
      }

      // Tab switching: 1-4
      if (!e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tabMap: Record<string, TabValue> = { "1": "activity", "2": "schedule", "3": "tasks", "4": "system" };
        const tab = tabMap[e.key];
        if (tab) {
          handleTabChange(tab);
          window.dispatchEvent(new CustomEvent("nav-hud", { detail: { tab, view: VALID_VIEWS[tab][0] } }));
        } else if (e.key === "r" || e.key === "R") {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("refresh-view"));
        }
      }
      // Sub-view switching: Shift+1/2/3
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const views = VALID_VIEWS[activeTab];
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < views.length) {
          handleViewChange(views[idx]);
          window.dispatchEvent(new CustomEvent("nav-hud", { detail: { tab: activeTab, view: views[idx] } }));
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, goToHistoryEntry, handleTabChange, handleViewChange]);

  // Dynamic page title with notification count
  useEffect(() => {
    const total = notifications.blockedTasks + notifications.cronRuns + notifications.logs + newCount;
    const suffix = total > 0 ? ` (${total})` : "";
    document.title = `Mission Control${suffix}`;
  }, [notifications, newCount]);

  if (!supabaseUrl) {
    return <SetupGuide />;
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
      {/* Sticky tab bar with scroll-aware styling */}
      <div
        className={`sticky top-0 z-30 -mx-4 px-4 pt-2 pb-2 transition-all duration-300 ${
          scrolled
            ? "bg-background/80 backdrop-blur-lg border-b border-border/40 shadow-sm"
            : "bg-transparent"
        }`}
        data-testid="sticky-header"
      >
      <TabsList className="flex w-full overflow-x-auto sm:grid sm:grid-cols-4 max-w-md">
        <TabsTrigger value="activity" className="shrink-0 gap-1.5">
          <Activity className="h-4 w-4 sm:hidden" />
          <span className="hidden sm:inline mr-1 text-xs text-muted-foreground/50 font-mono">1</span>
          Activity
          {newCount > 0 && activeTab !== "activity" && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[14px] h-[14px] rounded-full text-[9px] font-bold bg-primary/80 text-primary-foreground leading-none px-0.5 animate-in fade-in">
              {newCount > 99 ? "99+" : newCount}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="schedule" className="shrink-0 gap-1.5">
          <CalendarDays className="h-4 w-4 sm:hidden" />
          <span className="hidden sm:inline mr-1 text-xs text-muted-foreground/50 font-mono">2</span>
          Schedule
          {notifications.cronRuns > 0 && <TabCount count={notifications.cronRuns} color="red" />}
        </TabsTrigger>
        <TabsTrigger value="tasks" className="shrink-0 gap-1.5 relative">
          <CheckSquare className="h-4 w-4 sm:hidden" />
          <span className="hidden sm:inline mr-1 text-xs text-muted-foreground/50 font-mono">3</span>
          Tasks
          {notifications.blockedTasks > 0 && <TabCount count={notifications.blockedTasks} color="red" />}
        </TabsTrigger>
        <TabsTrigger value="system" className="shrink-0 gap-1.5 relative">
          <Server className="h-4 w-4 sm:hidden" />
          <span className="hidden sm:inline mr-1 text-xs text-muted-foreground/50 font-mono">4</span>
          System
          {notifications.health === "critical" && <TabDot color="red" />}
          {notifications.health === "warn" && <TabDot color="amber" />}
          {notifications.logs > 0 && <TabCount count={notifications.logs} color="amber" />}
        </TabsTrigger>
      </TabsList>
      <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="recent-views">
        <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-1 py-1">
          <button
            type="button"
            onClick={() => goToHistoryEntry("back")}
            disabled={!navState.canBack}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
            title="Back to previous view (Alt+Left)"
            aria-label="Go back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => goToHistoryEntry("forward")}
            disabled={!navState.canForward}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
            title="Forward to next view (Alt+Right)"
            aria-label="Go forward"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="mx-1 h-4 w-px bg-border/60" />
          <span className="inline-flex items-center gap-1.5 px-2 text-[11px] text-muted-foreground">
            <History className="h-3 w-3" />
            <span className="font-medium text-foreground/80">{TAB_LABELS[activeTab]}</span>
            <span className="text-muted-foreground/40">/</span>
            <span>{currentViewLabel}</span>
          </span>
        </div>
        {recentViewLinks.length > 0 && (
          <>
            <span className="text-[11px] text-muted-foreground">Recent</span>
            {recentViewLinks.map((item) => (
              <button
                key={`${item.tab}:${item.view}`}
                onClick={() => navigateTo(item.tab, item.view)}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                title={`Jump to ${TAB_LABELS[item.tab]} ${VIEW_LABELS[item.view] ?? item.view}`}
              >
                <span className="font-medium text-foreground/80">{TAB_LABELS[item.tab]}</span>
                <span className="text-muted-foreground/40">/</span>
                <span>{VIEW_LABELS[item.view] ?? item.view}</span>
              </button>
            ))}
          </>
        )}
      </div>
      </div>

      <TabsContent value="activity" className="mt-6 space-y-4">
        <SubViewToggle
          views={[
            { id: "feed", label: "Feed" },
            { id: "analytics", label: "Analytics" },
            { id: "agents", label: "Agents" },
          ]}
          active={activeView}
          onChange={handleViewChange}
        />
        <TabErrorBoundary fallbackLabel="Activity">
          <FadeIn key={`activity-${activeView}`}>
            {activeView === "feed" && <ActivityFeed lastVisit={lastVisit} onNewCount={setNewCount} />}
            {activeView === "analytics" && <AnalyticsView />}
            {activeView === "agents" && <AgentSessions />}
          </FadeIn>
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="schedule" className="mt-6 space-y-4">
        <SubViewToggle
          views={[
            { id: "calendar", label: "Calendar" },
            { id: "runs", label: "Run History" },
          ]}
          active={activeView}
          onChange={handleViewChange}
        />
        <TabErrorBoundary fallbackLabel="Schedule">
          <FadeIn key={`schedule-${activeView}`}>
            {activeView === "calendar" && <CalendarView />}
            {activeView === "runs" && <CronHistory />}
          </FadeIn>
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="tasks" className="mt-6">
        <TabErrorBoundary fallbackLabel="Tasks">
          <FadeIn key="tasks-board">
            <KanbanBoard />
          </FadeIn>
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="system" className="mt-6 space-y-4">
        <SubViewToggle
          views={[
            { id: "health", label: "Health" },
            { id: "logs", label: "Logs" },
            { id: "services", label: "Services" },
          ]}
          active={activeView}
          onChange={handleViewChange}
        />
        <TabErrorBoundary fallbackLabel="System">
          <FadeIn key={`system-${activeView}`}>
            {activeView === "health" && <SystemHealth />}
            {activeView === "logs" && <LogViewer />}
            {activeView === "services" && <ServicesView />}
          </FadeIn>
        </TabErrorBoundary>
      </TabsContent>
    </Tabs>
  );
}

export default function Home() {
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <CommandPalette />
        <KeyboardShortcuts />
      </Suspense>
      <DynamicFavicon />
      <TabReturnNotifier />
      <NavigationHUD />
      <main className="min-h-screen bg-gradient-to-b from-background to-background/95">
        <div className="container mx-auto px-4 py-6">
          <header className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  Mission Control
                </h1>
                <div className="mt-1.5 hidden sm:flex sm:items-center sm:gap-3">
                  <StatusStrip />
                  <span className="text-border">|</span>
                  <QuickStats />
                </div>
                <div className="mt-1 sm:hidden space-y-1">
                  <StatusStrip compact />
                  <QuickStats />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
                  className="flex items-center justify-center rounded-lg border border-border/60 bg-muted/30 p-1.5 sm:px-3 sm:py-1.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                >
                  <Search className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:flex items-center gap-2">
                    Search commands...
                    <kbd className="rounded border border-border/40 bg-background/50 px-1 py-0.5 text-[10px] font-mono">
                      ⌘K
                    </kbd>
                  </span>
                </button>
                <NotificationCenter />
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent("toggle-shortcuts"))}
                  className="hidden sm:flex items-center justify-center rounded-lg border border-border/60 bg-muted/30 w-8 h-8 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                  title="Keyboard shortcuts (?)"
                  aria-label="Keyboard shortcuts"
                >
                  <span className="font-mono text-[13px] font-medium">?</span>
                </button>
                <ThemeToggle />
              </div>
            </div>
          </header>

          <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
            <DashboardContent />
          </Suspense>
        </div>
      </main>
    </ToastProvider>
  );
}
