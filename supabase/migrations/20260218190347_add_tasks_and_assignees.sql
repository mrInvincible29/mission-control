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
