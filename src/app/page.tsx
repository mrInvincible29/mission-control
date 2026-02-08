"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SetupGuide } from "@/components/SetupGuide";

const ThemeToggle = dynamic(
  () => import("@/components/ThemeToggle").then((mod) => ({ default: mod.ThemeToggle })),
  { ssr: false }
);

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

function DashboardContent() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  
  if (!convexUrl) {
    return <SetupGuide />;
  }

  return (
    <Tabs defaultValue="activity" className="space-y-6">
      <TabsList className="grid w-full grid-cols-3 max-w-[280px] sm:max-w-md">
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="calendar">Calendar</TabsTrigger>
        <TabsTrigger value="search">Search</TabsTrigger>
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
    </Tabs>
  );
}

export default function Home() {
  return (
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
            <ThemeToggle />
          </div>
        </header>

        <DashboardContent />
      </div>
    </main>
  );
}
