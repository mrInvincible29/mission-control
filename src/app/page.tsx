"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode, useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SetupGuide } from "@/components/SetupGuide";
import { ToastProvider } from "@/components/Toast";
import { SubViewToggle } from "@/components/SubViewToggle";
import { useTabNotifications } from "@/hooks/useTabNotifications";
import { Activity, CalendarDays, CheckSquare, Server, Search } from "lucide-react";
import {
  ActivitySkeleton,
  CalendarSkeleton,
  AgentsSkeleton,
  AnalyticsSkeleton,
  HealthSkeleton,
  CronRunsSkeleton,
  LogsSkeleton,
  KanbanSkeleton,
} from "@/components/Skeletons";

const ThemeToggle = dynamic(
  () => import("@/components/ThemeToggle").then((mod) => ({ default: mod.ThemeToggle })),
  { ssr: false }
);

const CommandPalette = dynamic(
  () => import("@/components/CommandPalette").then((mod) => ({ default: mod.CommandPalette })),
  { ssr: false }
);

const StatusStrip = dynamic(
  () => import("@/components/StatusStrip").then((mod) => ({ default: mod.StatusStrip })),
  { ssr: false }
);

const VALID_TABS = ["activity", "schedule", "tasks", "system"] as const;
type TabValue = (typeof VALID_TABS)[number];

const VALID_VIEWS: Record<TabValue, string[]> = {
  activity: ["feed", "analytics", "agents"],
  schedule: ["calendar", "runs"],
  tasks: ["board"],
  system: ["health", "logs"],
};

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

const SystemHealth = dynamic(
  () => import("@/components/SystemHealth").then((mod) => ({ default: mod.SystemHealth })),
  { ssr: false, loading: () => <HealthSkeleton /> }
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

  // Read initial tab from URL, default to "activity"
  const tabParam = searchParams.get("tab");
  const initialTab: TabValue = VALID_TABS.includes(tabParam as TabValue)
    ? (tabParam as TabValue)
    : "activity";
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);

  // Read initial view from URL
  const viewParam = searchParams.get("view");
  const [activeView, setActiveView] = useState<string>(
    viewParam && VALID_VIEWS[initialTab]?.includes(viewParam)
      ? viewParam
      : VALID_VIEWS[initialTab][0]
  );

  // Sync view changes to URL
  const handleViewChange = useCallback((view: string) => {
    setActiveView(view);
    const params = new URLSearchParams();
    if (activeTab !== "activity") params.set("tab", activeTab);
    const defaultView = VALID_VIEWS[activeTab][0];
    if (view !== defaultView) params.set("view", view);
    const url = params.toString() ? `/?${params}` : "/";
    router.replace(url, { scroll: false });
  }, [activeTab, router]);

  // Sync tab changes to URL, reset view to default
  const handleTabChange = useCallback((value: string) => {
    const tab = value as TabValue;
    setActiveTab(tab);
    const defaultView = VALID_VIEWS[tab][0];
    setActiveView(defaultView);
    const url = tab === "activity" ? "/" : `/?tab=${tab}`;
    router.replace(url, { scroll: false });
  }, [router]);

  // Keyboard shortcuts: 1-4 for tabs, Shift+1/2/3 for sub-views
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      // Tab switching: 1-4
      if (!e.shiftKey) {
        if (e.key === "1") handleTabChange("activity");
        else if (e.key === "2") handleTabChange("schedule");
        else if (e.key === "3") handleTabChange("tasks");
        else if (e.key === "4") handleTabChange("system");
      }
      // Sub-view switching: Shift+1/2/3
      if (e.shiftKey) {
        const views = VALID_VIEWS[activeTab];
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < views.length) {
          handleViewChange(views[idx]);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, handleTabChange, handleViewChange]);

  if (!supabaseUrl) {
    return <SetupGuide />;
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
      <TabsList className="flex w-full overflow-x-auto sm:grid sm:grid-cols-4 max-w-md">
        <TabsTrigger value="activity" className="shrink-0 gap-1.5">
          <Activity className="h-4 w-4 sm:hidden" />
          <span className="hidden sm:inline mr-1 text-xs text-muted-foreground/50 font-mono">1</span>
          Activity
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
          {activeView === "feed" && <ActivityFeed />}
          {activeView === "analytics" && <AnalyticsView />}
          {activeView === "agents" && <AgentSessions />}
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
          {activeView === "calendar" && <CalendarView />}
          {activeView === "runs" && <CronHistory />}
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="tasks" className="mt-6">
        <TabErrorBoundary fallbackLabel="Tasks">
          <KanbanBoard />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="system" className="mt-6 space-y-4">
        <SubViewToggle
          views={[
            { id: "health", label: "Health" },
            { id: "logs", label: "Logs" },
          ]}
          active={activeView}
          onChange={handleViewChange}
        />
        <TabErrorBoundary fallbackLabel="System">
          {activeView === "health" && <SystemHealth />}
          {activeView === "logs" && <LogViewer />}
        </TabErrorBoundary>
      </TabsContent>
    </Tabs>
  );
}

export default function Home() {
  return (
    <ToastProvider>
      <CommandPalette />
      <main className="min-h-screen bg-gradient-to-b from-background to-background/95">
        <div className="container mx-auto px-4 py-6">
          <header className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  Mission Control
                </h1>
                <div className="mt-1.5 hidden sm:block">
                  <StatusStrip />
                </div>
                <div className="mt-1 sm:hidden">
                  <StatusStrip compact />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true }))}
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
