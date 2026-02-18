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
