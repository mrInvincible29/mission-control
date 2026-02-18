import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createActivitySyncService } from "./src/service.js";

const plugin = {
  id: "mission-control-sync",
  name: "Mission Control Activity Sync",
  description: "Sync OpenClaw activities to Mission Control dashboard",
  configSchema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      supabaseUrl: { type: "string" as const },
      supabaseKey: { type: "string" as const },
      enabled: { type: "boolean" as const, default: true },
    },
  },
  register(api: OpenClawPluginApi) {
    api.registerService(createActivitySyncService());
  },
};

export default plugin;
