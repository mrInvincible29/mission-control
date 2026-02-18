import type { DiagnosticEventPayload, OpenClawPluginService } from "openclaw/plugin-sdk";
import { onDiagnosticEvent } from "openclaw/plugin-sdk";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Categories for filtering
type ActivityCategory = "important" | "model" | "message" | "system" | "noise";

interface ActivityPayload {
  actionType: string;
  category: ActivityCategory;
  description: string;
  timestamp: number;
  status: "success" | "error" | "pending";
  metadata: {
    tool?: string;
    session?: string;
    sessionKey?: string;
    channel?: string;
    duration?: number;
    error?: string;
    model?: string;
    tokens?: number;
    cost?: number;
  };
}

// Debounce similar events to reduce noise
const recentEvents = new Map<string, number>();
const DEBOUNCE_MS = 5000; // 5 seconds

function shouldLog(eventKey: string): boolean {
  const now = Date.now();
  const lastTime = recentEvents.get(eventKey);
  
  if (lastTime && now - lastTime < DEBOUNCE_MS) {
    return false;
  }
  
  recentEvents.set(eventKey, now);
  
  // Clean old entries
  if (recentEvents.size > 100) {
    const cutoff = now - DEBOUNCE_MS * 2;
    for (const [key, time] of recentEvents) {
      if (time < cutoff) recentEvents.delete(key);
    }
  }
  
  return true;
}

async function postActivity(activity: ActivityPayload): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("[mission-control-sync] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/activities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        action_type: activity.actionType,
        category: activity.category,
        description: activity.description,
        timestamp: new Date(activity.timestamp).toISOString(),
        status: activity.status,
        metadata: activity.metadata,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[mission-control-sync] Failed to post activity: ${response.status} - ${text}`);
    }
  } catch (err) {
    console.error("[mission-control-sync] Error posting activity:", err);
  }
}

export function createActivitySyncService(): OpenClawPluginService {
  let unsubscribe: (() => void) | null = null;

  return {
    id: "mission-control-sync",
    
    async start(ctx) {
      ctx.logger.info("mission-control-sync: Starting activity sync");
      
      // Log startup
      postActivity({
        actionType: "extension_start",
        category: "system",
        description: "Mission Control activity sync started",
        timestamp: Date.now(),
        status: "success",
        metadata: {},
      });
      
      unsubscribe = onDiagnosticEvent((evt: DiagnosticEventPayload) => {
        const activity = processEvent(evt);
        if (activity) {
          postActivity(activity);
        }
      });
    },
    
    async stop() {
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}

// Cost per 1M tokens by model (input, output)
const MODEL_COSTS: Record<string, [number, number]> = {
  "claude-opus-4-6": [15, 75],
  "claude-sonnet-4-5": [3, 15],
  "claude-haiku-4-5": [0.80, 4],
  "claude-sonnet-4-5-20250929": [3, 15],
  "claude-haiku-4-5-20251001": [0.80, 4],
};

function estimateCost(model: string | undefined, input: number, output: number): number | undefined {
  if (!model) return undefined;
  // Match by substring (model strings may have provider prefix like "anthropic/claude-opus-4-6")
  for (const [key, [inCost, outCost]] of Object.entries(MODEL_COSTS)) {
    if (model.includes(key)) {
      return (input * inCost + output * outCost) / 1_000_000;
    }
  }
  return undefined;
}

// Track last known model per session for enriching message events
const sessionModels = new Map<string, string>();

function processEvent(evt: DiagnosticEventPayload): ActivityPayload | null {
  const now = Date.now();

  switch (evt.type) {
    // IMPORTANT: Model usage - always log
    case "model.usage": {
      const usage = evt.usage;
      const input = usage.input ?? 0;
      const output = usage.output ?? 0;
      const totalTokens = input + output;

      // Track model per session
      if (evt.sessionKey && evt.model) {
        sessionModels.set(evt.sessionKey, evt.model);
      }

      const cost = evt.costUsd ?? estimateCost(evt.model, input, output);

      return {
        actionType: "model_usage",
        category: "model",
        description: `${evt.model ?? "unknown"}: ${totalTokens.toLocaleString()} tokens`,
        timestamp: now,
        status: "success",
        metadata: {
          session: evt.sessionId,
          sessionKey: evt.sessionKey,
          channel: evt.channel,
          model: evt.model,
          tokens: totalTokens,
          cost,
          duration: evt.durationMs,
        },
      };
    }

    // IMPORTANT: Message processed - log outcomes
    case "message.processed": {
      // Skip noise outcomes
      if (evt.outcome === "skipped" || evt.outcome === "queued") return null;

      const eventKey = `msg:${evt.sessionKey}:${evt.messageId}`;
      if (!shouldLog(eventKey)) return null;

      const isError = evt.outcome === "error";
      let description = `Message ${evt.outcome}`;
      if (evt.reason) description += `: ${evt.reason}`;
      if (isError && evt.error) description = `Error: ${evt.error}`;

      // Attach last known model for this session
      const model = evt.sessionKey ? sessionModels.get(evt.sessionKey) : undefined;

      return {
        actionType: isError ? "message_error" : "message_processed",
        category: isError ? "important" : "message",
        description,
        timestamp: now,
        status: isError ? "error" : "success",
        metadata: {
          session: evt.sessionId,
          sessionKey: evt.sessionKey,
          channel: evt.channel,
          model,
          duration: evt.durationMs,
          error: evt.error,
        },
      };
    }
    
    // IMPORTANT: Session stuck - always log
    case "session.stuck": {
      return {
        actionType: "session_stuck",
        category: "important",
        description: `Session stuck in ${evt.state} for ${Math.round((evt.ageMs ?? 0) / 1000)}s`,
        timestamp: now,
        status: "error",
        metadata: {
          session: evt.sessionId,
          sessionKey: evt.sessionKey,
          duration: evt.ageMs,
        },
      };
    }
    
    // SYSTEM: Webhook errors - log errors only
    case "webhook.error": {
      return {
        actionType: "webhook_error",
        category: "important",
        description: `Webhook error (${evt.channel}): ${evt.error}`,
        timestamp: now,
        status: "error",
        metadata: {
          channel: evt.channel,
          error: evt.error,
        },
      };
    }
    
    // SYSTEM: Session state changes - log important ones
    case "session.state": {
      // Only log meaningful state changes
      if (evt.state === "idle" || evt.state === "processing") return null;
      
      const eventKey = `state:${evt.state}:${Math.floor(now / 10000)}`;
      if (!shouldLog(eventKey)) return null;
      
      return {
        actionType: "session_state",
        category: "system",
        description: `Session ${evt.state}${evt.reason ? `: ${evt.reason}` : ""}`,
        timestamp: now,
        status: "success",
        metadata: {},
      };
    }
    
    // Skip noise events
    case "message.queued":
    case "queue.lane.enqueue":
    case "queue.lane.dequeue":
    case "webhook.received":
    case "webhook.processed":
    case "run.attempt":
    case "diagnostic.heartbeat":
      return null;
    
    default:
      return null;
  }
}
