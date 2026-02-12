"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode, useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SetupGuide } from "@/components/SetupGuide";
import { ToastProvider } from "@/components/Toast";

const ThemeToggle = dynamic(
  () => import("@/components/ThemeToggle").then((mod) => ({ default: mod.ThemeToggle })),
  { ssr: false }
);

const CommandPalette = dynamic(
  () => import("@/components/CommandPalette").then((mod) => ({ default: mod.CommandPalette })),
  { ssr: false }
);

const VALID_TABS = ["activity", "calendar", "search", "agents", "analytics", "health"] as const;
type TabValue = (typeof VALID_TABS)[number];

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

// Dynamically import components that use Convex hooks
const ActivityFeed = dynamic(
  () => import("@/components/ActivityFeed").then((mod) => ({ default: mod.ActivityFeed })),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground">Loading...</div> }
);

const CalendarView = dynamic(
  () => import("@/components/CalendarView").then((mod) => ({ default: mod.CalendarView })),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground">Loading...</div> }
);

const GlobalSearch = dynamic(
  () => import("@/components/GlobalSearch").then((mod) => ({ default: mod.GlobalSearch })),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground">Loading...</div> }
);

const AgentSessions = dynamic(
  () => import("@/components/AgentSessions").then((mod) => ({ default: mod.AgentSessions })),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground">Loading...</div> }
);

const AnalyticsView = dynamic(
  () => import("@/components/AnalyticsView").then((mod) => ({ default: mod.AnalyticsView })),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground">Loading...</div> }
);

const SystemHealth = dynamic(
  () => import("@/components/SystemHealth").then((mod) => ({ default: mod.SystemHealth })),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground">Loading...</div> }
);

function DashboardContent() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const searchParams = useSearchParams();
  const router = useRouter();

  // Read initial tab from URL, default to "activity"
  const tabParam = searchParams.get("tab");
  const initialTab: TabValue = VALID_TABS.includes(tabParam as TabValue)
    ? (tabParam as TabValue)
    : "activity";
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);

  // Keyboard shortcuts: 1/2/3/4 to switch tabs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if (e.key === "1") setActiveTab("activity");
      else if (e.key === "2") setActiveTab("calendar");
      else if (e.key === "3") setActiveTab("search");
      else if (e.key === "4") setActiveTab("agents");
      else if (e.key === "5") setActiveTab("analytics");
      else if (e.key === "6") setActiveTab("health");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sync tab changes to URL
  const handleTabChange = useCallback((value: string) => {
    const tab = value as TabValue;
    setActiveTab(tab);
    const url = tab === "activity" ? "/" : `/?tab=${tab}`;
    router.replace(url, { scroll: false });
  }, [router]);

  if (!convexUrl) {
    return <SetupGuide />;
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
      <TabsList className="grid w-full grid-cols-6 max-w-[500px] sm:max-w-3xl">
        <TabsTrigger value="activity">
          <span className="hidden sm:inline mr-1 text-xs text-muted-foreground/50 font-mono">1</span>
          Activity
        </TabsTrigger>
        <TabsTrigger value="calendar">
          <span className="hidden sm:inline mr-1 text-xs text-muted-foreground/50 font-mono">2</span>
          Calendar
        </TabsTrigger>
        <TabsTrigger value="search">
          <span className="hidden sm:inline mr-1 text-xs text-muted-foreground/50 font-mono">3</span>
          Search
        </TabsTrigger>
        <TabsTrigger value="agents">
          <span className="hidden sm:inline mr-1 text-xs text-muted-foreground/50 font-mono">4</span>
          Agents
        </TabsTrigger>
        <TabsTrigger value="analytics">
          <span className="hidden sm:inline mr-1 text-xs text-muted-foreground/50 font-mono">5</span>
          Analytics
        </TabsTrigger>
        <TabsTrigger value="health">
          <span className="hidden sm:inline mr-1 text-xs text-muted-foreground/50 font-mono">6</span>
          Health
        </TabsTrigger>
      </TabsList>

      <TabsContent value="activity" className="mt-6">
        <TabErrorBoundary fallbackLabel="Activity Feed">
          <ActivityFeed />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="calendar" className="mt-6">
        <TabErrorBoundary fallbackLabel="Calendar">
          <CalendarView />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="search" className="mt-6">
        <TabErrorBoundary fallbackLabel="Search">
          <GlobalSearch />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="agents" className="mt-6">
        <TabErrorBoundary fallbackLabel="Agents">
          <AgentSessions />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="analytics" className="mt-6">
        <TabErrorBoundary fallbackLabel="Analytics">
          <AnalyticsView />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="health" className="mt-6">
        <TabErrorBoundary fallbackLabel="System Health">
          <SystemHealth />
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
                <p className="text-muted-foreground mt-1 text-sm sm:text-base">
                  AJ&apos;s personal command center
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
                  className="hidden sm:flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                >
                  <span>Search commands...</span>
                  <kbd className="rounded border border-border/40 bg-background/50 px-1 py-0.5 text-[10px] font-mono">
                    ⌘K
                  </kbd>
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
