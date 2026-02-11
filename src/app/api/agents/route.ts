import { NextRequest, NextResponse } from "next/server";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const SESSIONS_DIR = join(
  process.env.HOME || "/home/h2",
  ".openclaw/agents/main/sessions"
);

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

function getSessionMeta(events: JsonlEvent[]): SessionMeta {
  const session = events.find((e) => e.type === "session");
  const modelChange = events.findLast((e) => e.type === "model_change");
  const messages = events.filter((e) => e.type === "message");

  // Fallback: extract model from assistant messages if no model_change event
  let modelFromMessages = "unknown";
  let providerFromMessages = "unknown";
  if (!modelChange) {
    for (const msg of messages) {
      const m = msg.message || msg;
      if (m.role === "assistant" && m.model && m.model !== "delivery-mirror") {
        modelFromMessages = m.model;
        providerFromMessages = m.provider || "unknown";
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
    prompt: prompt.slice(0, 2000),
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

function listSessions(): SessionMeta[] {
  try {
    const files = readdirSync(SESSIONS_DIR).filter((f) =>
      f.endsWith(".jsonl")
    );
    const sessions: SessionMeta[] = [];

    for (const file of files) {
      const filePath = join(SESSIONS_DIR, file);
      const stat = statSync(filePath);
      const events = parseJsonl(filePath);
      if (events.length === 0) continue;

      const meta = getSessionMeta(events);
      sessions.push({
        ...meta,
        file,
        fileSize: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }

    // Sort by modification time, newest first
    sessions.sort(
      (a, b) =>
        new Date(b.modifiedAt!).getTime() - new Date(a.modifiedAt!).getTime()
    );
    return sessions;
  } catch (e: any) {
    return [];
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
    const sessions = listSessions();
    return NextResponse.json(sessions);
  }

  if (action === "detail" && id) {
    const detail = getSession(id);
    return NextResponse.json(detail);
  }

  return NextResponse.json({ error: "Invalid action or missing parameters" }, { status: 400 });
}
