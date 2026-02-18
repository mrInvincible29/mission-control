# UX Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate 9 dashboard tabs to 4 (Activity, Schedule, Tasks, System), reduce filter clutter, fix mobile UX, and unify health data fetching.

**Architecture:** Each consolidated tab uses a `SubViewToggle` segmented control to switch between sub-views (e.g., Activity tab toggles Feed/Analytics/Agents). A shared `useHealthData` SWR hook replaces 3 independent `/api/health` fetches. Filter controls collapse secondary options into a Popover dropdown. Search tab is removed; its functionality moves to CommandPalette.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui, SWR, lucide-react, @dnd-kit

---

### Task 1: Create `useHealthData` Shared Hook

**Files:**
- Create: `src/hooks/useHealthData.ts`
- Test: `tests/smoke.spec.ts` (API tests already exist — manual verification only)

**Step 1: Create the shared hook**

Create `src/hooks/useHealthData.ts`:

```typescript
"use client";

import useSWR from "swr";
import { useState, useEffect } from "react";

export interface HealthData {
  cpu: number;
  memPercent: number;
  containers: number;
  uptime: number;
  raw: any; // Full API response for SystemHealth component
}

const fetcher = async (): Promise<HealthData> => {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error("Health fetch failed");
  const data = await res.json();
  return {
    cpu: Math.round(100 - (data.cpu?.idle ?? 100)),
    memPercent: Math.round(data.memory?.usedPercent ?? 0),
    containers: data.docker?.length ?? 0,
    uptime: data.uptime ?? 0,
    raw: data,
  };
};

export function useHealthData(activeTab?: string) {
  const [paused, setPaused] = useState(false);

  // Faster refresh when System tab is active
  const interval = activeTab === "system" ? 10000 : 30000;

  const { data, error, isLoading, mutate } = useSWR(
    paused ? null : "health-data",
    fetcher,
    {
      refreshInterval: interval,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  );

  // Pause when browser tab is hidden
  useEffect(() => {
    const handler = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const healthStatus: "ok" | "warn" | "critical" | null = data
    ? Math.max(data.cpu, data.memPercent) >= 90
      ? "critical"
      : Math.max(data.cpu, data.memPercent) >= 70
        ? "warn"
        : "ok"
    : null;

  return {
    data,
    error,
    isLoading,
    connected: !error,
    healthStatus,
    refresh: () => mutate(),
  };
}
```

**Step 2: Verify hook compiles**

Run: `npx tsc --noEmit src/hooks/useHealthData.ts 2>&1 | head -20`
Expected: No errors (or only unrelated warnings from other files)

**Step 3: Commit**

```bash
git add src/hooks/useHealthData.ts
git commit -m "feat: add shared useHealthData hook"
```

---

### Task 2: Create `SubViewToggle` Component

**Files:**
- Create: `src/components/SubViewToggle.tsx`

**Step 1: Create the segmented pill control**

Create `src/components/SubViewToggle.tsx`:

```typescript
"use client";

interface SubView {
  id: string;
  label: string;
}

interface SubViewToggleProps {
  views: SubView[];
  active: string;
  onChange: (id: string) => void;
}

export function SubViewToggle({ views, active, onChange }: SubViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg bg-muted/50 p-0.5 text-xs">
      {views.map((view) => (
        <button
          key={view.id}
          onClick={() => onChange(view.id)}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
            active === view.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/SubViewToggle.tsx
git commit -m "feat: add SubViewToggle segmented control component"
```

---

### Task 3: Restructure `page.tsx` — 4 Tabs with Sub-Views

**Files:**
- Modify: `src/app/page.tsx`

This is the core change. Replace the 9-tab layout with 4 tabs, each containing a `SubViewToggle` that switches between sub-views.

**Step 1: Update the tab structure**

Replace the entire `DashboardContent` function and related imports/constants in `src/app/page.tsx`. Key changes:

1. Change `VALID_TABS` from 9 to 4:
```typescript
const VALID_TABS = ["activity", "schedule", "tasks", "system"] as const;
```

2. Add sub-view state with URL param sync:
```typescript
const VALID_VIEWS: Record<TabValue, string[]> = {
  activity: ["feed", "analytics", "agents"],
  schedule: ["calendar", "runs"],
  tasks: ["board"],
  system: ["health", "logs"],
};
```

