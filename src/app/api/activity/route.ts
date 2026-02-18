import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    const body = await request.json();

    const { actionType, description, status, metadata } = body;

    if (!actionType || !description || !status) {
      return NextResponse.json(
        { error: "Missing required fields: actionType, description, status" },
        { status: 400 }
      );
    }

    if (!["success", "error", "pending"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be: success, error, or pending" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("activities")
      .insert({
        action_type: actionType,
        category: body.category ?? "system",
        description,
        timestamp: body.timestamp
          ? new Date(body.timestamp).toISOString()
          : new Date().toISOString(),
        status,
        metadata: metadata ?? null,
      })
      .select("id")
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, id: data.id });
  } catch (error) {
    console.error("Error creating activity:", error);
    return NextResponse.json(
      { error: "Failed to create activity" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(100);

    if (error) throw error;

    // Map snake_case to camelCase for API consumers
    const activities = (data ?? []).map((row) => ({
      id: row.id,
      actionType: row.action_type,
      category: row.category,
      description: row.description,
      timestamp: new Date(row.timestamp).getTime(),
      status: row.status,
      metadata: row.metadata,
    }));

    return NextResponse.json(activities);
  } catch (error) {
    console.error("Error fetching activities:", error);
    return NextResponse.json(
      { error: "Failed to fetch activities" },
      { status: 500 }
    );
  }
}
