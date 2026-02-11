import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || "";
const OPENCLAW_URL = process.env.OPENCLAW_URL || "ws://127.0.0.1:18789";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      scheduleType, // "once" | "cron" | "every"
      scheduleValue, // ISO date, cron expr, or duration string
      timezone,
      model,
      sessionTarget, // "main" | "isolated"
      prompt,
      thinking,
      announce,
      enabled,
    } = body;

    if (!name || !scheduleType || !scheduleValue || !prompt) {
      return NextResponse.json(
        { error: "Missing required fields: name, scheduleType, scheduleValue, prompt" },
        { status: 400 }
      );
    }

    // Build the openclaw cron add command
    const args: string[] = ["openclaw", "cron", "add"];

    args.push("--name", name);

    // Schedule
    switch (scheduleType) {
      case "once":
        args.push("--at", scheduleValue);
        break;
      case "cron":
        args.push("--cron", scheduleValue);
        if (timezone) args.push("--tz", timezone);
        break;
      case "every":
        args.push("--every", scheduleValue);
        break;
      default:
        return NextResponse.json({ error: "Invalid scheduleType" }, { status: 400 });
    }

    // Session target & payload
    if (sessionTarget === "main") {
      args.push("--session", "main");
      args.push("--system-event", prompt);
    } else {
      args.push("--session", "isolated");
      args.push("--message", prompt);
      if (announce !== false) {
        args.push("--announce");
      }
    }

    // Model
    if (model) {
      args.push("--model", model);
    }

    // Thinking
    if (thinking) {
      args.push("--thinking", thinking);
    }

    // Enabled state
    if (enabled === false) {
      args.push("--disabled");
    }

    // Auth
    if (OPENCLAW_TOKEN) {
      args.push("--token", OPENCLAW_TOKEN);
    }
    if (OPENCLAW_URL) {
      args.push("--url", OPENCLAW_URL);
    }

    args.push("--json");

    // Shell-escape each argument
    const cmd = args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" ");

    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 15000,
      env: { ...process.env, PATH: process.env.PATH },
    });

    // Try to parse JSON output
    let result;
    try {
      result = JSON.parse(stdout.trim());
    } catch {
      result = { raw: stdout.trim(), stderr: stderr?.trim() };
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    console.error("Cron creation error:", err);
    return NextResponse.json(
      { error: err.stderr || err.message || "Failed to create cron job" },
      { status: 500 }
    );
  }
}

// List cron jobs
export async function GET() {
  try {
    const args = ["openclaw", "cron", "list", "--json"];
    if (OPENCLAW_TOKEN) args.push("--token", OPENCLAW_TOKEN);
    if (OPENCLAW_URL) args.push("--url", OPENCLAW_URL);

    const cmd = args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
    const { stdout } = await execAsync(cmd, {
      timeout: 10000,
      env: { ...process.env, PATH: process.env.PATH },
    });

    let result;
    try {
      result = JSON.parse(stdout.trim());
    } catch {
      result = { raw: stdout.trim() };
    }

    return NextResponse.json({ success: true, jobs: result });
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    return NextResponse.json(
      { error: err.stderr || err.message || "Failed to list cron jobs" },
      { status: 500 }
    );
  }
}
