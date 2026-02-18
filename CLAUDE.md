# Mission Control

Personal command center dashboard for monitoring AI agent activity, scheduled tasks, and workspace files.

## Tech Stack

- **Frontend**: Next.js 16 (App Router, `output: "standalone"`), React 19, Tailwind CSS v4, shadcn/ui (Radix primitives)
- **Backend**: Supabase (PostgreSQL + RPC functions), SWR for client-side data fetching
- **Deployment**: Standalone `server.js` on `172.29.0.1:39151`, behind Traefik at `mission-control.quota.wtf` with basic auth
- **Testing**: Playwright (72 smoke tests against `http://localhost:39151`)
- **Icons**: lucide-react

## Architecture

```
supabase/
  migrations/       # PostgreSQL schema + RPC functions
src/
  app/
    page.tsx        # Main dashboard — 8 tabs (Activity, Calendar, Search, Agents, Analytics, Health, Runs, Logs)
    api/activity/   # POST/GET activities (basic auth)
    api/health/     # GET system metrics (CPU, memory, disk, Docker, services, network, processes)
    api/cron-runs/  # GET cron job execution history from ~/.openclaw/cron/runs/*.jsonl
    api/logs/       # GET service logs from journalctl + OpenClaw log files
    api/index/      # File indexing + cron sync endpoint (basic auth)
    api/sync/       # Webhook for external activity ingestion
  components/
    ActivityFeed.tsx   # Paginated activity list with category/date filters
    AnalyticsView.tsx  # Token usage, cost estimates, model breakdown charts
    CalendarView.tsx   # Google Calendar-style hourly grid with day/week toggle
    CronHistory.tsx    # Cron run history with job stats, timeline, expandable runs
    GlobalSearch.tsx   # Full-text search + file browser
    LogViewer.tsx      # Live service log viewer with source switching and filtering
    SystemHealth.tsx   # Real-time server monitoring (CPU, memory, disk, Docker, services)
    StatusStrip.tsx    # Live header vitals — CPU %, Memory %, Docker count (30s auto-refresh)
    Skeletons.tsx      # Shimmer skeleton loaders for all 8 tabs (shown during dynamic import)
    SetupGuide.tsx     # Supabase setup instructions (shown if unconfigured)
    providers/         # SWRProvider, ThemeProvider
    ui/                # shadcn/ui primitives (button, badge, card, dialog, hover-card, etc.)
  hooks/
    useTabNotifications.ts # Lightweight tab badge data (health status, error/failure counts)
  lib/
    supabase/
      client.ts        # Browser-side Supabase client singleton
      server.ts        # Server-side Supabase client (service role)
      queries.ts       # All Supabase queries — activities, documents, cron jobs, analytics
    utils.ts           # cn() class merge utility
    formatters.ts      # Shared formatTokens, formatCost, formatRelativeTime, getModelColor
  types/index.ts       # Activity, CronJob, IndexedDocument, SearchResult interfaces
scripts/
  activity-sync.mjs   # Watches latest OpenClaw log → syncs activities to Supabase
  file-watcher.mjs    # Watches ~/clawd → indexes files to Supabase
  sync-cron-data.mjs  # Parses OpenClaw config → upserts cron_jobs to Supabase
tests/
  smoke.spec.ts        # 72 Playwright smoke tests covering all tabs, APIs, and regressions
```

## Data Model (Supabase)

**activities** — `action_type`, `category` (important/model/message/system/noise), `description`, `timestamp`, `status` (success/error/pending), `metadata` (jsonb: tool, session, model, tokens, cost, duration, error)

**indexed_documents** — `file_path`, `file_name`, `content` (truncated 50KB), `last_indexed`, `size`. Has full-text search via `search_documents` RPC.

**cron_jobs** — `name`, `schedule` (human-readable), `command`, `enabled`, `last_run`, `next_run`, `model` (haiku/sonnet/opus)

**RPC functions**: `analytics_summary(p_days)`, `activity_stats(p_since)`, `cleanup_old_activities()`, `search_documents(p_query, p_limit)`

