# Kanban Tasks Tab — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full Kanban task board as the 9th tab in Mission Control, with drag-and-drop, API endpoints for Bot integration, and auto-archiving.

**Architecture:** New `tasks` + `assignees` Supabase tables, CRUD API routes at `/api/tasks`, a `KanbanBoard` component with `@dnd-kit` drag-and-drop, and a shadcn Sheet for task detail editing. The UI polls the API via SWR; Bot and Telegram use the same API.

**Tech Stack:** Next.js 16 App Router, Supabase, @dnd-kit/core + sortable, fractional-indexing, shadcn/ui Sheet, SWR, Playwright tests.

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install npm packages**

Run:
```bash
cd /home/h2/fast/ws/mission-control && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities fractional-indexing
```

**Step 2: Add shadcn sheet component**

Run:
```bash
cd /home/h2/fast/ws/mission-control && npx shadcn@latest add sheet --yes
```

This creates `src/components/ui/sheet.tsx`.

**Step 3: Verify installation**

Run:
```bash
cd /home/h2/fast/ws/mission-control && node -e "require('@dnd-kit/core'); require('@dnd-kit/sortable'); require('fractional-indexing'); console.log('OK')"
```
Expected: `OK`

Run:
```bash
ls /home/h2/fast/ws/mission-control/src/components/ui/sheet.tsx
```
Expected: file exists

**Step 4: Commit**

```bash
cd /home/h2/fast/ws/mission-control && git add package.json package-lock.json src/components/ui/sheet.tsx && git commit -m "chore: add @dnd-kit, fractional-indexing, shadcn sheet"
```

---

### Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/<timestamp>_add_tasks_and_assignees.sql`

**Step 1: Create migration file**

Run:
```bash
cd /home/h2/fast/ws/mission-control && npm run db:new -- add_tasks_and_assignees
```

This creates a timestamped file in `supabase/migrations/`.

**Step 2: Write migration SQL**

Write the following into the newly created migration file (it will be the newest file in `supabase/migrations/` ending in `_add_tasks_and_assignees.sql`):

```sql
-- Assignees config table
create table if not exists "public"."assignees" (
  "name" text primary key,
  "display_name" text not null,
  "avatar_url" text
);

insert into "public"."assignees" ("name", "display_name") values
  ('aj', 'AJ'),
  ('bot', 'Bot')
on conflict ("name") do nothing;

-- Tasks table
create table if not exists "public"."tasks" (
  "id" uuid primary key default gen_random_uuid(),
  "title" text not null,
  "description" text,
  "status" text not null default 'todo'
    check ("status" in ('todo', 'in_progress', 'blocked', 'done')),
  "assignee" text references "public"."assignees"("name") on delete set null,
  "priority" text not null default 'medium'
    check ("priority" in ('low', 'medium', 'high', 'urgent')),
  "tags" text[] default '{}',
  "source" text not null default 'manual'
    check ("source" in ('manual', 'cron', 'telegram')),
  "cron_job_id" uuid references "public"."cron_jobs"("id") on delete set null,
  "position" text not null default '0',
  "metadata" jsonb default '{}',
  "archived" boolean not null default false,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "completed_at" timestamptz
);

create index if not exists idx_tasks_status on "public"."tasks"("status");
create index if not exists idx_tasks_assignee on "public"."tasks"("assignee");
create index if not exists idx_tasks_archived on "public"."tasks"("archived");

-- Auto-archive function: marks done tasks older than 7 days as archived
create or replace function "public"."archive_old_tasks"()
returns integer as $$
declare
  affected integer;
begin
  update "public"."tasks"
  set "archived" = true, "updated_at" = now()
  where "status" = 'done'
    and "completed_at" < now() - interval '7 days'
    and "archived" = false;
  get diagnostics affected = row_count;
  return affected;
end;
$$ language plpgsql;

-- Updated_at trigger
create or replace function "public"."tasks_updated_at"()
returns trigger as $$
begin
  new."updated_at" = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_set_updated_at
  before update on "public"."tasks"
  for each row
  execute function "public"."tasks_updated_at"();
```

**Step 3: Apply migration**

