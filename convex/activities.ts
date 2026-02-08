import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export const list = query({
  args: {
    limit: v.optional(v.number()),
    actionType: v.optional(v.string()),
    category: v.optional(v.string()),
    excludeCategories: v.optional(v.array(v.string())),
    sinceTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const twoWeeksAgo = Date.now() - TWO_WEEKS_MS;
    const sinceTimestamp = args.sinceTimestamp ?? twoWeeksAgo;
    
    let activities = await ctx.db
      .query("activities")
      .withIndex("by_timestamp")
      .order("desc")
      .filter((q) => q.gte(q.field("timestamp"), sinceTimestamp))
      .take(limit * 2); // Fetch more to allow for filtering
    
    // Apply category filter
    if (args.category) {
      activities = activities.filter(a => a.category === args.category);
    }
    
    // Apply actionType filter
    if (args.actionType) {
      activities = activities.filter(a => a.actionType === args.actionType);
    }
    
    // Exclude categories
    if (args.excludeCategories && args.excludeCategories.length > 0) {
      activities = activities.filter(a => 
        !args.excludeCategories!.includes(a.category ?? "")
      );
    }
    
    return activities.slice(0, limit);
  },
});

// Paginated list: returns { items, nextCursor, hasMore }
export const listPaginated = query({
  args: {
    limit: v.optional(v.number()),
    actionType: v.optional(v.string()),
    category: v.optional(v.string()),
    excludeCategories: v.optional(v.array(v.string())),
    sinceTimestamp: v.optional(v.number()),
    cursor: v.optional(v.number()), // timestamp cursor: fetch items older than this
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const twoWeeksAgo = Date.now() - TWO_WEEKS_MS;
    const sinceTimestamp = args.sinceTimestamp ?? twoWeeksAgo;
    const cursor = args.cursor ?? Date.now() + 1;
    
    // Fetch extra to filter and detect hasMore
    const fetchCount = limit * 3;
    
    let activities = await ctx.db
      .query("activities")
      .withIndex("by_timestamp")
      .order("desc")
      .filter((q) =>
        q.and(
          q.gte(q.field("timestamp"), sinceTimestamp),
          q.lt(q.field("timestamp"), cursor)
        )
      )
      .take(fetchCount);
    
    if (args.category) {
      activities = activities.filter(a => a.category === args.category);
    }
    if (args.actionType) {
      activities = activities.filter(a => a.actionType === args.actionType);
    }
    if (args.excludeCategories && args.excludeCategories.length > 0) {
      activities = activities.filter(a =>
        !args.excludeCategories!.includes(a.category ?? "")
      );
    }
    
    const hasMore = activities.length > limit;
    const items = activities.slice(0, limit);
    const nextCursor = items.length > 0
      ? items[items.length - 1].timestamp
      : undefined;
    
    return { items, nextCursor, hasMore };
  },
});

export const create = mutation({
  args: {
    actionType: v.string(),
    category: v.optional(v.union(
      v.literal("important"),
      v.literal("model"),
      v.literal("message"),
      v.literal("system"),
      v.literal("noise")
    )),
    description: v.string(),
    timestamp: v.optional(v.number()),
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
  },
  handler: async (ctx, args) => {
    const activityId = await ctx.db.insert("activities", {
      actionType: args.actionType,
      category: args.category ?? "system",
      description: args.description,
      timestamp: args.timestamp ?? Date.now(),
      status: args.status,
      metadata: args.metadata,
    });
    return activityId;
  },
});

export const getActionTypes = query({
  args: {},
  handler: async (ctx) => {
    const activities = await ctx.db.query("activities").take(500);
    const types = [...new Set(activities.map(a => a.actionType))];
    return types.sort();
  },
});

export const getCategories = query({
  args: {},
  handler: async (ctx) => {
    const activities = await ctx.db.query("activities").take(500);
    const categories = [...new Set(activities.map(a => a.category).filter(Boolean))];
    return categories.sort();
  },
});

// Cleanup old activities (older than 2 weeks)
export const cleanup = mutation({
  args: {},
  handler: async (ctx) => {
    const twoWeeksAgo = Date.now() - TWO_WEEKS_MS;
    
    const oldActivities = await ctx.db
      .query("activities")
      .withIndex("by_timestamp")
      .filter((q) => q.lt(q.field("timestamp"), twoWeeksAgo))
      .take(100);
    
    for (const activity of oldActivities) {
      await ctx.db.delete(activity._id);
    }
    
    return { deleted: oldActivities.length };
  },
});

// Get activity stats for dashboard
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    
    const recentActivities = await ctx.db
      .query("activities")
      .withIndex("by_timestamp")
      .order("desc")
      .filter((q) => q.gte(q.field("timestamp"), oneDayAgo))
      .take(1000);
    
    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalTokens = 0;
    let totalCost = 0;
    
    for (const activity of recentActivities) {
      const cat = activity.category ?? "unknown";
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
      byStatus[activity.status] = (byStatus[activity.status] ?? 0) + 1;
      
      if (activity.metadata?.tokens) {
        totalTokens += activity.metadata.tokens;
      }
      if (activity.metadata?.cost) {
        totalCost += activity.metadata.cost;
      }
    }
    
    return {
      total: recentActivities.length,
      byCategory,
      byStatus,
      totalTokens,
      totalCost,
    };
  },
});