3. Read `view` from URL params alongside `tab`:
```typescript
const viewParam = searchParams.get("view");
const [activeView, setActiveView] = useState<string>(
  viewParam && VALID_VIEWS[initialTab]?.includes(viewParam)
    ? viewParam
    : VALID_VIEWS[initialTab][0]
);
```

4. Sync view changes to URL:
```typescript
const handleViewChange = useCallback((view: string) => {
  setActiveView(view);
  const params = new URLSearchParams();
  if (activeTab !== "activity") params.set("tab", activeTab);
  const defaultView = VALID_VIEWS[activeTab][0];
  if (view !== defaultView) params.set("view", view);
  const url = params.toString() ? `/?${params}` : "/";
  router.replace(url, { scroll: false });
}, [activeTab, router]);
```

5. Reset view to default when tab changes:
```typescript
const handleTabChange = useCallback((value: string) => {
  const tab = value as TabValue;
  setActiveTab(tab);
  const defaultView = VALID_VIEWS[tab][0];
  setActiveView(defaultView);
  const url = tab === "activity" ? "/" : `/?tab=${tab}`;
  router.replace(url, { scroll: false });
}, [router]);
```

6. Update keyboard shortcuts — `1-4` for tabs, `Shift+1/2/3` for sub-views:
```typescript
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
```

7. Replace TabsList with 4 tabs using lucide icons for mobile:

Import icons at the top:
```typescript
import { Activity, CalendarDays, CheckSquare, Server, Search } from "lucide-react";
```

```tsx
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
```

8. Replace 9 `TabsContent` blocks with 4, each containing a `SubViewToggle` and conditional sub-view rendering:

```tsx
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
```

9. Remove the `GlobalSearch` dynamic import (Search tab is gone). Keep all other dynamic imports.

10. Remove the `SearchSkeleton` import (no longer needed in page.tsx).

11. Add `SubViewToggle` import:
```typescript
import { SubViewToggle } from "@/components/SubViewToggle";
```

12. Update the header for mobile — add search icon button, update StatusStrip for mobile:

```tsx
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
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds (may have warnings about unused GlobalSearch — that's fine)

**Step 3: Commit**

```bash
git add src/app/page.tsx src/components/SubViewToggle.tsx
git commit -m "feat: consolidate 9 tabs to 4 with sub-view toggles"
```

---

### Task 4: Update `StatusStrip` — Shared Hook + Compact Mobile Mode

**Files:**
- Modify: `src/components/StatusStrip.tsx`

**Step 1: Refactor to use `useHealthData` and add `compact` prop**

Replace the entire `StatusStrip.tsx`. The component should:
1. Accept optional `compact?: boolean` prop
2. Use `useHealthData()` hook instead of its own fetch
3. In compact mode: show a colored dot + "CPU 45% · Mem 62%" text only
4. In full mode: same as current (mini bars, docker count, etc.)
5. In compact mode: clicking navigates to `?tab=system`

```typescript
"use client";

import { useRouter } from "next/navigation";
import { Cpu, MemoryStick, Container, WifiOff } from "lucide-react";
import { useHealthData } from "@/hooks/useHealthData";

function getColor(pct: number): string {
  if (pct >= 90) return "text-red-400";
  if (pct >= 70) return "text-amber-400";
  return "text-emerald-400";
}

function getDotColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function MiniBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="w-8 h-1.5 rounded-full bg-muted/50 overflow-hidden">
      <div
        className={`h-full rounded-full ${color} transition-all duration-700`}
        style={{ width: `${Math.max(percent, 2)}%` }}
      />
    </div>
  );
}