Run:
```bash
cd /home/h2/fast/ws/mission-control && npm run db:push
```
Expected: Migration applied successfully.

**Step 4: Verify**

Run:
```bash
cd /home/h2/fast/ws/mission-control && npm run db:list
```
Expected: The new migration shows as `applied`.

**Step 5: Commit**

```bash
cd /home/h2/fast/ws/mission-control && git add supabase/migrations/ && git commit -m "feat(db): add tasks and assignees tables with archive RPC"
```

---

### Task 3: TypeScript Types

**Files:**
- Modify: `src/types/index.ts` (append after line 47)

**Step 1: Add Task and Assignee interfaces**

Append to `src/types/index.ts`:

```typescript

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskSource = "manual" | "cron" | "telegram";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee: string | null;
  priority: TaskPriority;
  tags: string[];
  source: TaskSource;
  cronJobId: string | null;
  position: string;
  metadata: Record<string, unknown>;
  archived: boolean;
  createdAt: number; // epoch ms
  updatedAt: number;
  completedAt: number | null;
}

export interface Assignee {
  name: string;
  displayName: string;
  avatarUrl: string | null;
}
```

**Step 2: Commit**

```bash
cd /home/h2/fast/ws/mission-control && git add src/types/index.ts && git commit -m "feat: add Task and Assignee TypeScript types"
```

---

### Task 4: API Routes — GET & POST /api/tasks

**Files:**
- Create: `src/app/api/tasks/route.ts`

**Step 1: Write the failing test**

Add to `tests/smoke.spec.ts`:

