# Mission Control

Personal command center dashboard for monitoring AI agent activity, scheduled tasks, and workspace files.

## Tech Stack

- **Frontend**: Next.js 16 (App Router, `output: "standalone"`), React 19, Tailwind CSS v4, shadcn/ui (Radix primitives)
- **Backend**: Supabase (PostgreSQL + RPC functions), SWR for client-side data fetching
- **Deployment**: Standalone `server.js` on `172.29.0.1:39151`, behind Traefik at `mission-control.quota.wtf` with basic auth
- **Testing**: Playwright (106 smoke tests against `http://localhost:39151`)
- **Icons**: lucide-react

## Architecture

```
supabase/
  migrations/       # PostgreSQL schema + RPC functions
src/
  app/
    page.tsx        # Main dashboard — 4 tabs with sub-views (Activity, Schedule, Tasks, System)
    api/activity/   # POST/GET activities (basic auth)
    api/health/     # GET system metrics (CPU, memory, disk, Docker, services, network, processes)
    api/cron-runs/  # GET cron job execution history from ~/.openclaw/cron/runs/*.jsonl
    api/logs/       # GET service logs from journalctl + OpenClaw log files
    api/index/      # File indexing + cron sync endpoint (basic auth)
    api/tasks/      # CRUD for Kanban task board (GET/POST + PATCH/DELETE by ID)
    api/assignees/  # GET assignee list for task board
    api/services/   # GET services directory with HTTP health checks + systemd status
    api/sync/       # Webhook for external activity ingestion
  components/
    SubViewToggle.tsx  # Segmented pill control for switching sub-views within a tab
    ActivityFeed.tsx   # Paginated activity list with category/date filters (Activity > Feed)
    AnalyticsView.tsx  # Token usage, cost estimates, model breakdown charts (Activity > Analytics)
    AgentSessions.tsx  # Active agent session monitoring (Activity > Agents)
    CalendarView.tsx   # Google Calendar-style hourly grid with day/week toggle (Schedule > Calendar)
    CronHistory.tsx    # Cron run history with job stats, timeline, expandable runs (Schedule > Runs)
    KanbanBoard.tsx    # Drag-and-drop Kanban task board with 4 columns, detail sheet (Tasks)
    SystemHealth.tsx   # Real-time server monitoring (CPU, memory, disk, Docker, services) (System > Health)
    LogViewer.tsx      # Live service log viewer with source switching and filtering (System > Logs)
    ServicesView.tsx   # Services directory with health checks, status dots, filtering (System > Services)
    StatusStrip.tsx    # Live header vitals — full mode (desktop) + compact mode (mobile), uses shared health hook
    CommandPalette.tsx # Cmd+K palette — tab/sub-view navigation, actions, quick filters
    GlobalSearch.tsx   # Full-text search + file browser (accessible via command palette)
    Skeletons.tsx      # Shimmer skeleton loaders for all tabs (shown during dynamic import)
    SetupGuide.tsx     # Supabase setup instructions (shown if unconfigured)
    Toast.tsx          # Toast notification system (success/error/info, 4s auto-dismiss)
    providers/         # SWRProvider, ThemeProvider
    ui/                # shadcn/ui primitives (button, badge, card, dialog, hover-card, etc.)
  hooks/
    useHealthData.ts     # Shared SWR hook for /api/health — single fetch, consumed by StatusStrip, useTabNotifications, SystemHealth
    useTabNotifications.ts # Tab badge data (health status from shared hook, log errors, cron failures, blocked tasks)
  lib/
    supabase/
      client.ts        # Browser-side Supabase client singleton
      server.ts        # Server-side Supabase client (service role)
      queries.ts       # All Supabase queries — activities, documents, cron jobs, analytics
    utils.ts           # cn() class merge utility
    formatters.ts      # Shared formatTokens, formatCost, formatRelativeTime, getModelColor
  types/index.ts       # Activity, CronJob, IndexedDocument, SearchResult, Task, Assignee interfaces
scripts/
  activity-sync.mjs   # Watches latest OpenClaw log → syncs activities to Supabase
  file-watcher.mjs    # Watches ~/clawd → indexes files to Supabase
  sync-cron-data.mjs  # Parses OpenClaw config → upserts cron_jobs to Supabase
tests/
  smoke.spec.ts        # 96 Playwright smoke tests covering all tabs, sub-views, APIs, and regressions
  services.spec.ts     # 10 Playwright tests for Services Directory sub-view and API
```

## Data Model (Supabase)

**activities** — `action_type`, `category` (important/model/message/system/noise), `description`, `timestamp`, `status` (success/error/pending), `metadata` (jsonb: tool, session, model, tokens, cost, duration, error)

**indexed_documents** — `file_path`, `file_name`, `content` (truncated 50KB), `last_indexed`, `size`. Has full-text search via `search_documents` RPC.

**cron_jobs** — `name`, `schedule` (human-readable), `command`, `enabled`, `last_run`, `next_run`, `model` (haiku/sonnet/opus)

