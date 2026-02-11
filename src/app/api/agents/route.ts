import { NextRequest, NextResponse } from "next/server";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const SESSIONS_DIR = join(
  process.env.HOME || "/home/h2",
  ".openclaw/agents/main/sessions"
);

// --- In-memory cache ---
interface CachedSession {
  meta: SessionMeta;
  mtimeMs: number;
  size: number;
}

const sessionCache = new Map<string, CachedSession>();
let cachedSortedList: SessionMeta[] | null = null;
let cacheVersion = 0;
let listETag = "";

interface JsonlEvent {
  type: string;
  id?: string;
  timestamp?: number;
  modelId?: string;
  provider?: string;
  message?: {
    role?: string;
    content?: any;
    model?: string;
    provider?: string;
    usage?: {
      totalTokens?: number;
      cost?: { total?: number };
    };
  };
  role?: string;
  content?: any;
  usage?: {
    totalTokens?: number;
    cost?: { total?: number };
  };
}

interface SessionMeta {
  id: string;
  timestamp?: number;
  model: string;
  provider: string;
  messageCount: number;
  toolCallCount: number;
  prompt: string;
  totalCost: number;
  totalTokens: number;
  lastActivity?: number;
  file?: string;
  fileSize?: number;
  modifiedAt?: string;
}

interface TimelineItem {
  timestamp?: number;
  role: string;
  text: string;
  tools: Array<{ name: string; arguments: string }>;
  thinking: string;
  usage: { tokens?: number; cost?: number } | null;
}

interface SessionDetail extends SessionMeta {
  timeline: TimelineItem[];
}

function parseJsonl(filePath: string): JsonlEvent[] {
  try {
    const content = readFileSync(filePath, "utf-8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as JsonlEvent[];
  } catch {
    return [];
  }
}

function getSessionMeta(events: JsonlEvent[], promptLimit = 2000): SessionMeta {
  const session = events.find((e) => e.type === "session");
  const modelChange = events.findLast((e) => e.type === "model_change");
  const messages = events.filter((e) => e.type === "message");

  // Fallback: extract model from assistant messages if no model_change event
  let modelFromMessages = "unknown";
  let providerFromMessages = "unknown";
  if (!modelChange) {
    for (const msg of messages) {
      const m = (msg as any).message || msg;
      if ((m as any).role === "assistant" && (m as any).model && (m as any).model !== "delivery-mirror") {
        modelFromMessages = (m as any).model;
        providerFromMessages = (m as any).provider || "unknown";
        break;
      }
    }
  }
  const userMsg = messages.find(
    (e) => e.message?.role === "user" || e.role === "user"
  );
  const lastMsg = messages[messages.length - 1];
  const toolCalls = messages.filter((e) => {
    const content = e.message?.content || e.content || [];
    return (
      Array.isArray(content) &&
      content.some((c: any) => c.type === "toolCall" || c.type === "tool_use")
    );
  });

  // Extract prompt text
  let prompt = "";
  if (userMsg) {
    const content = userMsg.message?.content || userMsg.content || [];
    if (typeof content === "string") prompt = content;
    else if (Array.isArray(content)) {
      const textBlock = content.find((c: any) => c.type === "text");
      if (textBlock) prompt = textBlock.text;
    }
  }

  // Extract cost info from assistant messages
  let totalCost = 0;
  let totalTokens = 0;
  for (const msg of messages) {
    const m = msg.message || msg;
    if (m.usage?.cost?.total) totalCost += m.usage.cost.total;
    if (m.usage?.totalTokens) totalTokens += m.usage.totalTokens;
  }

  return {
    id: session?.id || "unknown",
    timestamp: session?.timestamp,
    model: modelChange?.modelId || modelFromMessages,
    provider: modelChange?.provider || providerFromMessages,
    messageCount: messages.length,
    toolCallCount: toolCalls.length,
    prompt: prompt.slice(0, promptLimit),
    totalCost: Math.round(totalCost * 1000000) / 1000000,
    totalTokens,
    lastActivity: lastMsg?.timestamp,
  };
}

function getSessionDetail(events: JsonlEvent[]): SessionDetail {
  const meta = getSessionMeta(events);
  const messages = events.filter((e) => e.type === "message");

  const timeline = messages.map((e): TimelineItem => {
    const m = e.message || e;
    const content = m.content || [];
    const role = m.role || "unknown";

    let text = "";
    let tools: Array<{ name: string; arguments: string }> = [];
    let thinking = "";

    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "text") text += block.text;
        if (block.type === "toolCall" || block.type === "tool_use") {
          tools.push({
            name: block.name,
            arguments:
              typeof block.arguments === "string"
                ? block.arguments.slice(0, 500)
                : JSON.stringify(block.arguments || block.input || {}).slice(
                    0,
                    500
                  ),
          });
        }
        if (block.type === "toolResult" || block.type === "tool_result") {
          const resultContent = block.content || block.result || "";
          text += `[Tool Result: ${
            typeof resultContent === "string"
              ? resultContent.slice(0, 300)
              : JSON.stringify(resultContent).slice(0, 300)
          }]\n`;
        }
        if (block.type === "thinking") {
          thinking = (block.thinking || "").slice(0, 1000);
        }
      }
    }

    return {
      timestamp: e.timestamp,
      role,
      text: text.slice(0, 3000),
      tools,
      thinking,
      usage: m.usage
        ? {
            tokens: m.usage.totalTokens,
            cost: m.usage.cost?.total,
          }
        : null,
    };
  });

  return { ...meta, timeline };
}

