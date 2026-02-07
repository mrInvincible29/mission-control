import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import * as fs from "fs/promises";
import * as path from "path";

function getConvexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  return new ConvexHttpClient(url);
}

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
  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json(
      { error: "Convex not configured. Set NEXT_PUBLIC_CONVEX_URL in .env.local" },
      { status: 503 }
    );
  }

  try {
    const indexedFiles: string[] = [];
    const errors: string[] = [];
    
    // Index specific files
    for (const fileName of FILES_TO_INDEX) {
      const filePath = path.join(WORKSPACE_PATH, fileName);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const stats = await fs.stat(filePath);
        
        await convex.mutation(api.documents.upsertDocument, {
          filePath,
          fileName,
          content: content.slice(0, 50000), // Limit content size
          size: stats.size,
        });
        
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
          
          await convex.mutation(api.documents.upsertDocument, {
            filePath,
            fileName,
            content: content.slice(0, 50000),
            size: stats.size,
          });
          
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
      
      // Check for scheduled tasks / heartbeat
      if (config.agents?.defaults?.heartbeat) {
        const hb = config.agents.defaults.heartbeat;
        await convex.mutation(api.cronJobs.upsert, {
          name: "Heartbeat",
          schedule: `Every ${hb.every}`,
          command: `Model: ${hb.model}, Target: ${hb.target}`,
          enabled: true,
        });
      }
      
      // Check for cron entries
      if (config.cron) {
        for (const [name, cronConfig] of Object.entries(config.cron as Record<string, unknown>)) {
          const cc = cronConfig as Record<string, unknown>;
          await convex.mutation(api.cronJobs.upsert, {
            name,
            schedule: (cc.schedule as string) || (cc.every as string) || "Unknown",
            command: (cc.command as string) || (cc.action as string) || JSON.stringify(cc),
            enabled: cc.enabled !== false,
          });
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

interface IndexedDoc {
  filePath: string;
  size: number;
  lastIndexed: number;
}

export async function GET() {
  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json(
      { error: "Convex not configured. Set NEXT_PUBLIC_CONVEX_URL in .env.local" },
      { status: 503 }
    );
  }

  try {
    const docs: IndexedDoc[] = await convex.query(api.documents.listAll, {});
    return NextResponse.json({
      count: docs.length,
      files: docs.map((d: IndexedDoc) => ({
        path: d.filePath,
        size: d.size,
        lastIndexed: d.lastIndexed,
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