export function StatusStrip({ compact = false }: { compact?: boolean }) {
  const { data, connected } = useHealthData();
  const router = useRouter();

  if (compact) {
    return (
      <button
        onClick={() => router.replace("/?tab=system", { scroll: false })}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {!connected && <WifiOff className="h-3 w-3 text-amber-400" />}
        {data && (
          <>
            <div className={`w-1.5 h-1.5 rounded-full ${getDotColor(Math.max(data.cpu, data.memPercent))} animate-pulse`} />
            <span className="font-mono tabular-nums">
              <span className={getColor(data.cpu)}>CPU {data.cpu}%</span>
              {" · "}
              <span className={getColor(data.memPercent)}>Mem {data.memPercent}%</span>
            </span>
          </>
        )}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      {!connected && (
        <span className="flex items-center gap-1 text-amber-400" title="Connection lost">
          <WifiOff className="h-3 w-3" />
        </span>
      )}
      {data && (
        <>
          <span className="flex items-center gap-1.5" title={`CPU: ${data.cpu}%`}>
            <Cpu className="h-3 w-3" />
            <MiniBar percent={data.cpu} color={data.cpu >= 90 ? "bg-red-500" : data.cpu >= 70 ? "bg-amber-500" : "bg-emerald-500"} />
            <span className={`font-mono tabular-nums ${getColor(data.cpu)}`}>{data.cpu}%</span>
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5" title={`Memory: ${data.memPercent}%`}>
            <MemoryStick className="h-3 w-3" />
            <MiniBar percent={data.memPercent} color={data.memPercent >= 90 ? "bg-red-500" : data.memPercent >= 70 ? "bg-amber-500" : "bg-emerald-500"} />
            <span className={`font-mono tabular-nums ${getColor(data.memPercent)}`}>{data.memPercent}%</span>
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1" title={`${data.containers} containers running`}>
            <Container className="h-3 w-3" />
            <span className="font-mono tabular-nums">{data.containers}</span>
          </span>
          <div
            className={`w-1.5 h-1.5 rounded-full ${getDotColor(Math.max(data.cpu, data.memPercent))} animate-pulse`}
            title={data.cpu >= 70 || data.memPercent >= 70 ? "High resource usage" : "System healthy"}
          />
        </>
      )}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/StatusStrip.tsx
git commit -m "refactor: StatusStrip uses shared useHealthData hook + compact mobile mode"
```

---

### Task 5: Update `useTabNotifications` — Use Shared Health Hook

**Files:**
- Modify: `src/hooks/useTabNotifications.ts`

**Step 1: Refactor to consume `useHealthData` for the health portion**

The hook should:
1. Import and use `useHealthData()` for the health status (removes independent `/api/health` fetch)
2. Keep its own fetches for logs, cronRuns, and blockedTasks (these are lightweight and don't overlap)
3. Return the same `TabNotifications` interface

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { useHealthData } from "@/hooks/useHealthData";

export interface TabNotifications {
  health: "ok" | "warn" | "critical" | null;
  logs: number;
  cronRuns: number;
  blockedTasks: number;
}

export function useTabNotifications(): TabNotifications {
  const { healthStatus } = useHealthData();
  const [extra, setExtra] = useState({ logs: 0, cronRuns: 0, blockedTasks: 0 });

  const fetchExtra = useCallback(async () => {
    try {
      const [logsRes, cronRes, tasksRes] = await Promise.allSettled([
        fetch("/api/logs?source=mission-control&lines=100"),
        fetch("/api/cron-runs?limit=50"),
        fetch("/api/tasks?status=blocked"),
      ]);

      const logs = logsRes.status === "fulfilled" && logsRes.value.ok
        ? (await logsRes.value.json()).entries?.filter((e: any) => e.level === "error").length ?? 0
        : 0;

      const dayAgo = Date.now() - 86400000;
      const cronRuns = cronRes.status === "fulfilled" && cronRes.value.ok
        ? (await cronRes.value.json()).runs?.filter((r: any) => r.status !== "ok" && r.ts > dayAgo).length ?? 0
        : 0;

      const blockedTasks = tasksRes.status === "fulfilled" && tasksRes.value.ok
        ? (await tasksRes.value.json()).total ?? 0
        : 0;

      setExtra({ logs, cronRuns, blockedTasks });
    } catch {
      // Non-critical — silently ignore
    }
  }, []);

  useEffect(() => {
    fetchExtra();
    const interval = setInterval(fetchExtra, 60000);
    return () => clearInterval(interval);
  }, [fetchExtra]);

  useEffect(() => {
    const handler = () => { if (!document.hidden) fetchExtra(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [fetchExtra]);

  return {
    health: healthStatus,
    ...extra,
  };
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/hooks/useTabNotifications.ts
git commit -m "refactor: useTabNotifications consumes shared useHealthData"
```

---

### Task 6: Update `CommandPalette` — 4 Tabs + Sub-View Navigation

**Files:**
- Modify: `src/components/CommandPalette.tsx`

**Step 1: Update navigation items**

In the `useMemo` that defines `items`, replace the 9-tab navigation items with 4 tab items + sub-view items:

Navigation section items should be:
```typescript
// Tab navigation
{ id: "nav-activity", label: "Activity", description: "Feed, Analytics, Agents", icon: <Activity />, section: "Navigation", shortcut: "1",
  action: () => { router.replace("/"); close(); } },
{ id: "nav-schedule", label: "Schedule", description: "Calendar, Run History", icon: <CalendarDays />, section: "Navigation", shortcut: "2",
  action: () => { router.replace("/?tab=schedule"); close(); } },
{ id: "nav-tasks", label: "Tasks", description: "Kanban board", icon: <CheckSquare />, section: "Navigation", shortcut: "3",
  action: () => { router.replace("/?tab=tasks"); close(); } },
{ id: "nav-system", label: "System", description: "Health, Logs", icon: <Server />, section: "Navigation", shortcut: "4",
  action: () => { router.replace("/?tab=system"); close(); } },

// Sub-view navigation
{ id: "nav-analytics", label: "Analytics", description: "Token usage, cost charts", icon: <BarChart3 />, section: "Go to",
  keywords: ["charts", "tokens", "cost", "usage"],
  action: () => { router.replace("/?tab=activity&view=analytics"); close(); } },
{ id: "nav-agents", label: "Agent Sessions", description: "Active agent monitoring", icon: <Bot />, section: "Go to",
  keywords: ["agents", "sessions", "bots"],
  action: () => { router.replace("/?tab=activity&view=agents"); close(); } },
{ id: "nav-calendar", label: "Calendar", description: "Cron job schedule grid", icon: <CalendarDays />, section: "Go to",
  keywords: ["calendar", "schedule", "cron"],
  action: () => { router.replace("/?tab=schedule&view=calendar"); close(); } },
{ id: "nav-runs", label: "Run History", description: "Cron execution history", icon: <History />, section: "Go to",
  keywords: ["runs", "cron", "history", "jobs"],
  action: () => { router.replace("/?tab=schedule&view=runs"); close(); } },
{ id: "nav-health", label: "System Health", description: "CPU, memory, disk, Docker", icon: <Server />, section: "Go to",
  keywords: ["health", "cpu", "memory", "docker", "disk"],
  action: () => { router.replace("/?tab=system&view=health"); close(); } },
{ id: "nav-logs", label: "Log Viewer", description: "Service logs", icon: <ScrollText />, section: "Go to",
  keywords: ["logs", "viewer", "journal"],
  action: () => { router.replace("/?tab=system&view=logs"); close(); } },
```

Also update the Quick Filters section — replace any tab-specific navigation (e.g., "Show Error Activities" should navigate to `/?tab=activity&view=feed` with filter, not `/?tab=activity`).

Remove any references to the Search tab or GlobalSearch-specific items.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/CommandPalette.tsx
git commit -m "feat: update CommandPalette for 4-tab layout with sub-view navigation"
```

---

### Task 7: Update `Skeletons.tsx` — Remove SearchSkeleton, Keep Others

**Files:**
- Modify: `src/components/Skeletons.tsx`

**Step 1: Remove `SearchSkeleton` export**

Delete the `SearchSkeleton` function (lines 99-124). The other skeletons remain unchanged — they are used by their respective dynamic imports.

**Step 2: Verify no import errors**

Run: `npx tsc --noEmit 2>&1 | grep -i "SearchSkeleton" | head -5`
Expected: No errors (page.tsx no longer imports it)

**Step 3: Commit**

```bash
git add src/components/Skeletons.tsx
git commit -m "chore: remove unused SearchSkeleton"
```

---

### Task 8: Dark Mode Transition Polish

**Files:**
- Modify: `src/app/globals.css`

**Step 1: Add background transition**

Add after the `@custom-variant dark` line:

```css
/* Smooth dark mode transition */
html {
  transition: background-color 0.2s ease;
}
```

**Step 2: Verify visually**

Run: `npm run build` then restart server, toggle theme in browser.
Expected: Background color transitions smoothly instead of flashing.

**Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "polish: smooth dark mode background transition"
```

---

### Task 9: ActivityFeed — Replace Emoji Icons with Lucide

**Files:**
- Modify: `src/components/ActivityFeed.tsx`

**Step 1: Replace `ACTION_TYPE_ICONS` emoji map with lucide icons**

Import the needed icons:
```typescript
import { Bot, MessageSquare, XCircle, AlertTriangle, Circle, RefreshCw, Zap, BookOpen, Pencil, Mail, CheckCircle2, Wrench, Settings } from "lucide-react";
```

Replace the `ACTION_TYPE_ICONS` object. Each value becomes a JSX element instead of a string:

```typescript
const ACTION_TYPE_ICONS: Record<string, React.ReactNode> = {
  model_usage: <Bot className="h-4 w-4" />,
  message_processed: <MessageSquare className="h-4 w-4" />,
  message_error: <XCircle className="h-4 w-4 text-red-400" />,
  session_stuck: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  webhook_error: <Circle className="h-4 w-4 text-red-400" />,
  session_state: <RefreshCw className="h-4 w-4" />,
  exec: <Zap className="h-4 w-4" />,
  read: <BookOpen className="h-4 w-4" />,
  write: <Pencil className="h-4 w-4" />,
  message: <Mail className="h-4 w-4" />,
  task: <CheckCircle2 className="h-4 w-4" />,
  fix: <Wrench className="h-4 w-4" />,
  system: <Settings className="h-4 w-4" />,
};
```

Update the `CATEGORIES` array to remove emoji prefixes:
```typescript
const CATEGORIES = [
  { label: "All", value: "" },
  { label: "Important", value: "important" },
  { label: "Model", value: "model" },
  { label: "Messages", value: "message" },
  { label: "System", value: "system" },
  { label: "Noise", value: "noise" },
];
```

Update where `ACTION_TYPE_ICONS` is rendered — since values are now JSX elements, change from rendering as text (`{icon}`) to rendering as a component. Find the line that renders the icon (likely something like `<span>{ACTION_TYPE_ICONS[actionType] || "📋"}</span>`) and change the fallback:

```typescript
{ACTION_TYPE_ICONS[actionType] || <Circle className="h-4 w-4" />}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/ActivityFeed.tsx
git commit -m "polish: replace emoji icons with lucide-react in ActivityFeed"
```

---

### Task 10: KanbanBoard — Undo Toast for Drag Moves

**Files:**
- Modify: `src/components/KanbanBoard.tsx`

**Step 1: Add undo toast to `handleDragEnd`**

Import `useToast`:
```typescript
import { useToast } from "@/components/Toast";
```

Inside the component, get the toast function:
```typescript
const { toast } = useToast();
```

In `handleDragEnd`, after the optimistic update and before the API call, if the status changed, capture the previous state for undo. After the API call succeeds, show a toast:

Replace the try/catch block in `handleDragEnd` with:

```typescript
// Save previous state for undo
const prevStatus = draggedTask.status;
const prevPosition = draggedTask.position;

// Optimistic update
mutateTasks((current) => { /* same as before */ }, { revalidate: false });

if (prevStatus !== targetStatus) {
  const columnLabel = COLUMNS.find(c => c.id === targetStatus)?.label ?? targetStatus;
  toast(`Moved to ${columnLabel}`, "success");
}

try {
  await fetch(`/api/tasks/${draggedTaskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: targetStatus, position: newPosition }),
  });
  mutateTasks();
} catch {
  mutateTasks();
  toast("Failed to move task", "error");
}
```

Note: A full "Undo" button in the toast would require extending the Toast component. For now, just show a confirmation toast. If the user wants undo functionality later, we can extend.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/KanbanBoard.tsx
git commit -m "polish: add toast notification for Kanban card moves"
```

