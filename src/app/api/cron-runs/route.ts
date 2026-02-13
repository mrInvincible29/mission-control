import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";

const RUNS_DIR = join(process.env.HOME || "/home/h2", ".openclaw/cron/runs");
const JOBS_FILE = join(process.env.HOME || "/home/h2", ".openclaw/cron/jobs.json");

interface CronRun {
  ts: number;
  jobId: string;
  jobName?: string;
  action: string;
  status: string;
  summary?: string;
  sessionId?: string;
  sessionKey?: string;
  runAtMs?: number;
  durationMs?: number;
  nextRunAtMs?: number;
}

interface JobInfo {
  id: string;
  name: string;
  model?: string;
  enabled?: boolean;
  schedule?: { kind: string; expr?: string; tz?: string };
}

// Cache jobs.json for 30s
let jobsCache: { data: Record<string, JobInfo>; ts: number } | null = null;

async function getJobsMap(): Promise<Record<string, JobInfo>> {
  const now = Date.now();
  if (jobsCache && now - jobsCache.ts < 30000) return jobsCache.data;

  try {
    const raw = await readFile(JOBS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    const jobs: JobInfo[] = parsed.jobs || parsed;
    const map: Record<string, JobInfo> = {};
    for (const j of jobs) {
      map[j.id] = {
        id: j.id,
        name: j.name,
        model: (j as any).payload?.model,
        enabled: j.enabled,
        schedule: j.schedule,
      };
    }
    jobsCache = { data: map, ts: now };
    return map;
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobFilter = searchParams.get("jobId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
    const statusFilter = searchParams.get("status"); // "ok" | "error"

    const jobsMap = await getJobsMap();

    // Read all run files
    let files: string[];
    try {
      files = await readdir(RUNS_DIR);
    } catch {
      return NextResponse.json({ runs: [], jobs: Object.values(jobsMap) });
    }

    files = files.filter((f) => f.endsWith(".jsonl"));

    // If filtering by jobId, only read that file
    if (jobFilter) {
      files = files.filter((f) => f.startsWith(jobFilter));
    }

    const allRuns: CronRun[] = [];

    for (const file of files) {
      try {
        const content = await readFile(join(RUNS_DIR, file), "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);

        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as CronRun;
            // Enrich with job name
            const jobInfo = jobsMap[entry.jobId];
            if (jobInfo) {
              entry.jobName = jobInfo.name;
            }
            // Apply status filter
            if (statusFilter && entry.status !== statusFilter) continue;

            allRuns.push(entry);
          } catch {
            // Skip malformed lines
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    // Sort by timestamp descending (most recent first)
    allRuns.sort((a, b) => b.ts - a.ts);

    // Apply limit
    const runs = allRuns.slice(0, limit);

    // Build job list with run stats
    const jobStats: Record<string, { total: number; ok: number; error: number; avgDuration: number; lastRun: number }> = {};
    for (const run of allRuns) {
      if (!jobStats[run.jobId]) {
        jobStats[run.jobId] = { total: 0, ok: 0, error: 0, avgDuration: 0, lastRun: 0 };
      }
      const s = jobStats[run.jobId];
      s.total++;
      if (run.status === "ok") s.ok++;
      else s.error++;
      if (run.durationMs) s.avgDuration += run.durationMs;
      if (run.ts > s.lastRun) s.lastRun = run.ts;
    }

    // Compute averages
    for (const id of Object.keys(jobStats)) {
      const s = jobStats[id];
      if (s.total > 0) s.avgDuration = Math.round(s.avgDuration / s.total);
    }

    // Build enriched jobs list
    const jobs = Object.values(jobsMap).map((j) => ({
      ...j,
      stats: jobStats[j.id] || { total: 0, ok: 0, error: 0, avgDuration: 0, lastRun: 0 },
    }));

    return NextResponse.json({
      runs,
      jobs,
      totalRuns: allRuns.length,
    });
  } catch (error) {
    console.error("Cron runs error:", error);
    return NextResponse.json(
      { error: "Failed to read cron run history" },
      { status: 500 }
    );
  }
}