**tasks** — `title`, `description`, `status` (todo/in_progress/blocked/done), `assignee` (FK to assignees), `priority` (low/medium/high/urgent), `tags` (text[]), `source` (manual/cron/telegram), `cron_job_id` (FK to cron_jobs), `position` (fractional index), `metadata` (jsonb), `archived`, `completed_at`

**assignees** — `name` (PK), `display_name`, `avatar_url`. Seeded with `aj` and `bot`.

**RPC functions**: `analytics_summary(p_days)`, `activity_stats(p_since)`, `cleanup_old_activities()`, `search_documents(p_query, p_limit)`, `archive_old_tasks()` (marks done tasks >7 days as archived)

## Data Pipelines

Two independent pipelines feed activity data into Supabase:

1. **OpenClaw extension** (`extension/src/service.ts`) — Subscribes to OpenClaw diagnostic events (model.usage, message.processed, session.stuck, etc.) and posts directly to Supabase. Auto-loaded by OpenClaw via `plugins.load.paths` in `openclaw.json`.

2. **Log watcher** (`scripts/activity-sync.mjs`) — Watches the most recently modified `/tmp/openclaw/openclaw-*.log` for JSON log lines, parses tool calls/messages/errors, and posts to Supabase. Runs as a systemd user service (`mc-activity-sync.service`). Switches to newer log files automatically.

Health and cron data are fetched on-demand by the frontend:
- `/api/health` — Reads `/proc/stat`, `/proc/meminfo`, runs `docker ps`, `systemctl`, `df`, `ps aux`
- `/api/cron-runs` — Reads `~/.openclaw/cron/runs/*.jsonl` and `~/.openclaw/cron/jobs.json`

Both APIs return `Cache-Control: no-cache, no-store, must-revalidate` to prevent stale data.

## Dashboard Layout (4 Tabs)

The dashboard uses 4 top-level tabs, each with sub-views toggled by a `SubViewToggle` segmented pill control:

| Tab | Sub-views | Keyboard |
|-----|-----------|----------|
| **Activity** | Feed (default), Analytics, Agents | `1` then `Shift+1/2/3` |
| **Schedule** | Calendar (default), Run History | `2` then `Shift+1/2` |
| **Tasks** | Kanban board (single view) | `3` |
| **System** | Health (default), Logs, Services | `4` then `Shift+1/2/3` |

URL structure: `/?tab=<tab>&view=<view>` (both optional, defaults to Activity > Feed).

## Key Patterns

- **Heavy components use `dynamic()` with `ssr: false`** and SWR for data fetching. Each gets a shimmer skeleton loader while loading.
- **Shared `useHealthData` hook** — single SWR key (`health-data`) for `/api/health`, consumed by StatusStrip, useTabNotifications, and SystemHealth. Smart refresh: 30s default, 10s when System tab active, pauses when browser tab hidden.
- **Cursor-based pagination** in ActivityFeed (timestamp cursor, `hasMore` flag). Never offset-based.
- **Each dashboard tab is wrapped in `TabErrorBoundary`** — catches errors per-tab with retry.
- **Connection error banners** — SystemHealth and CronHistory show an amber "Connection lost — retrying..." banner when fetch fails but stale data is already displayed, rather than silently showing outdated metrics.
- **CalendarView schedule parsing** converts human-readable strings ("daily 3:00 AM", "every 6 hours", "Monday 2pm") to grid positions. Frequent tasks (interval <= 6h) go to the all-day row instead of the hourly grid.
- **Model color coding**: Haiku = green, Sonnet = blue, Opus = purple, unknown = gray. Used in CalendarView task cards (left border stripe + dot).
- **StatusStrip in header** — full mode on desktop (mini bars, docker count), compact mode on mobile (colored dot + CPU/Mem text, tappable to navigate to System tab). Both consume `useHealthData`.
- **Tab notification badges** — System tab shows colored dot (amber=warn, red=critical) + log error count, Schedule tab shows cron failure count, Tasks tab shows blocked count. Powered by `useTabNotifications` hook.
- **Kanban board** — 4 columns (To Do, In Progress, Blocked, Done) with `@dnd-kit` drag-and-drop. Cards use fractional indexing (`fractional-indexing` package) for position. Priority color coding: urgent=red, high=orange, medium=blue, low=gray. Quick-add in To Do column. Detail sheet (shadcn Sheet) opens from right on card click. Toast on card moves. Auto-archive done tasks after 7 days via `archive_old_tasks()` RPC.
- **Command palette (Cmd+K)** — navigates to tabs and sub-views, triggers actions, applies quick filters. Mobile users access via search icon in header.

## Commands

```bash
npm run dev          # Dev server on 172.29.0.1:39151
npm run build        # Production build (standalone) — auto-copies static assets
npm run start        # Start production server
npx playwright test  # Run all 82 smoke tests against localhost:39151

# Database migrations (Supabase CLI — needs SUPABASE_DB_PASSWORD env var)
npm run db:new -- <name>  # Create new migration file
npm run db:push           # Apply pending migrations to remote
npm run db:pull           # Pull remote schema into local migrations
npm run db:diff           # Diff local vs remote schema
npm run db:list           # List migration status (applied/pending)
```

