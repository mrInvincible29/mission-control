import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST() {
  try {
    const { stdout, stderr } = await execAsync(
      "/fast/dev/nvm/versions/node/v25.2.1/bin/node scripts/sync-cron-data.mjs",
      {
        timeout: 30000,
        env: {
          ...process.env,
          PATH: process.env.PATH,
          SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
          HOME: process.env.HOME || "/home/h2",
        },
        cwd: "/home/h2/fast/ws/mission-control",
      }
    );

    return NextResponse.json({
      success: true,
      output: stdout.trim(),
      errors: stderr?.trim() || undefined,
    });
  } catch (error) {
    const err = error as { stderr?: string; message?: string; stdout?: string };
    console.error("Sync error:", err);
    return NextResponse.json(
      {
        error: err.message || "Sync failed",
        output: err.stdout?.trim(),
        stderr: err.stderr?.trim(),
      },
      { status: 500 }
    );
  }
}