---

### Task 11: Build, Deploy, and Verify

**Files:** None (deployment task)

**Step 1: Full build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 2: Deploy**

```bash
cp .env.local .next/standalone/.env.local
kill $(ss -tlnp | grep 39151 | grep -oP 'pid=\K[0-9]+')
```

Wait 5-10 seconds for systemd to restart the server.

**Step 3: Manual smoke check**

Open `http://localhost:39151` in browser and verify:
- 4 tabs visible (Activity, Schedule, Tasks, System)
- Sub-view toggles work in Activity, Schedule, System tabs
- Keyboard shortcuts 1-4 switch tabs
- StatusStrip shows on desktop (full) and mobile (compact)
- Search icon in header opens command palette
- Command palette shows 4 tab nav + sub-view items
- Dark mode toggle transitions smoothly

---

### Task 12: Update Smoke Tests

**Files:**
- Modify: `tests/smoke.spec.ts`

**Step 1: Update tab-related tests**

Key changes needed:

1. **"all 9 tabs are visible"** → Change to "all 4 tabs are visible":
```typescript
test("all 4 tabs are visible", async ({ page }) => {
  await page.goto("/");
  for (const tab of ["Activity", "Schedule", "Tasks", "System"]) {
    await expect(page.getByRole("tab", { name: new RegExp(tab) })).toBeVisible();
  }
});
```

