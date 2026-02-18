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
