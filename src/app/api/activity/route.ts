import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

function getConvexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  return new ConvexHttpClient(url);
}

export async function POST(request: NextRequest) {
  try {
    const convex = getConvexClient();
    if (!convex) {
      return NextResponse.json(
        { error: "Convex not configured. Set NEXT_PUBLIC_CONVEX_URL in .env.local" },
        { status: 503 }
      );
    }

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
    
    const activityId = await convex.mutation(api.activities.create, {
      actionType,
      description,
      status,
      metadata,
    });
    
    return NextResponse.json({ success: true, id: activityId });
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
    const convex = getConvexClient();
    if (!convex) {
      return NextResponse.json(
        { error: "Convex not configured. Set NEXT_PUBLIC_CONVEX_URL in .env.local" },
        { status: 503 }
      );
    }

    const activities = await convex.query(api.activities.list, { limit: 100 });
    return NextResponse.json(activities);
  } catch (error) {
    console.error("Error fetching activities:", error);
    return NextResponse.json(
      { error: "Failed to fetch activities" },
      { status: 500 }
    );
  }
}
