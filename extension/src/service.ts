import type { DiagnosticEventPayload, OpenClawPluginService } from "openclaw/plugin-sdk";
import { onDiagnosticEvent } from "openclaw/plugin-sdk";

const CONVEX_URL = "https://accomplished-rabbit-353.convex.cloud";

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
  try {
    // Convex HTTP API format
    const response = await fetch(`${CONVEX_URL}/api/mutation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "activities:create",
        args: {
          actionType: activity.actionType,
          category: activity.category,
          description: activity.description,
          timestamp: activity.timestamp,
          status: activity.status,
          metadata: activity.metadata,
        },
        format: "json",
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

function processEvent(evt: DiagnosticEventPayload): ActivityPayload | null {
  const now = Date.now();
  
  switch (evt.type) {
    // IMPORTANT: Model usage - always log
    case "model.usage": {
      const usage = evt.usage;
      const totalTokens = (usage.input ?? 0) + (usage.output ?? 0);
      
      // Skip small token counts (likely just heartbeats)
      if (totalTokens < 100) return null;
      
      const eventKey = `model:${evt.sessionKey}:${Math.floor(now / 30000)}`; // 30s buckets
      if (!shouldLog(eventKey)) return null;
      
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
          cost: evt.costUsd,
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
