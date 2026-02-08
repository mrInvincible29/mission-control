import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  activities: defineTable({
    actionType: v.string(),
    category: v.optional(v.union(
      v.literal("important"),
      v.literal("model"),
      v.literal("message"),
      v.literal("system"),
      v.literal("noise")
    )),
    description: v.string(),
    timestamp: v.number(),
    status: v.union(v.literal("success"), v.literal("error"), v.literal("pending")),
    metadata: v.optional(v.object({
      tool: v.optional(v.string()),
      session: v.optional(v.string()),
      sessionKey: v.optional(v.string()),
      channel: v.optional(v.string()),
      duration: v.optional(v.number()),
      error: v.optional(v.string()),
      model: v.optional(v.string()),
      tokens: v.optional(v.number()),
      cost: v.optional(v.number()),
    })),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_actionType", ["actionType"])
    .index("by_category", ["category"]),

  indexed_documents: defineTable({
    filePath: v.string(),
    fileName: v.string(),
    content: v.string(),
    lastIndexed: v.number(),
    size: v.number(),
  })
    .index("by_filePath", ["filePath"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["filePath"],
    }),

  cron_jobs: defineTable({
    name: v.string(),
    schedule: v.string(),
    command: v.string(),
    lastRun: v.optional(v.number()),
    nextRun: v.optional(v.number()),
    enabled: v.boolean(),
    model: v.optional(v.string()),
  })
    .index("by_name", ["name"])
    .index("by_nextRun", ["nextRun"]),
});
