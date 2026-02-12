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

// Blended $/token rate (avg of input+output) by model family
const MODEL_COST_PER_TOKEN: Record<string, number> = {
  "haiku": 2.4 / 1_000_000,    // ~$0.80 in + $4 out, blended
  "sonnet": 9 / 1_000_000,     // ~$3 in + $15 out, blended
  "opus": 45 / 1_000_000,      // ~$15 in + $75 out, blended
};

function estimateCost(model: string, tokens: number): number {
  const lower = model.toLowerCase();
  for (const [key, rate] of Object.entries(MODEL_COST_PER_TOKEN)) {
    if (lower.includes(key)) return tokens * rate;
  }
  return tokens * (9 / 1_000_000); // default to sonnet-tier
}

// Analytics: aggregate activities by day and model for charts
export const analytics = query({
  args: {
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.days ?? 14;
    const sinceTimestamp = Date.now() - days * 24 * 60 * 60 * 1000;

    const activities = await ctx.db
      .query("activities")
      .withIndex("by_timestamp")
      .order("desc")
      .filter((q) => q.gte(q.field("timestamp"), sinceTimestamp))
      .take(5000);

    // Aggregate by day (YYYY-MM-DD in UTC)
    const dailyMap: Record<string, { tokens: number; cost: number; count: number; errors: number }> = {};
    // Aggregate by model
    const modelMap: Record<string, { tokens: number; cost: number; count: number }> = {};
    // Aggregate by hour of day (0-23)
    const hourlyMap: Record<number, { tokens: number; cost: number; count: number }> = {};
    // Aggregate by category
    const categoryMap: Record<string, { tokens: number; cost: number; count: number }> = {};

    for (const a of activities) {
      const date = new Date(a.timestamp);
      const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const hour = date.getHours();
      const model = a.metadata?.model || "unknown";
      const tokens = a.metadata?.tokens || 0;
      const cost = a.metadata?.cost || (tokens > 0 ? estimateCost(model, tokens) : 0);
      const cat = a.category ?? "system";

      // Daily
      if (!dailyMap[dayKey]) dailyMap[dayKey] = { tokens: 0, cost: 0, count: 0, errors: 0 };
      dailyMap[dayKey].tokens += tokens;
      dailyMap[dayKey].cost += cost;
      dailyMap[dayKey].count += 1;
      if (a.status === "error") dailyMap[dayKey].errors += 1;

      // Model (only if model usage)
      if (tokens > 0 || cost > 0) {
        if (!modelMap[model]) modelMap[model] = { tokens: 0, cost: 0, count: 0 };
        modelMap[model].tokens += tokens;
        modelMap[model].cost += cost;
        modelMap[model].count += 1;
      }

      // Hourly
      if (!hourlyMap[hour]) hourlyMap[hour] = { tokens: 0, cost: 0, count: 0 };
      hourlyMap[hour].tokens += tokens;
      hourlyMap[hour].cost += cost;
      hourlyMap[hour].count += 1;

      // Category
      if (!categoryMap[cat]) categoryMap[cat] = { tokens: 0, cost: 0, count: 0 };
      categoryMap[cat].tokens += tokens;
      categoryMap[cat].cost += cost;
      categoryMap[cat].count += 1;
    }

    // Build sorted daily array (fill missing days with zeros)
    const daily: Array<{ day: string; tokens: number; cost: number; count: number; errors: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      daily.push({
        day: key,
        ...(dailyMap[key] || { tokens: 0, cost: 0, count: 0, errors: 0 }),
      });
    }

    // Hourly array (0-23)
    const hourly: Array<{ hour: number; tokens: number; cost: number; count: number }> = [];
    for (let h = 0; h < 24; h++) {
      hourly.push({
        hour: h,
        ...(hourlyMap[h] || { tokens: 0, cost: 0, count: 0 }),
      });
    }

    // Model breakdown sorted by cost desc
    const models = Object.entries(modelMap)
      .map(([model, data]) => ({ model, ...data }))
      .sort((a, b) => b.cost - a.cost);

    // Category breakdown
    const categories = Object.entries(categoryMap)
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.count - a.count);

    // Totals
    let totalTokens = 0;
    let totalCost = 0;
    let totalErrors = 0;
    for (const d of daily) {
      totalTokens += d.tokens;
      totalCost += d.cost;
      totalErrors += d.errors;
    }

    return {
      daily,
      hourly,
      models,
      categories,
      totalActivities: activities.length,
      totalTokens,
      totalCost,
      totalErrors,
      days,
    };
  },
});

// Get activity stats for dashboard
export const stats = query({
  args: {
    sinceTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const defaultSince = Date.now() - 24 * 60 * 60 * 1000;
    const sinceTimestamp = args.sinceTimestamp ?? defaultSince;

    const recentActivities = await ctx.db
      .query("activities")
      .withIndex("by_timestamp")
      .order("desc")
      .filter((q) => q.gte(q.field("timestamp"), sinceTimestamp))
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
