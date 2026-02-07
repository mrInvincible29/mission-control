import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("cron_jobs").collect();
  },
});

export const upsert = mutation({
  args: {
    name: v.string(),
    schedule: v.string(),
    command: v.string(),
    enabled: v.boolean(),
    lastRun: v.optional(v.number()),
    nextRun: v.optional(v.number()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cron_jobs")
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();
    
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    } else {
      return await ctx.db.insert("cron_jobs", args);
    }
  },
});

export const updateLastRun = mutation({
  args: {
    name: v.string(),
    lastRun: v.number(),
    nextRun: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("cron_jobs")
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();
    
    if (job) {
      await ctx.db.patch(job._id, {
        lastRun: args.lastRun,
        nextRun: args.nextRun,
      });
    }
  },
});
