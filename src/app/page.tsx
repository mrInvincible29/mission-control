"use client";

import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SetupGuide } from "@/components/SetupGuide";

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
      <TabsList className="grid w-full grid-cols-3 max-w-md">
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="calendar">Calendar</TabsTrigger>
        <TabsTrigger value="search">Search</TabsTrigger>
      </TabsList>

      <TabsContent value="activity" className="mt-6">
        <ActivityFeed />
      </TabsContent>

      <TabsContent value="calendar" className="mt-6">
        <CalendarView />
      </TabsContent>

      <TabsContent value="search" className="mt-6">
        <GlobalSearch />
      </TabsContent>
    </Tabs>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-background/95">
      <div className="container mx-auto px-4 py-6">
        <header className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Mission Control
          </h1>
          <p className="text-muted-foreground mt-1">
            AJ&apos;s personal command center
          </p>
        </header>

        <DashboardContent />
      </div>
    </main>
  );
}
