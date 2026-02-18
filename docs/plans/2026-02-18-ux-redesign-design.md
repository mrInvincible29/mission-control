# UX Redesign: Tab Consolidation & Polish

**Date:** 2026-02-18
**Status:** Approved

## Goal

Consolidate 9 dashboard tabs down to 4, reduce filter clutter, fix mobile UX, and unify data fetching patterns. Personal command center should feel focused, not overwhelming.

## Section 1: Tab Consolidation (9 → 4)

| Tab | Sub-views | Default view |
|-----|-----------|-------------|
| **Activity** | Feed (list) · Analytics (charts) · Agents (sessions) | Feed |
| **Schedule** | Calendar (grid) · Runs (execution history) | Calendar |
| **Tasks** | KanbanBoard (unchanged) | Kanban |
| **System** | Health (metrics) · Logs (terminal) | Health |

- Sub-view switching via a segmented pill control inside each tab (not nested tabs)
- **Search tab removed** — GlobalSearch file browser moves to command palette (Cmd+K) as a searchable section
- Keyboard shortcuts: `1-4` for tabs, `Shift+1/2/3` for sub-views within a tab

## Section 2: Filter & Controls Cleanup

**Principle:** 1-2 primary controls stay visible. Everything else collapses into a "Filters" dropdown with an active-count badge.

| Sub-view | Visible controls | In "Filters" dropdown |
|----------|------------------|-----------------------|
| Activity Feed | Category pills | Date range, text search |
| Log Viewer | Source buttons | Level filter, line count, text search |
| Cron Runs | Job filter pill | Sort order, status filter |
| Kanban | Assignee + priority filters | (already clean) |

- "Clear all" button appears when any filter is active
- Filter state persists in URL params (e.g., `?tab=activity&view=feed&category=important&range=7d`)

## Section 3: Shared Health Data

- Single `useHealthData()` hook backed by one SWR key — replaces 3 independent fetches
- Smart refresh: 30s default, 10s when System tab is active, pauses when browser tab hidden
- StatusStrip and tab notification badges both consume the shared hook

## Section 4: Mobile UX

- **4 tabs fit on all phones** — no horizontal scrolling needed
- **Icons + short labels on mobile** — lucide icons (Activity, Calendar, CheckSquare, Server) with text
- **StatusStrip on mobile** — replaces static subtitle with condensed health pill (colored dot + "CPU 45% · Mem 62%"). Tapping navigates to System tab
- **Command palette trigger** — search icon button in mobile header (next to theme toggle)

## Section 5: Polish & Quality-of-Life

- Empty states with action buttons ("Clear filters", "Add a task")
- Consistent loading: all sub-views use Skeletons.tsx for both dynamic import and SWR loading
- Connection error banner on all sub-views (amber "Connection lost — retrying...")
- Undo toast for Kanban card moves (5s window)
- Dark mode transition: `transition: background-color 0.2s` on `:root` to prevent flash
- Replace emoji icons in ActivityFeed with lucide-react icons

## Not Doing

- Sortable tables in SystemHealth
- Tablet-specific breakpoints
- Swipe-to-dismiss toasts
- Filter-aware stats recalculation in ActivityFeed

## Components Affected

- `src/app/page.tsx` — tab structure, header, keyboard shortcuts
- `src/components/ActivityFeed.tsx` — filter refactor, emoji → lucide
- `src/components/AnalyticsView.tsx` — becomes sub-view of Activity tab
- `src/components/AgentSessions.tsx` — becomes sub-view of Activity tab
- `src/components/CalendarView.tsx` — becomes sub-view of Schedule tab
- `src/components/CronHistory.tsx` — becomes sub-view of Schedule tab, filter refactor
- `src/components/SystemHealth.tsx` — becomes sub-view of System tab, shared hook
- `src/components/LogViewer.tsx` — becomes sub-view of System tab, filter refactor
- `src/components/KanbanBoard.tsx` — undo toast for moves
- `src/components/StatusStrip.tsx` — shared hook, mobile condensed view
- `src/components/CommandPalette.tsx` — absorb GlobalSearch file browser
- `src/components/GlobalSearch.tsx` — removed as standalone tab
- `src/components/Skeletons.tsx` — update for 4-tab layout
- `src/hooks/useTabNotifications.ts` — consume shared health hook
- `src/hooks/useHealthData.ts` — new shared hook
- `src/app/globals.css` — dark mode transition
- `tests/smoke.spec.ts` — update for new tab structure