function listSessionsCached(limit: number): { sessions: SessionMeta[]; etag: string } {
  try {
    const files = readdirSync(SESSIONS_DIR).filter((f) =>
      f.endsWith(".jsonl")
    );
    const currentFiles = new Set(files);
    let changed = false;

    // Remove cache entries for deleted files
    for (const key of sessionCache.keys()) {
      if (!currentFiles.has(key)) {
        sessionCache.delete(key);
        changed = true;
      }
    }

    // Check each file — only re-parse if mtime/size changed
    for (const file of files) {
      const filePath = join(SESSIONS_DIR, file);
      let stat;
      try {
        stat = statSync(filePath);
      } catch {
        continue;
      }

      const cached = sessionCache.get(file);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        continue; // cache hit
      }

      // Cache miss — parse this file
      const events = parseJsonl(filePath);
      if (events.length === 0) {
        if (cached) {
          sessionCache.delete(file);
          changed = true;
        }
        continue;
      }

      const meta = getSessionMeta(events, 200);
      sessionCache.set(file, {
        meta: {
          ...meta,
          file,
          fileSize: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        },
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      });
      changed = true;
    }

    // Rebuild sorted list only when cache changed
    if (changed || !cachedSortedList) {
      const all = Array.from(sessionCache.values()).map((c) => c.meta);
      all.sort(
        (a, b) =>
          new Date(b.modifiedAt!).getTime() - new Date(a.modifiedAt!).getTime()
      );
      cachedSortedList = all;
      cacheVersion++;
      listETag = `W/"v${cacheVersion}-${all.length}"`;
    }

    return {
      sessions: cachedSortedList.slice(0, limit),
      etag: listETag,
    };
  } catch (e: any) {
    return { sessions: [], etag: "" };
  }
}

function getSession(sessionId: string): SessionDetail | { error: string } {
  const file = `${sessionId}.jsonl`;
  const filePath = join(SESSIONS_DIR, file);
  try {
    const events = parseJsonl(filePath);
    return getSessionDetail(events);
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const id = searchParams.get("id");

  if (action === "list") {
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1),
      500
    );

    const { sessions, etag } = listSessionsCached(limit);

    // ETag / 304 support
    const ifNoneMatch = request.headers.get("if-none-match");
    if (etag && ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag },
      });
    }

    return NextResponse.json(sessions, {
      headers: {
        ETag: etag,
        "Cache-Control": "no-cache",
      },
    });
  }

  if (action === "detail" && id) {
    const detail = getSession(id);
    return NextResponse.json(detail);
  }

  return NextResponse.json({ error: "Invalid action or missing parameters" }, { status: 400 });
}
