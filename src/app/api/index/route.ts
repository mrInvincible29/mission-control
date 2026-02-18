import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import * as fs from "fs/promises";
import * as path from "path";

const WORKSPACE_PATH = process.env.WORKSPACE_PATH || "/home/h2/clawd";
const FILES_TO_INDEX = [
  "MEMORY.md",
  "TOOLS.md",
  "AGENTS.md",
  "USER.md",
  "SOUL.md",
];

async function getFilesRecursively(dir: string, pattern: RegExp): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const subFiles = await getFilesRecursively(fullPath, pattern);
        files.push(...subFiles);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }

  return files;
}

export async function POST(_request: NextRequest) {
  const supabase = createServerClient();

  try {
    const indexedFiles: string[] = [];
    const errors: string[] = [];

    // Index specific files
    for (const fileName of FILES_TO_INDEX) {
      const filePath = path.join(WORKSPACE_PATH, fileName);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const stats = await fs.stat(filePath);

        const { error } = await supabase
          .from("indexed_documents")
          .upsert(
            {
              file_path: filePath,
              file_name: fileName,
              content: content.slice(0, 50000),
              last_indexed: new Date().toISOString(),
              size: stats.size,
            },
            { onConflict: "file_path" }
          );

        if (error) throw error;
        indexedFiles.push(filePath);
      } catch {
        // File might not exist, skip silently
      }
    }

    // Index memory/*.md files
    const memoryDir = path.join(WORKSPACE_PATH, "memory");
    try {
      const memoryFiles = await getFilesRecursively(memoryDir, /\.md$/);

      for (const filePath of memoryFiles) {
        try {
          const content = await fs.readFile(filePath, "utf-8");
          const stats = await fs.stat(filePath);
          const fileName = path.basename(filePath);

          const { error } = await supabase
            .from("indexed_documents")
            .upsert(
              {
                file_path: filePath,
                file_name: fileName,
                content: content.slice(0, 50000),
                last_indexed: new Date().toISOString(),
                size: stats.size,
              },
              { onConflict: "file_path" }
            );

          if (error) throw error;
          indexedFiles.push(filePath);
        } catch {
          errors.push(`Failed to index ${filePath}`);
        }
      }
    } catch {
      // Memory directory might not exist
    }

    // Index cron jobs from openclaw.json
    try {
      const openclawConfig = await fs.readFile(
        path.join(process.env.HOME || "/home/h2", ".openclaw/openclaw.json"),
        "utf-8"
      );
      const config = JSON.parse(openclawConfig);

      if (config.agents?.defaults?.heartbeat) {
        const hb = config.agents.defaults.heartbeat;
        await supabase
          .from("cron_jobs")
          .upsert(
            {
              name: "Heartbeat",
              schedule: `Every ${hb.every}`,
              command: `Model: ${hb.model}, Target: ${hb.target}`,
              enabled: true,
            },
            { onConflict: "name" }
          );
      }

      if (config.cron) {
        for (const [name, cronConfig] of Object.entries(config.cron as Record<string, unknown>)) {
          const cc = cronConfig as Record<string, unknown>;
          await supabase
            .from("cron_jobs")
            .upsert(
              {
                name,
                schedule: (cc.schedule as string) || (cc.every as string) || "Unknown",
                command: (cc.command as string) || (cc.action as string) || JSON.stringify(cc),
                enabled: cc.enabled !== false,
              },
              { onConflict: "name" }
            );
        }
      }
    } catch (error) {
      console.error("Error indexing cron jobs:", error);
    }

    return NextResponse.json({
      success: true,
      indexed: indexedFiles.length,
      files: indexedFiles,
      errors,
    });
  } catch (error) {
    console.error("Error indexing files:", error);
    return NextResponse.json(
      { error: "Failed to index files" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from("indexed_documents")
      .select("id, file_path, file_name, last_indexed, size");

    if (error) throw error;

    return NextResponse.json({
      count: (data ?? []).length,
      files: (data ?? []).map((d) => ({
        path: d.file_path,
        size: d.size,
        lastIndexed: new Date(d.last_indexed).getTime(),
      })),
    });
  } catch (error) {
    console.error("Error fetching indexed files:", error);
    return NextResponse.json(
      { error: "Failed to fetch indexed files" },
      { status: 500 }
    );
  }
}