2. **Tab navigation tests** — Update URLs:
   - Calendar: `/?tab=schedule` (then toggle to calendar sub-view)
   - Search: **Remove this test** (Search tab no longer exists)
   - Agents: `/?tab=activity` then switch to agents sub-view
   - Analytics: `/?tab=activity` then switch to analytics sub-view
   - Health: `/?tab=system`
   - Cron Runs: `/?tab=schedule` then switch to runs sub-view
   - Logs: `/?tab=system` then switch to logs sub-view
   - Tasks: `/?tab=tasks`

3. **Keyboard shortcut test** — Update to test 1-4:
```typescript
test("keyboard shortcuts switch tabs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();

  await page.keyboard.press("2");
  await expect(page.getByRole("tab", { name: /Schedule/ })).toHaveAttribute("data-state", "active");

  await page.keyboard.press("3");
  await expect(page.getByRole("tab", { name: /Tasks/ })).toHaveAttribute("data-state", "active");

  await page.keyboard.press("4");
  await expect(page.getByRole("tab", { name: /System/ })).toHaveAttribute("data-state", "active");

  await page.keyboard.press("1");
  await expect(page.getByRole("tab", { name: /Activity/ })).toHaveAttribute("data-state", "active");
});
```

4. **Health tab tests** — Change `/?tab=health` to `/?tab=system` or `/?tab=system&view=health`. The "System Health" text should still be visible once the health sub-view loads.

