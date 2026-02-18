import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import * as fs from "fs";

interface LogSource {
  id: string;
  name: string;
  type: "systemd" | "systemd-user" | "file";
  unit?: string;
  filePath?: string;
  description: string;
}

// All source IDs and unit names are hardcoded — no user input reaches execSync
const LOG_SOURCES: LogSource[] = [
  { id: "mission-control", name: "Mission Control", type: "systemd", unit: "mission-control", description: "Dashboard server" },
  { id: "mc-file-watcher", name: "File Watcher", type: "systemd", unit: "mc-file-watcher", description: "Supabase document indexer" },
  { id: "mc-activity-sync", name: "Activity Sync", type: "systemd-user", unit: "mc-activity-sync", description: "OpenClaw log parser" },
  { id: "docker", name: "Docker", type: "systemd", unit: "docker", description: "Container runtime" },
  { id: "nginx", name: "Nginx", type: "systemd", unit: "nginx", description: "Web server" },
  { id: "companion", name: "Companion", type: "systemd", unit: "companion", description: "Claude Code Web UI" },
  { id: "openclaw-today", name: "OpenClaw (today)", type: "file", description: "Today's OpenClaw log" },
];

const VALID_SOURCE_IDS = new Set(LOG_SOURCES.map(s => s.id));

function getSystemdLogs(unit: string, lines: number): string[] {
  try {
    const output = execSync(
      `journalctl -u ${unit} --no-pager -n ${lines} --output=short-iso`,
      { timeout: 5000 }
    ).toString();
    return output.split("\n").filter(l => l.trim());
  } catch {
    return [];
  }
}

function getUserSystemdLogs(unit: string, lines: number): string[] {
  try {
    const output = execSync(
      `journalctl --user -u ${unit} --no-pager -n ${lines} --output=short-iso`,
      { timeout: 5000 }
    ).toString();
    return output.split("\n").filter(l => l.trim());
  } catch {
    return [];
  }
}

function getFileLogs(filePath: string, lines: number): string[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const output = execSync(`tail -n ${lines} "${filePath}"`, { timeout: 5000 }).toString();
    return output.split("\n").filter(l => l.trim());
  } catch {
    return [];
  }
}

function detectLevel(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("error") || lower.includes("fatal") || lower.includes("panic")) return "error";
  if (lower.includes("warn")) return "warn";
  if (lower.includes("debug") || lower.includes("trace")) return "debug";
  return "info";
}

function parseLogLine(raw: string): { timestamp: string; level: string; message: string } {
  // ISO systemd format: "2026-02-14T05:14:35+0000 hostname unit[pid]: message"
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2}T[\d:]+[+-]\d{4})\s+\S+\s+\S+\[\d+\]:\s*(.*)$/);
  if (isoMatch) {
    return { timestamp: isoMatch[1], level: detectLevel(isoMatch[2]), message: isoMatch[2] };
  }

  // Short systemd format: "Feb 14 05:14:35 hostname unit[pid]: message"
  const shortMatch = raw.match(/^(\w{3}\s+\d+\s+[\d:]+)\s+\S+\s+\S+\[\d+\]:\s*(.*)$/);
  if (shortMatch) {
    return { timestamp: shortMatch[1], level: detectLevel(shortMatch[2]), message: shortMatch[2] };
  }

  // JSON log lines (OpenClaw)
  try {
    const parsed = JSON.parse(raw);
    if (parsed.timestamp || parsed.ts || parsed.time) {
      const ts = parsed.timestamp || parsed.ts || parsed.time;
      const msg = parsed.message || parsed.msg || parsed.text || JSON.stringify(parsed);
      const level = parsed.level || parsed.severity || detectLevel(String(msg));
      return { timestamp: String(ts), level: String(level), message: String(msg) };
    }
  } catch { /* not JSON */ }

  return { timestamp: "", level: detectLevel(raw), message: raw };
}

function getLatestOpenClawLog(): string | null {
  const dir = '/tmp/openclaw';
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('openclaw-') && f.endsWith('.log'))
      .map(f => ({ path: `${dir}/${f}`, mtime: fs.statSync(`${dir}/${f}`).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files[0]?.path || null;
  } catch { return null; }
}

// GET /api/logs?source=mission-control&lines=100
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get("source");
    const lines = Math.min(Math.max(parseInt(searchParams.get("lines") || "100") || 100, 1), 500);

    // If no source specified, return available log sources
    if (!sourceId) {
      const latestLog = getLatestOpenClawLog();
      const sources = LOG_SOURCES.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        description: s.description,
        available: s.type === "file" ? latestLog !== null : true,
      }));

      return NextResponse.json({ sources }, {
        headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
      });
    }

    // Validate source ID against whitelist
    if (!VALID_SOURCE_IDS.has(sourceId)) {
      return NextResponse.json(
        { error: `Unknown log source: ${sourceId}` },
        { status: 400 }
      );
    }

    const source = LOG_SOURCES.find(s => s.id === sourceId)!;
    let rawLines: string[] = [];

    switch (source.type) {
      case "systemd":
        rawLines = getSystemdLogs(source.unit!, lines);
        break;
      case "systemd-user":
        rawLines = getUserSystemdLogs(source.unit!, lines);
        break;
      case "file": {
        const logPath = getLatestOpenClawLog();
        if (logPath) rawLines = getFileLogs(logPath, lines);
        break;
      }
    }

    const entries = rawLines.map(parseLogLine);

    return NextResponse.json({
      source: sourceId,
      entries,
      count: entries.length,
      timestamp: Date.now(),
    }, {
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch logs" },
      { status: 500, headers: { "Cache-Control": "no-cache, no-store, must-revalidate" } }
    );
  }
}
