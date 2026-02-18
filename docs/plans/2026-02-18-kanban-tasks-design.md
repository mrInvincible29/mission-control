# Kanban Tasks Tab — Design

**Date:** 2026-02-18
**Status:** Approved

## Overview

A shared task board between AJ and Bot, visible as a new "Tasks" tab (9th tab, key `9`) in Mission Control. Tracks discrete work items with status, assignee, and priority across four Kanban columns.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Drag-and-drop | Full DnD via `@dnd-kit/core` + `@dnd-kit/sortable` | Trello-like UX from day one |
| Card detail view | shadcn Sheet (slide-out from right) | Keeps board visible, common pattern |
| Done column | Auto-archive after 7 days | `archived` flag, daily cron or on-read RPC |
| Data access | API routes (`/api/tasks`) | Single interface for both UI and Bot |
| Assignees | Extensible config table | Seeded with `aj` + `bot`, no code changes to add more |
| Card ordering | Fractional indexing | Single-row update on reorder |
| Default view | Board only (4 columns) | Classic Kanban, no list/table toggle |
| V1 scope | Full spec (UI + API + Bot integration) | Ship the complete vision |

## Data Model

### `tasks` table

```sql
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'blocked', 'done')),
  assignee text,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  tags text[],
  source text not null default 'manual'
    check (source in ('manual', 'cron', 'telegram')),
  cron_job_id uuid references cron_jobs(id) on delete set null,
  position text not null default '0', -- fractional index for ordering
  metadata jsonb default '{}',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_tasks_status on tasks(status);
create index idx_tasks_assignee on tasks(assignee);
create index idx_tasks_archived on tasks(archived);
```

### `assignees` config table

```sql
create table assignees (
  name text primary key,
  display_name text not null,
  avatar_url text
);

insert into assignees (name, display_name) values
  ('aj', 'AJ'),
  ('bot', 'Bot');
```

### Auto-archive RPC

```sql
create or replace function archive_old_tasks()
returns void as $$
  update tasks
  set archived = true, updated_at = now()
  where status = 'done'
    and completed_at < now() - interval '7 days'
    and archived = false;
$$ language sql;
```

Called daily via `pg_cron` or triggered on each GET `/api/tasks`.

## API Endpoints

All behind Traefik basic auth. All return `Cache-Control: no-cache, no-store, must-revalidate`.

### `GET /api/tasks`

Query params: `status`, `assignee`, `priority`, `archived` (default `false`), `limit`, `offset`.

Returns `{ tasks: Task[], total: number }`.

### `POST /api/tasks`

Body: `{ title, description?, status?, assignee?, priority?, tags?, source?, cron_job_id?, metadata? }`.

Returns `{ task: Task }`.

### `PATCH /api/tasks/[id]`

Body: any subset of task fields. Setting `status: 'done'` auto-sets `completed_at`.

Returns `{ task: Task }`.

### `DELETE /api/tasks/[id]`

Returns `{ success: true }`.

## UI Components

### KanbanBoard.tsx (main container)

- `"use client"`, dynamic import with `KanbanSkeleton`
- SWR polling `/api/tasks?archived=false` every 30s
- CSS Grid: 4 equal columns on desktop, stacked on mobile
- Wraps everything in `@dnd-kit` `DndContext` + `SortableContext` per column
- Filter bar above board: assignee toggle buttons, priority dropdown, tag search
- On DnD end: optimistic update via SWR mutate, PATCH task status + position

### KanbanColumn.tsx

- Droppable zone via `useDroppable`
- Column header: status label + task count badge
- Quick-add input in "To Do" column header (Enter to create)
- Renders sorted `KanbanCard` list

### KanbanCard.tsx

- Draggable via `useSortable`
- Left border stripe colored by priority (urgent=red, high=orange, medium=blue, low=gray)
- Shows: title, assignee initials/avatar, tag badges (max 2 + overflow count)
- Click opens `TaskDetailSheet`

### TaskDetailSheet.tsx

- shadcn `Sheet` from right side
- Editable fields: title (inline), description (markdown textarea), assignee (dropdown from assignees table), priority (select), tags (comma-separated input), source (read-only label)
- Shows linked cron job name if `cron_job_id` is set
- Timestamps: created, updated, completed
- Delete button with confirmation dialog
- Save on field blur or explicit save button

### KanbanSkeleton (in Skeletons.tsx)

4 columns with 3 shimmer card placeholders each.

### Tab notification badge

Tasks tab shows count of `blocked` tasks as a red badge via `useTabNotifications`.

## page.tsx Changes

- Add `"tasks"` to `VALID_TABS`
- Dynamic import `KanbanBoard` with `KanbanSkeleton`
- Grid becomes `sm:grid-cols-9`
- New `TabsTrigger` with key `9`
- Keyboard shortcut `e.key === "9"` handler
- `TabsContent` wrapped in `TabErrorBoundary`

## Bot Integration

### Auto-create tasks

- Telegram command "do X" → Bot POSTs `/api/tasks` with `{ title: "X", source: "telegram", assignee: "bot" }`
- Cron job spawns work → Bot POSTs with `{ source: "cron", cron_job_id: "<uuid>" }`
- Failed cron run → Bot POSTs with `{ status: "blocked", source: "cron", cron_job_id: "<uuid>", metadata: { error: "..." } }`

### Auto-update tasks

- Bot PATCHes own tasks: `todo` → `in_progress` when starting, → `done` when complete, → `blocked` if stuck

### Heartbeat pickup

- Bot GETs `/api/tasks?status=todo&assignee=` (unassigned tasks)
- Can self-assign by PATCHing `assignee: "bot"`

## Fractional Indexing

Use string-based fractional indices for `position` field:
- New task at end of column: generate index after last card's position
- Insert between two cards: generate index between their positions
- Library: `fractional-indexing` npm package (tiny, no deps) or hand-roll with base-62 midpoint

## Dependencies to Add

- `@dnd-kit/core` — DnD context and sensors
- `@dnd-kit/sortable` — sortable lists within columns
- `@dnd-kit/utilities` — CSS transform utilities
- `fractional-indexing` — position key generation (optional, can hand-roll)
- shadcn `sheet` component (if not already installed)
