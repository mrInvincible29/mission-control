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