```typescript
// === KANBAN TASKS TESTS ===

test("Tasks API GET returns valid JSON with tasks array", async ({ request }) => {
  const response = await request.get("/api/tasks");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data).toHaveProperty("tasks");
  expect(data).toHaveProperty("total");
  expect(Array.isArray(data.tasks)).toBe(true);
  expect(typeof data.total).toBe("number");
});

test("Tasks API GET returns Cache-Control no-cache header", async ({ request }) => {
  const response = await request.get("/api/tasks");
  expect(response.status()).toBe(200);
  const cacheControl = response.headers()["cache-control"];
  expect(cacheControl).toContain("no-cache");
  expect(cacheControl).toContain("no-store");
  expect(cacheControl).toContain("must-revalidate");
});

test("Tasks API POST creates a task and returns it", async ({ request }) => {
  const response = await request.post("/api/tasks", {
    data: { title: "Test task from Playwright", priority: "high" },
  });
  expect(response.status()).toBe(201);
  const data = await response.json();
  expect(data).toHaveProperty("task");
  expect(data.task.title).toBe("Test task from Playwright");
  expect(data.task.priority).toBe("high");
  expect(data.task.status).toBe("todo");
  expect(data.task.source).toBe("manual");

  // Cleanup: delete the task
  const delResponse = await request.delete(`/api/tasks/${data.task.id}`);
  expect(delResponse.status()).toBe(200);
});

test("Tasks API POST rejects missing title", async ({ request }) => {
  const response = await request.post("/api/tasks", {
    data: { description: "No title" },
  });
  expect(response.status()).toBe(400);
});

test("Tasks API GET filters by status", async ({ request }) => {
  // Create a task in 'blocked' status
  const createRes = await request.post("/api/tasks", {
    data: { title: "Blocked task", status: "blocked" },
  });
  const { task } = await createRes.json();

  const response = await request.get("/api/tasks?status=blocked");
  const data = await response.json();
  expect(data.tasks.every((t: any) => t.status === "blocked")).toBe(true);

  // Cleanup
  await request.delete(`/api/tasks/${task.id}`);
});

test("Tasks API GET excludes archived by default", async ({ request }) => {
  const response = await request.get("/api/tasks");
  const data = await response.json();
  expect(data.tasks.every((t: any) => t.archived === false)).toBe(true);
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
cd /home/h2/fast/ws/mission-control && npx playwright test -g "Tasks API" --reporter=list 2>&1 | tail -5
```
Expected: All tests FAIL (404 — route doesn't exist yet).

**Step 3: Implement GET & POST /api/tasks**

Create `src/app/api/tasks/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const CACHE_HEADERS = { "Cache-Control": "no-cache, no-store, must-revalidate" };

function rowToTask(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    status: row.status as string,
    assignee: (row.assignee as string) ?? null,
    priority: row.priority as string,
    tags: (row.tags as string[]) ?? [],
    source: row.source as string,
    cronJobId: (row.cron_job_id as string) ?? null,
    position: row.position as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    archived: row.archived as boolean,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
    completedAt: row.completed_at ? new Date(row.completed_at as string).getTime() : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const assignee = searchParams.get("assignee");
    const priority = searchParams.get("priority");
    const archived = searchParams.get("archived") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "200"), 500);
    const offset = parseInt(searchParams.get("offset") ?? "0");

    // Run archive cleanup on each read
    await supabase.rpc("archive_old_tasks");

    let query = supabase
      .from("tasks")
      .select("*", { count: "exact" })
      .eq("archived", archived)
      .order("position", { ascending: true })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (assignee !== null && searchParams.has("assignee")) {
      if (assignee === "") {
        query = query.is("assignee", null);
      } else {
        query = query.eq("assignee", assignee);
      }
    }
    if (priority) query = query.eq("priority", priority);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json(
      { tasks: (data ?? []).map(rowToTask), total: count ?? 0 },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500, headers: CACHE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();

    if (!body.title?.trim()) {
      return NextResponse.json(
        { error: "Missing required field: title" },
        { status: 400, headers: CACHE_HEADERS }
      );
    }

    const validStatuses = ["todo", "in_progress", "blocked", "done"];
    const validPriorities = ["low", "medium", "high", "urgent"];
    const validSources = ["manual", "cron", "telegram"];

    if (body.status && !validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400, headers: CACHE_HEADERS }
      );
    }
    if (body.priority && !validPriorities.includes(body.priority)) {
      return NextResponse.json(
        { error: `Invalid priority. Must be one of: ${validPriorities.join(", ")}` },
        { status: 400, headers: CACHE_HEADERS }
      );
    }
    if (body.source && !validSources.includes(body.source)) {
      return NextResponse.json(
        { error: `Invalid source. Must be one of: ${validSources.join(", ")}` },
        { status: 400, headers: CACHE_HEADERS }
      );
    }

    // Generate position: get the last position in the target status column
    const targetStatus = body.status ?? "todo";
    const { data: lastTask } = await supabase
      .from("tasks")
      .select("position")
      .eq("status", targetStatus)
      .eq("archived", false)
      .order("position", { ascending: false })
      .limit(1)
      .single();

    // Use fractional-indexing to generate a position after the last one
    const { generateKeyBetween } = await import("fractional-indexing");
    const newPosition = generateKeyBetween(lastTask?.position ?? null, null);

    const insertData: Record<string, unknown> = {
      title: body.title.trim(),
      description: body.description ?? null,
      status: targetStatus,
      assignee: body.assignee ?? null,
      priority: body.priority ?? "medium",
      tags: body.tags ?? [],
      source: body.source ?? "manual",
      cron_job_id: body.cron_job_id ?? null,
      position: newPosition,
      metadata: body.metadata ?? {},
    };

    if (targetStatus === "done") {
      insertData.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert(insertData)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json(
      { task: rowToTask(data) },
      { status: 201, headers: CACHE_HEADERS }
    );
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500, headers: CACHE_HEADERS }
    );
  }
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
cd /home/h2/fast/ws/mission-control && npm run build && cp .env.local .next/standalone/.env.local && kill $(ss -tlnp | grep 39151 | grep -oP 'pid=\K[0-9]+') ; sleep 6 && npx playwright test -g "Tasks API" --reporter=list
```
Expected: All tests PASS.

**Step 5: Commit**

```bash
cd /home/h2/fast/ws/mission-control && git add src/app/api/tasks/route.ts tests/smoke.spec.ts && git commit -m "feat: add GET/POST /api/tasks endpoints with tests"
```

---

### Task 5: API Routes — PATCH & DELETE /api/tasks/[id]

**Files:**
- Create: `src/app/api/tasks/[id]/route.ts`

**Step 1: Write the failing test**

Add to `tests/smoke.spec.ts`:

```typescript
test("Tasks API PATCH updates a task", async ({ request }) => {
  // Create
  const createRes = await request.post("/api/tasks", {
    data: { title: "Patch test task" },
  });
  const { task } = await createRes.json();

  // Patch
  const patchRes = await request.patch(`/api/tasks/${task.id}`, {
    data: { status: "in_progress", priority: "urgent" },
  });
  expect(patchRes.status()).toBe(200);
  const patched = await patchRes.json();
  expect(patched.task.status).toBe("in_progress");
  expect(patched.task.priority).toBe("urgent");

  // Cleanup
  await request.delete(`/api/tasks/${task.id}`);
});

test("Tasks API PATCH sets completed_at when status becomes done", async ({ request }) => {
  const createRes = await request.post("/api/tasks", {
    data: { title: "Complete me" },
  });
  const { task } = await createRes.json();

  const patchRes = await request.patch(`/api/tasks/${task.id}`, {
    data: { status: "done" },
  });
  const patched = await patchRes.json();
  expect(patched.task.completedAt).toBeTruthy();

  await request.delete(`/api/tasks/${task.id}`);
});

test("Tasks API DELETE removes a task", async ({ request }) => {
  const createRes = await request.post("/api/tasks", {
    data: { title: "Delete me" },
  });
  const { task } = await createRes.json();

  const delRes = await request.delete(`/api/tasks/${task.id}`);
  expect(delRes.status()).toBe(200);
  const body = await delRes.json();
  expect(body.success).toBe(true);

  // Verify it's gone
  const getRes = await request.get("/api/tasks");
  const data = await getRes.json();
  expect(data.tasks.find((t: any) => t.id === task.id)).toBeUndefined();
});

test("Tasks API PATCH returns 404 for non-existent task", async ({ request }) => {
  const response = await request.patch("/api/tasks/00000000-0000-0000-0000-000000000000", {
    data: { title: "Nope" },
  });
  expect(response.status()).toBe(404);
});

test("Tasks API DELETE returns 404 for non-existent task", async ({ request }) => {
  const response = await request.delete("/api/tasks/00000000-0000-0000-0000-000000000000");
  expect(response.status()).toBe(404);
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
cd /home/h2/fast/ws/mission-control && npx playwright test -g "Tasks API PATCH|Tasks API DELETE" --reporter=list 2>&1 | tail -5
```
Expected: FAIL (404 — route doesn't exist).

**Step 3: Implement PATCH & DELETE**

Create `src/app/api/tasks/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const CACHE_HEADERS = { "Cache-Control": "no-cache, no-store, must-revalidate" };

function rowToTask(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    status: row.status as string,
    assignee: (row.assignee as string) ?? null,
    priority: row.priority as string,
    tags: (row.tags as string[]) ?? [],
    source: row.source as string,
    cronJobId: (row.cron_job_id as string) ?? null,
    position: row.position as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    archived: row.archived as boolean,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
    completedAt: row.completed_at ? new Date(row.completed_at as string).getTime() : null,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();
    const body = await request.json();

    // Build update object from allowed fields
    const allowedFields: Record<string, string> = {
      title: "title",
      description: "description",
      status: "status",
      assignee: "assignee",
      priority: "priority",
      tags: "tags",
      position: "position",
      metadata: "metadata",
      archived: "archived",
    };

    const update: Record<string, unknown> = {};
    for (const [bodyKey, dbKey] of Object.entries(allowedFields)) {
      if (bodyKey in body) {
        update[dbKey] = body[bodyKey];
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400, headers: CACHE_HEADERS }
      );
    }

    // Auto-set completed_at when moving to done
    if (update.status === "done") {
      update.completed_at = new Date().toISOString();
    }
    // Clear completed_at when moving away from done
    if (update.status && update.status !== "done") {
      update.completed_at = null;
    }

    const { data, error } = await supabase
      .from("tasks")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Task not found" },
          { status: 404, headers: CACHE_HEADERS }
        );
      }
      throw error;
    }

    return NextResponse.json(
      { task: rowToTask(data) },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500, headers: CACHE_HEADERS }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    // Check existence first
    const { data: existing } = await supabase
      .from("tasks")
      .select("id")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404, headers: CACHE_HEADERS }
      );
    }

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json(
      { success: true },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500, headers: CACHE_HEADERS }
    );
  }
}
```

**Step 4: Build, restart, run tests**

Run:
```bash
cd /home/h2/fast/ws/mission-control && npm run build && cp .env.local .next/standalone/.env.local && kill $(ss -tlnp | grep 39151 | grep -oP 'pid=\K[0-9]+') ; sleep 6 && npx playwright test -g "Tasks API" --reporter=list
```
Expected: All Tasks API tests PASS.

**Step 5: Commit**

```bash
cd /home/h2/fast/ws/mission-control && git add src/app/api/tasks/ tests/smoke.spec.ts && git commit -m "feat: add PATCH/DELETE /api/tasks/[id] endpoints with tests"
```

---

### Task 6: KanbanSkeleton + Types Export

**Files:**
- Modify: `src/components/Skeletons.tsx` (append after `LogsSkeleton`)

**Step 1: Add KanbanSkeleton**

Append to `src/components/Skeletons.tsx` (before the final line, or at the end):

```typescript
/** Kanban Board: 4 columns with card placeholders */
export function KanbanSkeleton() {
  return (
    <div className="px-4 pt-4 space-y-4">
      {/* Filter bar */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer key={i} className="h-7 w-16 rounded-md" />
        ))}
      </div>
      {/* 4-column board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="rounded-lg border border-border/30 p-3 space-y-3">
            {/* Column header */}
            <div className="flex items-center justify-between">
              <ShimmerText width="w-20" height="h-4" />
              <Shimmer className="w-6 h-6 rounded-full" />
            </div>
            {/* Cards */}
            {Array.from({ length: 3 - (col % 2) }).map((_, card) => (
              <div key={card} className="rounded-lg border border-border/20 p-3 space-y-2 border-l-4 border-l-muted/40">
                <ShimmerText width="w-3/4" height="h-3.5" />
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    <Shimmer className="w-10 h-4 rounded" />
                    <Shimmer className="w-10 h-4 rounded" />
                  </div>
                  <Shimmer className="w-6 h-6 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
cd /home/h2/fast/ws/mission-control && git add src/components/Skeletons.tsx && git commit -m "feat: add KanbanSkeleton shimmer loader"
```

---

### Task 7: Wire Up Tasks Tab in page.tsx

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Add imports and dynamic import**

In `src/app/page.tsx`:

a) Add `KanbanSkeleton` to the Skeletons import (line 10-19):
```typescript
import {
  ActivitySkeleton,
  CalendarSkeleton,
  SearchSkeleton,
  AgentsSkeleton,
  AnalyticsSkeleton,
  HealthSkeleton,
  CronRunsSkeleton,
  LogsSkeleton,
  KanbanSkeleton,
} from "@/components/Skeletons";
```

b) Add dynamic import after `LogViewer` (after line 111):
```typescript
const KanbanBoard = dynamic(
  () => import("@/components/KanbanBoard").then((mod) => ({ default: mod.KanbanBoard })),
  { ssr: false, loading: () => <KanbanSkeleton /> }
);
```