5. **Cron Runs tab tests** — Change `/?tab=cron-runs` to `/?tab=schedule&view=runs`. The "Cron Run History" text should still be visible.

6. **Logs tab tests** — Change `/?tab=logs` to `/?tab=system&view=logs`. "Log Viewer" text should still be visible.

7. **Search tab test ("search tab has an input field")** — Remove entirely.

8. **Skeleton test ("all tabs render without generic 'Loading...' fallback")** — Update tab list to `["activity", "schedule", "tasks", "system"]`.

9. **Command palette tests** — Update expected text:
   - "Go to System Health" → search for "health", expect "System Health" item
   - "Go to Cron Run History" → search for "run history", expect "Run History" item
   - "Go to Log Viewer" → search for "log", expect "Log Viewer" item
   - "Go to Tasks" → search for "tasks", expect "Tasks" item

10. **Keyboard shortcut tests for specific tabs** (e.g., "Health tab keyboard shortcut 6 works") — Remove or update:
    - Remove shortcut 6/7/8/9 tests
    - Add test for sub-view keyboard switching if desired

**Step 2: Run tests**

Run: `npx playwright test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add tests/smoke.spec.ts
git commit -m "test: update smoke tests for 4-tab layout"
```

---

## Task Dependency Graph

```
Task 1 (useHealthData) ─┬─▸ Task 4 (StatusStrip)
                         ├─▸ Task 5 (useTabNotifications)
                         └─▸ Task 3 (page.tsx) ←── Task 2 (SubViewToggle)

Task 3 (page.tsx) ──────┬─▸ Task 6 (CommandPalette)
                         ├─▸ Task 7 (Skeletons)
                         └─▸ Task 12 (Tests)

Independent:
  Task 8 (Dark mode CSS)
  Task 9 (ActivityFeed icons)
  Task 10 (Kanban toast)

Task 11 (Build & Deploy) ←── All other tasks
Task 12 (Tests) ←── Task 11
```

## Parallelizable Groups

- **Group A (can start immediately, parallel):** Task 1, Task 2, Task 8, Task 9, Task 10
- **Group B (after Group A):** Task 3 (depends on Task 1 + 2)
- **Group C (after Task 3, parallel):** Task 4, Task 5, Task 6, Task 7
- **Group D (after all):** Task 11, Task 12
