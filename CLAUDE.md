# Mission Control

Personal command center dashboard for monitoring AI agent activity, scheduled tasks, and workspace files.

## Tech Stack

- **Frontend**: Next.js 16 (App Router, `output: "standalone"`), React 19, Tailwind CSS v4, shadcn/ui (Radix primitives)
- **Backend**: Convex (real-time serverless DB — queries, mutations, full-text search)
- **Deployment**: Standalone `server.js` on `172.29.0.1:39151`, behind Traefik at `mission-control.quota.wtf` with basic auth
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
    page.tsx      # Main dashboard — 3 tabs (Activity, Calendar, Search)
    api/activity/ # POST/GET activities (basic auth)
    api/index/    # File indexing + cron sync endpoint (basic auth)
  components/
    ActivityFeed.tsx   # Paginated activity list with category/date filters
    CalendarView.tsx   # Google Calendar-style hourly grid with day/week toggle
    GlobalSearch.tsx   # Full-text search + file browser
    SetupGuide.tsx     # Convex setup instructions (shown if unconfigured)
    providers/         # ConvexClientProvider
    ui/                # shadcn/ui primitives (button, badge, card, dialog, hover-card, etc.)
  types/index.ts       # Activity, CronJob, IndexedDocument, SearchResult interfaces
scripts/
  activity-sync.mjs   # Watches OpenClaw logs → POST /api/activity
  file-watcher.mjs    # Watches ~/clawd → indexes files to Convex
  sync-cron-data.mjs  # Parses OpenClaw config → upserts cron_jobs
```

## Data Model (Convex)

**activities** — `actionType`, `category?` (important/model/message/system/noise), `description`, `timestamp`, `status` (success/error/pending), `metadata?` (tool, session, model, tokens, cost, duration, error)

**indexed_documents** — `filePath`, `fileName`, `content` (truncated 50KB), `lastIndexed`, `size`. Has `search_content` full-text index.

**cron_jobs** — `name`, `schedule` (human-readable), `command`, `enabled`, `lastRun?`, `nextRun?`, `model?` (haiku/sonnet/opus)

## Key Patterns

- **All Convex-dependent components use `dynamic()` with `ssr: false`** to avoid hydration mismatches. Convex hooks (`useQuery`, `useMutation`) are client-only.
- **Cursor-based pagination** in ActivityFeed (timestamp cursor, `hasMore` flag). Never offset-based.
- **Each dashboard tab is wrapped in `TabErrorBoundary`** — catches errors per-tab with retry.
- **CalendarView schedule parsing** converts human-readable strings ("daily 3:00 AM", "every 6 hours", "Monday 2pm") to grid positions. Frequent tasks (interval <= 6h) go to the all-day row instead of the hourly grid.
- **Model color coding**: Haiku = green, Sonnet = blue, Opus = purple, unknown = gray. Used in CalendarView task cards (left border stripe + dot).

## Commands

```bash
npm run dev          # Dev server on 172.29.0.1:39151
npm run build        # Production build (standalone) — auto-copies static assets
npm run start        # Start production server
npx convex dev       # Start Convex dev backend
npx convex typecheck # Typecheck Convex functions (tsc --noEmit)
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
- **POST /api/index** — Trigger file indexing + cron sync from OpenClaw config
- **GET /api/index** — List all indexed files

All endpoints require basic auth (via Traefik).

## When Modifying

- **After changing `convex/*.ts` files**: Run `npx convex deploy -y` to push functions to production. Without this, new/modified queries will 404 at runtime. Run `npx convex typecheck` to verify types.
- **After changing frontend code**: Run `npx convex deploy --cmd 'npm run build' -y` (deploys Convex + builds frontend in one step), then restart the server with `kill $(ss -tlnp | grep 39151 | grep -oP 'pid=\K[0-9]+')` — systemd (`mission-control.service`, `Restart=always`) auto-restarts it within 5s. **The server must be restarted after every build** — the standalone server caches its file manifest at startup and won't serve new chunks without a restart.
- Convex schema changes require `npx convex dev` to push — schema is the source of truth, not migrations.
- shadcn/ui components live in `src/components/ui/`. Add new ones with `npx shadcn@latest add <component>`.