## Environment

Requires `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ACCESS_TOKEN=<personal-access-token>  # For CLI migrations
WORKSPACE_PATH=/home/h2/clawd
```

Basic auth credentials for API endpoints are configured in Traefik (see `~/fast/ws/traefik/dynamic/mission-control.yml`).

## API Endpoints

- **POST /api/activity** — Log an activity `{ actionType, description, status, metadata? }`
- **GET /api/activity** — Fetch latest 100 activities
- **GET /api/health** — System metrics (CPU, memory, disk, Docker, services, network, top processes)
- **GET /api/cron-runs** — Cron job execution history. Params: `limit`, `jobId`, `status`
- **GET /api/logs** — Service log viewer. No params returns available sources. Params: `source` (required for entries), `lines` (default 100, max 500)
- **POST /api/index** — Trigger file indexing + cron sync from OpenClaw config
- **GET /api/index** — List all indexed files

- **GET /api/tasks** — List tasks. Params: `status`, `assignee`, `priority`, `archived` (default false), `limit`, `offset`
- **POST /api/tasks** — Create task `{ title, description?, status?, assignee?, priority?, tags?, source?, cron_job_id?, metadata? }`
- **PATCH /api/tasks/:id** — Update task fields (auto-sets `completed_at` on status→done)
- **DELETE /api/tasks/:id** — Delete task
- **GET /api/services** — Services directory with HTTP health checks (HEAD, 5s timeout) and systemd unit status. Returns JSON array with name, url, port, category, status (up/degraded/down), httpStatus, responseTime, systemd, systemdStatus
- **GET /api/assignees** — List assignees for task board

All endpoints require basic auth (via Traefik). Health, cron-runs, logs, tasks, and services APIs include `Cache-Control: no-cache` headers.

## Systemd Services

- `mission-control.service` (system) — Production Next.js server on port 39151
- `mc-file-watcher.service` (system) — File watcher for Supabase document indexing
- `mc-activity-sync.service` (user, `~/.config/systemd/user/`) — Log-based activity sync to Supabase
- `openclaw-gateway.service` (user) — OpenClaw gateway with Supabase env vars for extension

## When Modifying

- **Database schema changes**: Create a migration with `npm run db:new -- <name>`, write SQL in the generated file under `supabase/migrations/`, then apply with `npm run db:push`. Use `npm run db:list` to verify.
- **After changing frontend code**: Run `npm run build`, copy `.env.local` to `.next/standalone/`, then restart the server with `kill $(ss -tlnp | grep 39151 | grep -oP 'pid=\K[0-9]+')` — systemd (`mission-control.service`, `Restart=always`) auto-restarts it within 5s. **The server must be restarted after every build** — the standalone server caches its file manifest at startup and won't serve new chunks without a restart.
- shadcn/ui components live in `src/components/ui/`. Add new ones with `npx shadcn@latest add <component>`.

## Adding New Functionality

**Default: add as a sub-view to an existing tab.** The 4-tab structure is intentional — resist adding top-level tabs.

### Where to put new features

| If the feature is about... | Add it to | As a... |
|----------------------------|-----------|---------|
| Agent work, usage, costs, sessions | **Activity** tab | New sub-view or section within Feed/Analytics |
| Cron jobs, scheduling, recurring tasks | **Schedule** tab | New sub-view or section within Calendar/Runs |
| Work items, projects, tracking | **Tasks** tab | Section within Kanban or new sub-view |
| Server ops, monitoring, debugging | **System** tab | New sub-view or section within Health/Logs |
| Quick access / cross-cutting | **Command palette** | New palette item (action or navigation) |

### Decision tree for sub-view vs. section

1. **Does it need its own full-page layout?** → Add as a sub-view (new entry in `VALID_VIEWS` + `SubViewToggle`)
2. **Is it supplementary to an existing view?** → Add as a collapsible section within that view
3. **Is it a quick action or shortcut?** → Add to CommandPalette only

### When to add a new top-level tab (rarely)

Only if ALL of these are true:
- The feature serves a **completely different domain** that doesn't fit any existing tab
- It would be used **frequently enough** to justify top-level visibility
- It has **no logical parent** among Activity, Schedule, Tasks, or System
- You've exhausted sub-view and command palette options first

If you do add a tab: update `VALID_TABS`, `VALID_VIEWS`, keyboard shortcuts, `TabsList`, `CommandPalette` navigation items, `useTabNotifications` (if badges needed), `Skeletons.tsx`, and `smoke.spec.ts`.

### Checklist for any new sub-view

1. Create the component in `src/components/` with `dynamic()` import + skeleton loader
2. Add entry to `VALID_VIEWS` in `page.tsx`
3. Add to `SubViewToggle` views array for the parent tab
4. Add navigation item to `CommandPalette.tsx`
5. Add skeleton to `Skeletons.tsx` if not reusing an existing one
6. Add smoke tests to `tests/smoke.spec.ts`
7. If it fetches `/api/health`, use the shared `useHealthData` hook — never add independent health fetches