c) Add `"tasks"` to `VALID_TABS` (line 36):
```typescript
const VALID_TABS = ["activity", "calendar", "search", "agents", "analytics", "health", "cron-runs", "logs", "tasks"] as const;
```

d) Add keyboard shortcut `9` (after line 165):
```typescript
      else if (e.key === "9") setActiveTab("tasks");
```

e) Change `sm:grid-cols-8` to `sm:grid-cols-9` in TabsList (line 185):
```typescript
      <TabsList className="flex w-full overflow-x-auto sm:grid sm:grid-cols-9 max-w-[640px] sm:max-w-4xl">
```

f) Add TabsTrigger after the Logs trigger (after line 221):
```typescript
        <TabsTrigger value="tasks" className="shrink-0 relative">
          <span className="hidden sm:inline mr-1 text-xs text-muted-foreground/50 font-mono">9</span>
          Tasks
          {notifications.blockedTasks > 0 && <TabCount count={notifications.blockedTasks} color="red" />}
        </TabsTrigger>
```

g) Add TabsContent after the Logs content (after line 270):
```typescript
      <TabsContent value="tasks" className="mt-6">
        <TabErrorBoundary fallbackLabel="Tasks">
          <KanbanBoard />
        </TabErrorBoundary>
      </TabsContent>
```

