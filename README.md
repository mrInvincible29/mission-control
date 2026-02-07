# Mission Control

AJ's personal command center - a dashboard for activity tracking, scheduling, and workspace search.

## Features

- **Activity Feed** - Real-time activity log with filtering by action type
- **Calendar View** - Weekly schedule showing cron jobs and heartbeat tasks
- **Global Search** - Full-text search across memory files and workspace

## Quick Start

### 1. Install Dependencies

```bash
cd ~/fast/ws/mission-control
npm install
```

### 2. Configure Convex

```bash
npx convex dev
```

This will:
- Prompt you to log in to Convex (or create an account)
- Create a new project
- Deploy your schema and functions
- Display your deployment URL

### 3. Update Environment

Add the Convex URL to `.env.local`:

```bash
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
WORKSPACE_PATH=/home/h2/clawd
```

### 4. Start the Server

```bash
npm run dev
```

The server runs on `http://172.29.0.1:39151` (accessible via Traefik at `https://mission-control.quota.wtf`).

## API Endpoints

### POST /api/activity

Log a new activity:

```bash
curl -X POST https://mission-control.quota.wtf/api/activity \
  -u h2:s9Lx4BR2GpMQhCni7imr \
  -H "Content-Type: application/json" \
  -d '{
    "actionType": "exec",
    "description": "Ran backup script",
    "status": "success",
    "metadata": {
      "tool": "exec",
      "duration": 1234
    }
  }'
```

### POST /api/index

Trigger file indexing:

```bash
curl -X POST https://mission-control.quota.wtf/api/index \
  -u h2:s9Lx4BR2GpMQhCni7imr
```

### GET /api/index

List indexed files:

```bash
curl https://mission-control.quota.wtf/api/index \
  -u h2:s9Lx4BR2GpMQhCni7imr
```

## Architecture

- **Frontend:** Next.js 14+ with App Router
- **Database:** Convex (real-time subscriptions)
- **Styling:** Tailwind CSS + shadcn/ui
- **Auth:** Basic auth via Traefik

## Files Indexed

- `MEMORY.md` - Long-term memory
- `TOOLS.md` - Tool documentation
- `AGENTS.md` - Agent configuration
- `USER.md`, `SOUL.md` - Identity files
- `memory/*.md` - Daily memory files

## Cron Jobs

The calendar view reads scheduled tasks from `~/.openclaw/openclaw.json`:
- Heartbeat configuration
- Any defined cron jobs

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start
```

## Traefik Configuration

Located at `~/fast/ws/traefik/dynamic/mission-control.yml`:
- Routes `mission-control.quota.wtf` to `172.29.0.1:39151`
- Basic auth: `h2` / `s9Lx4BR2GpMQhCni7imr`
- TLS via Cloudflare
