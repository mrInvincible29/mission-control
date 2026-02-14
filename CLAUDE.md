# Mission Control

Personal command center dashboard for monitoring AI agent activity, scheduled tasks, and workspace files.

## Tech Stack

- **Frontend**: Next.js 16 (App Router, `output: "standalone"`), React 19, Tailwind CSS v4, shadcn/ui (Radix primitives)
- **Backend**: Convex (real-time serverless DB — queries, mutations, full-text search)
- **Deployment**: Standalone `server.js` on `172.29.0.1:39151`, behind Traefik at `mission-control.quota.wtf` with basic auth
- **Testing**: Playwright (51 smoke tests against `http://localhost:39151`)
- **Icons**: lucide-react

## Architecture

```
convex/           # Backend: schema, queries, mutations
  schema.ts       # 3 tables: activities, indexed_documents, cron_jobs
  activities.ts   # Activity CRUD + stats (cursor-paginated)
  documents.ts    # Full-text search index
  cronJobs.ts     # Cron job upsert/list/remove
src/
  app/
    page.tsx      # Main dashboard — 7 tabs (Activity, Calendar, Search, Agents, Analytics, Health, Runs)
    api/activity/ # POST/GET activities (basic auth)
    api/health/   # GET system metrics (CPU, memory, disk, Docker, services, network, processes)
    api/cron-runs/# GET cron job execution history from ~/.openclaw/cron/runs/*.jsonl
    api/index/    # File indexing + cron sync endpoint (basic auth)
  components/
    ActivityFeed.tsx   # Paginated activity list with category/date filters
    AnalyticsView.tsx  # Token usage, cost estimates, model breakdown charts
    CalendarView.tsx   # Google Calendar-style hourly grid with day/week toggle
    CronHistory.tsx    # Cron run history with job stats, timeline, expandable runs
    GlobalSearch.tsx   # Full-text search + file browser
    SystemHealth.tsx   # Real-time server monitoring (CPU, memory, disk, Docker, services)
    SetupGuide.tsx     # Convex setup instructions (shown if unconfigured)
    providers/         # ConvexClientProvider
    ui/                # shadcn/ui primitives (button, badge, card, dialog, hover-card, etc.)
  types/index.ts       # Activity, CronJob, IndexedDocument, SearchResult interfaces
scripts/
  activity-sync.mjs   # Watches OpenClaw logs → syncs activities to Convex (handles midnight rollover)
  file-watcher.mjs    # Watches ~/clawd → indexes files to Convex
  sync-cron-data.mjs  # Parses OpenClaw config → upserts cron_jobs
tests/
  smoke.spec.ts        # 51 Playwright smoke tests covering all tabs, APIs, and regressions
```

## Data Model (Convex)

**activities** — `actionType`, `category?` (important/model/message/system/noise), `description`, `timestamp`, `status` (success/error/pending), `metadata?` (tool, session, model, tokens, cost, duration, error)

**indexed_documents** — `filePath`, `fileName`, `content` (truncated 50KB), `lastIndexed`, `size`. Has `search_content` full-text index.

**cron_jobs** — `name`, `schedule` (human-readable), `command`, `enabled`, `lastRun?`, `nextRun?`, `model?` (haiku/sonnet/opus)

## Data Pipelines

Two independent pipelines feed activity data into Convex:

1. **OpenClaw extension** (`extension/src/service.ts`) — Subscribes to OpenClaw diagnostic events (model.usage, message.processed, session.stuck, etc.) and posts directly to Convex. Auto-loaded by OpenClaw via `plugins.load.paths` in `openclaw.json`.

2. **Log watcher** (`scripts/activity-sync.mjs`) — Watches `/tmp/openclaw/openclaw-YYYY-MM-DD.log` for JSON log lines, parses tool calls/messages/errors, and posts to Convex. Runs as a systemd user service (`mc-activity-sync.service`). Handles midnight log file rollover automatically.

Health and cron data are fetched on-demand by the frontend:
- `/api/health` — Reads `/proc/stat`, `/proc/meminfo`, runs `docker ps`, `systemctl`, `df`, `ps aux`
- `/api/cron-runs` — Reads `~/.openclaw/cron/runs/*.jsonl` and `~/.openclaw/cron/jobs.json`

Both APIs return `Cache-Control: no-cache, no-store, must-revalidate` to prevent stale data.

## Key Patterns

- **All Convex-dependent components use `dynamic()` with `ssr: false`** to avoid hydration mismatches. Convex hooks (`useQuery`, `useMutation`) are client-only.
- **Cursor-based pagination** in ActivityFeed (timestamp cursor, `hasMore` flag). Never offset-based.
- **Each dashboard tab is wrapped in `TabErrorBoundary`** — catches errors per-tab with retry.
- **Connection error banners** — SystemHealth and CronHistory show an amber "Connection lost — retrying..." banner when fetch fails but stale data is already displayed, rather than silently showing outdated metrics.
- **CalendarView schedule parsing** converts human-readable strings ("daily 3:00 AM", "every 6 hours", "Monday 2pm") to grid positions. Frequent tasks (interval <= 6h) go to the all-day row instead of the hourly grid.
- **Model color coding**: Haiku = green, Sonnet = blue, Opus = purple, unknown = gray. Used in CalendarView task cards (left border stripe + dot).

## Commands

```bash
npm run dev          # Dev server on 172.29.0.1:39151
npm run build        # Production build (standalone) — auto-copies static assets
npm run start        # Start production server
npx convex dev       # Start Convex dev backend
npx convex typecheck # Typecheck Convex functions (tsc --noEmit)
npx playwright test  # Run all 51 smoke tests against localhost:39151
```

## Environment

Requires `.env.local`:
```
NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud
WORKSPACE_PATH=/home/h2/clawd
```

Basic auth credentials for API endpoints are configured in Traefik (see `~/fast/ws/traefik/dynamic/mission-control.yml`).

## API Endpoints

- **POST /api/activity** — Log an activity `{ actionType, description, status, metadata? }`
- **GET /api/activity** — Fetch latest 100 activities
- **GET /api/health** — System metrics (CPU, memory, disk, Docker, services, network, top processes)
- **GET /api/cron-runs** — Cron job execution history. Params: `limit`, `jobId`, `status`
- **POST /api/index** — Trigger file indexing + cron sync from OpenClaw config
- **GET /api/index** — List all indexed files

All endpoints require basic auth (via Traefik). Health and cron-runs APIs include `Cache-Control: no-cache` headers.

## Systemd Services

- `mission-control.service` (system) — Production Next.js server on port 39151
- `mc-file-watcher.service` (system) — File watcher for Convex document indexing
- `mc-activity-sync.service` (user, `~/.config/systemd/user/`) — Log-based activity sync from OpenClaw

## When Modifying

- **After changing `convex/*.ts` files**: Run `npx convex deploy -y` to push functions to production. Without this, new/modified queries will 404 at runtime. Run `npx convex typecheck` to verify types.
- **After changing frontend code**: Run `npx convex deploy --cmd 'npm run build' -y` (deploys Convex + builds frontend in one step), then restart the server with `kill $(ss -tlnp | grep 39151 | grep -oP 'pid=\K[0-9]+')` — systemd (`mission-control.service`, `Restart=always`) auto-restarts it within 5s. **The server must be restarted after every build** — the standalone server caches its file manifest at startup and won't serve new chunks without a restart.
- Convex schema changes require `npx convex dev` to push — schema is the source of truth, not migrations.
- shadcn/ui components live in `src/components/ui/`. Add new ones with `npx shadcn@latest add <component>`.