**Note:** The `KanbanBoard` component doesn't exist yet — it will be created in Task 9. For now, create a stub so the build doesn't fail.

**Step 2: Create stub KanbanBoard**

Create `src/components/KanbanBoard.tsx`:

```typescript
"use client";

export function KanbanBoard() {
  return (
    <div className="px-4 pt-4">
      <h2 className="text-lg font-semibold mb-4">Tasks</h2>
      <p className="text-muted-foreground">Kanban board loading...</p>
    </div>
  );
}
```

**Step 3: Update useTabNotifications**

In `src/hooks/useTabNotifications.ts`, add `blockedTasks: number` to the interface and fetch logic:

a) Update interface (line 5-9):
```typescript
export interface TabNotifications {
  health: "ok" | "warn" | "critical" | null;
  logs: number;
  cronRuns: number;
  blockedTasks: number;
}
```

b) Update initial state (line 16-20):
```typescript
  const [notifications, setNotifications] = useState<TabNotifications>({
    health: null,
    logs: 0,
    cronRuns: 0,
    blockedTasks: 0,
  });
```

c) Add tasks fetch at the end of the `fetch_` callback (before the catch, after the cron block ~line 55):
```typescript
      // Fetch blocked tasks count
      const tasksRes = await fetch("/api/tasks?status=blocked");
      if (tasksRes.ok) {
        const t = await tasksRes.json();
        setNotifications(prev => ({ ...prev, blockedTasks: t.total ?? 0 }));
      }
```

