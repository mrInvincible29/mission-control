import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";

export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.query.trim()) {
      return [];
    }
    
    const results = await ctx.db
      .query("indexed_documents")
      .withSearchIndex("search_content", (q) => q.search("content", args.query))
      .take(args.limit ?? 20);
    
    return results.map((doc) => {
      // Find matching snippet
      const content = doc.content.toLowerCase();
      const queryLower = args.query.toLowerCase();
      const index = content.indexOf(queryLower);
      
      let snippet = "";
      if (index !== -1) {
        const start = Math.max(0, index - 50);
        const end = Math.min(doc.content.length, index + args.query.length + 100);
        snippet = (start > 0 ? "..." : "") + 
          doc.content.slice(start, end) + 
          (end < doc.content.length ? "..." : "");
      } else {
        snippet = doc.content.slice(0, 150) + (doc.content.length > 150 ? "..." : "");
      }
      
      return {
        _id: doc._id,
        filePath: doc.filePath,
        fileName: doc.fileName,
        snippet,
        lastIndexed: doc.lastIndexed,
      };
    });
  },
});

export const upsertDocument = mutation({
  args: {
    filePath: v.string(),
    fileName: v.string(),
    content: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("indexed_documents")
      .withIndex("by_filePath", (q) => q.eq("filePath", args.filePath))
      .first();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        content: args.content,
        lastIndexed: Date.now(),
        size: args.size,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("indexed_documents", {
        filePath: args.filePath,
        fileName: args.fileName,
        content: args.content,
        lastIndexed: Date.now(),
        size: args.size,
      });
    }
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("indexed_documents").collect();
  },
});

export const deleteDocument = mutation({
  args: { id: v.id("indexed_documents") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
