import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {
    limit: v.optional(v.number()),
    actionType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    let activities;
    if (args.actionType) {
      activities = await ctx.db
        .query("activities")
        .withIndex("by_actionType", (q) => q.eq("actionType", args.actionType!))
        .order("desc")
        .take(limit);
    } else {
      activities = await ctx.db
        .query("activities")
        .withIndex("by_timestamp")
        .order("desc")
        .take(limit);
    }
    
    return activities;
  },
});

export const create = mutation({
  args: {
    actionType: v.string(),
    description: v.string(),
    status: v.union(v.literal("success"), v.literal("error"), v.literal("pending")),
    metadata: v.optional(v.object({
      tool: v.optional(v.string()),
      session: v.optional(v.string()),
      channel: v.optional(v.string()),
      duration: v.optional(v.number()),
      error: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const activityId = await ctx.db.insert("activities", {
      actionType: args.actionType,
      description: args.description,
      timestamp: Date.now(),
      status: args.status,
      metadata: args.metadata,
    });
    return activityId;
  },
});

export const getActionTypes = query({
  args: {},
  handler: async (ctx) => {
    const activities = await ctx.db.query("activities").collect();
    const types = [...new Set(activities.map(a => a.actionType))];
    return types.sort();
  },
});