**Step 4: Write the failing test**

Add to `tests/smoke.spec.ts`:

```typescript
// === KANBAN TAB INTEGRATION TESTS ===

test("all 9 tabs are visible", async ({ page }) => {
  await page.goto("/");
  for (const tab of ["Activity", "Calendar", "Search", "Agents", "Analytics", "Health", "Runs", "Logs", "Tasks"]) {
    await expect(page.getByRole("tab", { name: new RegExp(tab) })).toBeVisible();
  }
});

test("Tasks tab loads via URL", async ({ page }) => {
  await page.goto("/?tab=tasks");
  const tasksTab = page.getByRole("tab", { name: /Tasks/ });
  await expect(tasksTab).toHaveAttribute("data-state", "active");
  const tabContent = page.getByRole("tabpanel");
  await expect(tabContent).toBeVisible();
});

test("Tasks tab keyboard shortcut 9 works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.keyboard.press("9");
  await expect(page.getByRole("tab", { name: /Tasks/ })).toHaveAttribute("data-state", "active");
});
```

**Important:** Also update the existing `"all 8 tabs are visible"` test (line 11-16) to check for 9 tabs, or rename/remove it since the new test supersedes it. Change it to:

```typescript
test("all 9 tabs are visible", async ({ page }) => {
  await page.goto("/");
  for (const tab of ["Activity", "Calendar", "Search", "Agents", "Analytics", "Health", "Runs", "Logs", "Tasks"]) {
    await expect(page.getByRole("tab", { name: new RegExp(tab) })).toBeVisible();
  }
});
```