## Data Pipelines

Two independent pipelines feed activity data into Supabase:

1. **OpenClaw extension** (`extension/src/service.ts`) — Subscribes to OpenClaw diagnostic events (model.usage, message.processed, session.stuck, etc.) and posts directly to Supabase. Auto-loaded by OpenClaw via `plugins.load.paths` in `openclaw.json`.

2. **Log watcher** (`scripts/activity-sync.mjs`) — Watches the most recently modified `/tmp/openclaw/openclaw-*.log` for JSON log lines, parses tool calls/messages/errors, and posts to Supabase. Runs as a systemd user service (`mc-activity-sync.service`). Switches to newer log files automatically.

Health and cron data are fetched on-demand by the frontend:
- `/api/health` — Reads `/proc/stat`, `/proc/meminfo`, runs `docker ps`, `systemctl`, `df`, `ps aux`
- `/api/cron-runs` — Reads `~/.openclaw/cron/runs/*.jsonl` and `~/.openclaw/cron/jobs.json`

Both APIs return `Cache-Control: no-cache, no-store, must-revalidate` to prevent stale data.

## Key Patterns

- **Heavy components use `dynamic()` with `ssr: false`** and SWR for data fetching. Each gets a shimmer skeleton loader while loading.
- **Cursor-based pagination** in ActivityFeed (timestamp cursor, `hasMore` flag). Never offset-based.
- **Each dashboard tab is wrapped in `TabErrorBoundary`** — catches errors per-tab with retry.
- **Connection error banners** — SystemHealth and CronHistory show an amber "Connection lost — retrying..." banner when fetch fails but stale data is already displayed, rather than silently showing outdated metrics.
- **CalendarView schedule parsing** converts human-readable strings ("daily 3:00 AM", "every 6 hours", "Monday 2pm") to grid positions. Frequent tasks (interval <= 6h) go to the all-day row instead of the hourly grid.
- **Model color coding**: Haiku = green, Sonnet = blue, Opus = purple, unknown = gray. Used in CalendarView task cards (left border stripe + dot).
- **StatusStrip in header** — live CPU/memory/Docker count with mini progress bars (30s polling, pauses when tab hidden). Shows on desktop; mobile sees subtitle text.
- **Tab notification badges** — Health tab shows colored dot (amber=warn, red=critical), Runs and Logs tabs show count badges for failures/errors. Powered by `useTabNotifications` hook (60s polling).

## Commands

```bash
npm run dev          # Dev server on 172.29.0.1:39151
npm run build        # Production build (standalone) — auto-copies static assets
npm run start        # Start production server
npx playwright test  # Run all 72 smoke tests against localhost:39151

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

All endpoints require basic auth (via Traefik). Health, cron-runs, and logs APIs include `Cache-Control: no-cache` headers.

## Systemd Services

- `mission-control.service` (system) — Production Next.js server on port 39151
- `mc-file-watcher.service` (system) — File watcher for Supabase document indexing
- `mc-activity-sync.service` (user, `~/.config/systemd/user/`) — Log-based activity sync to Supabase
- `openclaw-gateway.service` (user) — OpenClaw gateway with Supabase env vars for extension

## When Modifying

- **Database schema changes**: Create a migration with `npm run db:new -- <name>`, write SQL in the generated file under `supabase/migrations/`, then apply with `npm run db:push`. Use `npm run db:list` to verify.
- **After changing frontend code**: Run `npm run build`, copy `.env.local` to `.next/standalone/`, then restart the server with `kill $(ss -tlnp | grep 39151 | grep -oP 'pid=\K[0-9]+')` — systemd (`mission-control.service`, `Restart=always`) auto-restarts it within 5s. **The server must be restarted after every build** — the standalone server caches its file manifest at startup and won't serve new chunks without a restart.
- shadcn/ui components live in `src/components/ui/`. Add new ones with `npx shadcn@latest add <component>`.