(Replace the old "all 8 tabs" test with the "all 9 tabs" version — don't have both.)

**Step 5: Build, restart, run tests**

Run:
```bash
cd /home/h2/fast/ws/mission-control && npm run build && cp .env.local .next/standalone/.env.local && kill $(ss -tlnp | grep 39151 | grep -oP 'pid=\K[0-9]+') ; sleep 6 && npx playwright test -g "9 tabs|Tasks tab" --reporter=list
```
Expected: PASS.

**Step 6: Commit**

```bash
cd /home/h2/fast/ws/mission-control && git add src/app/page.tsx src/components/KanbanBoard.tsx src/components/Skeletons.tsx src/hooks/useTabNotifications.ts tests/smoke.spec.ts && git commit -m "feat: wire Tasks tab into dashboard (stub component)"
```

---

### Task 8: KanbanBoard — Full Implementation

**Files:**
- Modify: `src/components/KanbanBoard.tsx` (replace stub)

This is the largest task. The KanbanBoard component contains the DnD context, columns, cards, filters, and the detail sheet.

**Step 1: Implement KanbanBoard**

Replace `src/components/KanbanBoard.tsx` with the full implementation. The component should:

1. Use SWR to fetch `/api/tasks?archived=false` with 30s refresh
2. Group tasks by status into 4 columns: `todo`, `in_progress`, `blocked`, `done`
3. Render a filter bar (assignee toggles, priority filter)
4. Wrap columns in `DndContext` from @dnd-kit/core
5. Each column is a `useDroppable` zone
6. Each card is `useSortable` within its column
7. On drag end:
   - If column changed: PATCH task status + position
   - If just reordered: PATCH task position
   - Use `generateKeyBetween` from fractional-indexing for position
   - Optimistic update via SWR `mutate`
8. Quick-add input in "To Do" column header
9. Click card → open TaskDetailSheet (shadcn Sheet from right)
10. TaskDetailSheet: edit title, description, assignee, priority, tags; delete button

**Key implementation details:**

- Priority colors: `urgent` = `border-l-red-500`, `high` = `border-l-orange-500`, `medium` = `border-l-blue-500`, `low` = `border-l-gray-400`
- Column headers: "To Do" (gray), "In Progress" (blue), "Blocked" (amber), "Done" (emerald)
- Assignee selector fetches from `/api/tasks` response doesn't include assignees — fetch assignees from Supabase directly via a separate SWR call to a new endpoint, OR hardcode `aj`/`bot` for now and make it dynamic later. **Simplest: query the `assignees` table client-side via Supabase.** But since we chose API-only access, add a `GET /api/assignees` endpoint.
- Mobile: columns stack with `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`

**Step 2: Create GET /api/assignees endpoint**

Create `src/app/api/assignees/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("assignees")
      .select("*")
      .order("name");

    if (error) throw error;

    const assignees = (data ?? []).map((row) => ({
      name: row.name as string,
      displayName: row.display_name as string,
      avatarUrl: (row.avatar_url as string) ?? null,
    }));

    return NextResponse.json({ assignees });
  } catch (error) {
    console.error("Error fetching assignees:", error);
    return NextResponse.json({ error: "Failed to fetch assignees" }, { status: 500 });
  }
}
```

**Step 3: Implement the full KanbanBoard component**

The full `src/components/KanbanBoard.tsx` should be ~400-500 lines containing:
- `KanbanBoard` (main export) — SWR, DnD context, filters, columns
- `KanbanColumn` — droppable zone, header, card list, quick-add (inline, not separate file)
- `KanbanCard` — sortable draggable card (inline)
- `TaskDetailSheet` — Sheet with edit form (inline)

All in one file to keep things simple — split later if needed.

**Important patterns to follow:**
- Wrap component in `<Card className="h-full flex flex-col border-0 shadow-none bg-transparent">` (matches other tabs)
- Use `useSWR` with `refreshInterval: 30000`
- Use `mutate` for optimistic updates after create/update/delete
- Import icons from `lucide-react`: `Plus`, `GripVertical`, `Trash2`, `X`, `Filter`, `User`, `Tag`

**Step 4: Write the failing UI test**

Add to `tests/smoke.spec.ts`:

```typescript
test("Tasks tab shows Kanban board with 4 columns", async ({ page }) => {
  await page.goto("/?tab=tasks");
  await expect(page.getByText("Tasks")).toBeVisible({ timeout: 10000 });
  // Four column headers should appear
  await expect(page.getByText("To Do")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("In Progress")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Blocked")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Done")).toBeVisible({ timeout: 10000 });
});

test("Tasks tab quick-add creates a task", async ({ page }) => {
  await page.goto("/?tab=tasks");
  await expect(page.getByText("To Do")).toBeVisible({ timeout: 10000 });
  const input = page.getByPlaceholder("Add a task...");
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill("E2E test task");
  await input.press("Enter");
  await expect(page.getByText("E2E test task")).toBeVisible({ timeout: 5000 });
});

test("Tasks tab card click opens detail sheet", async ({ page }) => {
  await page.goto("/?tab=tasks");
  await expect(page.getByText("To Do")).toBeVisible({ timeout: 10000 });
  // Create a task if none exist
  const input = page.getByPlaceholder("Add a task...");
  await input.fill("Sheet test task");
  await input.press("Enter");
  await expect(page.getByText("Sheet test task")).toBeVisible({ timeout: 5000 });
  // Click the task card
  await page.getByText("Sheet test task").click();
  // Sheet should open with task details
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
});

test("command palette shows Tasks navigation item", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      metaKey: true,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
  });
  await expect(page.getByPlaceholder("Type a command or search...")).toBeVisible({ timeout: 5000 });
  await page.fill('input[placeholder="Type a command or search..."]', "tasks");
  await expect(page.getByText("Go to Tasks")).toBeVisible();
});
```

**Step 5: Add "Go to Tasks" in CommandPalette**

In `src/components/CommandPalette.tsx`, add a navigation entry for Tasks (following the pattern of existing entries). Add after the "Go to Log Viewer" entry:

```typescript
        {
          label: "Go to Tasks",
          action: () => setTab("tasks"),
          icon: <LayoutGrid className="h-4 w-4" />,
          keywords: ["tasks", "kanban", "board", "todo"],
        },
```

Import `LayoutGrid` from `lucide-react` at the top of the file.

**Step 6: Build, restart, run all tests**

Run:
```bash
cd /home/h2/fast/ws/mission-control && npm run build && cp .env.local .next/standalone/.env.local && kill $(ss -tlnp | grep 39151 | grep -oP 'pid=\K[0-9]+') ; sleep 6 && npx playwright test --reporter=list
```
Expected: All tests PASS (old 72 + new ~15 = ~87 tests).

**Step 7: Commit**

```bash
cd /home/h2/fast/ws/mission-control && git add src/components/KanbanBoard.tsx src/app/api/assignees/ src/components/CommandPalette.tsx tests/smoke.spec.ts && git commit -m "feat: implement full Kanban board with DnD, detail sheet, and quick-add"
```

---

### Task 9: Final Cleanup & Build Verification

**Step 1: Run the full test suite**

Run:
```bash
cd /home/h2/fast/ws/mission-control && npx playwright test --reporter=list
```
Expected: All tests PASS.

**Step 2: Clean up any test tasks left in the database**

Run:
```bash
cd /home/h2/fast/ws/mission-control && node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('tasks').delete().like('title', '%test%').then(r => console.log('Cleaned', r.count ?? 0, 'test tasks'));
"
```

**Step 3: Update CLAUDE.md**

Add "Tasks" to the tab list in CLAUDE.md:
- Update "8 tabs" references to "9 tabs"
- Add `KanbanBoard.tsx` to the components list
- Add `/api/tasks` and `/api/assignees` to the API endpoints section
- Add `tasks` and `assignees` tables to the data model section

**Step 4: Build and deploy**

Run:
```bash
cd /home/h2/fast/ws/mission-control && npm run build && cp .env.local .next/standalone/.env.local && kill $(ss -tlnp | grep 39151 | grep -oP 'pid=\K[0-9]+')
```
Systemd auto-restarts the server within 5s.

**Step 5: Commit**

```bash
cd /home/h2/fast/ws/mission-control && git add -A && git commit -m "feat: complete Kanban Tasks tab — board, API, tests, docs"
```

---

## Dependency Graph

```
Task 1 (deps) ──┐
Task 2 (db)  ───┤
Task 3 (types) ─┼──> Task 4 (GET/POST API) ──> Task 5 (PATCH/DELETE API)
                │                                        │
                └──> Task 6 (skeleton)                   │
                                  │                      │
                                  v                      v
                          Task 7 (page.tsx wiring) ──> Task 8 (full UI + tests)
                                                              │
                                                              v
                                                     Task 9 (cleanup & deploy)
```

Tasks 1, 2, 3 can run in parallel. Tasks 4-5 are sequential. Task 6 can run in parallel with 4-5. Task 7 depends on 6. Task 8 depends on 5 and 7. Task 9 depends on 8.
