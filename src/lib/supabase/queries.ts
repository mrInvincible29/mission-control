import { getSupabase } from "./client";
import type { Activity, CronJob, IndexedDocument, SearchResult } from "@/types";

// ──────────────────────────────────────────────
// Helpers: snake_case ↔ camelCase mapping
// ──────────────────────────────────────────────

function rowToActivity(row: Record<string, unknown>): Activity {
  return {
    id: row.id as string,
    actionType: row.action_type as string,
    category: row.category as Activity["category"],
    description: row.description as string,
    timestamp: new Date(row.timestamp as string).getTime(),
    status: row.status as Activity["status"],
    metadata: row.metadata as Activity["metadata"],
  };
}

function rowToCronJob(row: Record<string, unknown>): CronJob {
  return {
    id: row.id as string,
    name: row.name as string,
    schedule: row.schedule as string,
    command: row.command as string,
    enabled: row.enabled as boolean,
    lastRun: row.last_run ? new Date(row.last_run as string).getTime() : undefined,
    nextRun: row.next_run ? new Date(row.next_run as string).getTime() : undefined,
    model: row.model as string | undefined,
  };
}

function rowToDocument(row: Record<string, unknown>): IndexedDocument {
  return {
    id: row.id as string,
    filePath: row.file_path as string,
    fileName: row.file_name as string,
    content: (row.content as string) ?? "",
    lastIndexed: new Date(row.last_indexed as string).getTime(),
    size: row.size as number,
  };
}

function rowToSearchResult(row: Record<string, unknown>): SearchResult {
  return {
    id: row.id as string,
    filePath: row.file_path as string,
    fileName: row.file_name as string,
    snippet: (row.snippet as string) ?? "",
    lastIndexed: new Date(row.last_indexed as string).getTime(),
  };
}

// ──────────────────────────────────────────────
// Activities
// ──────────────────────────────────────────────

interface ListPaginatedArgs {
  limit?: number;
  category?: string;
  excludeCategories?: string[];
  sinceTimestamp?: number;
  cursor?: number; // epoch ms — fetch items older than this
}

export async function listActivitiesPaginated(args: ListPaginatedArgs): Promise<{
  items: Activity[];
  nextCursor: number | undefined;
  hasMore: boolean;
}> {
  const limit = args.limit ?? 50;
  const sinceTs = args.sinceTimestamp
    ? new Date(args.sinceTimestamp).toISOString()
    : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const cursorTs = args.cursor
    ? new Date(args.cursor).toISOString()
    : new Date(Date.now() + 1).toISOString();

  let query = getSupabase()
    .from("activities")
    .select("*")
    .gte("timestamp", sinceTs)
    .lt("timestamp", cursorTs)
    .order("timestamp", { ascending: false })
    .limit(limit + 1); // fetch one extra to detect hasMore

  if (args.category) {
    query = query.eq("category", args.category);
  }
  if (args.excludeCategories && args.excludeCategories.length > 0) {
    for (const cat of args.excludeCategories) {
      query = query.neq("category", cat);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data) return { items: [], nextCursor: undefined, hasMore: false };

  const hasMore = data.length > limit;
  const rows = hasMore ? data.slice(0, limit) : data;
  const items = rows.map(rowToActivity);
  const nextCursor = items.length > 0
    ? items[items.length - 1].timestamp
    : undefined;

  return { items, nextCursor, hasMore };
}

export async function listActivities(args: {
  limit?: number;
}): Promise<Activity[]> {
  const { data, error } = await getSupabase()
    .from("activities")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(args.limit ?? 100);

  if (error) throw error;
  return (data ?? []).map(rowToActivity);
}

export async function createActivity(activity: {
  actionType: string;
  category?: string;
  description: string;
  timestamp?: number;
  status: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const { data, error } = await getSupabase()
    .from("activities")
    .insert({
      action_type: activity.actionType,
      category: activity.category ?? "system",
      description: activity.description,
      timestamp: activity.timestamp
        ? new Date(activity.timestamp).toISOString()
        : new Date().toISOString(),
      status: activity.status,
      metadata: activity.metadata ?? null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function getAnalytics(days?: number): Promise<{
  daily: Array<{ day: string; tokens: number; cost: number; count: number; errors: number }>;
  hourly: Array<{ hour: number; tokens: number; cost: number; count: number }>;
  models: Array<{ model: string; tokens: number; cost: number; count: number }>;
  categories: Array<{ category: string; tokens: number; cost: number; count: number }>;
  totalActivities: number;
  totalTokens: number;
  totalCost: number;
  totalErrors: number;
  days: number;
}> {
  const { data, error } = await getSupabase().rpc("analytics_summary", {
    p_days: days ?? 14,
  });

  if (error) throw error;
  return data;
}

export async function getActivityStats(sinceTimestamp?: number): Promise<{
  total: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  totalTokens: number;
  totalCost: number;
}> {
  const since = sinceTimestamp
    ? new Date(sinceTimestamp).toISOString()
    : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await getSupabase().rpc("activity_stats", {
    p_since: since,
  });

  if (error) throw error;
  return data;
}

export async function getActionTypes(): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("activities")
    .select("action_type")
    .limit(500);

  if (error) throw error;
  const types = [...new Set((data ?? []).map((r) => r.action_type as string))];
  return types.sort();
}

export async function getCategories(): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("activities")
    .select("category")
    .not("category", "is", null)
    .limit(500);

  if (error) throw error;
  const cats = [...new Set((data ?? []).map((r) => r.category as string))];
  return cats.sort();
}

export async function cleanupActivities(): Promise<number> {
  const { data, error } = await getSupabase().rpc("cleanup_old_activities");
  if (error) throw error;
  return data as number;
}

// ──────────────────────────────────────────────
// Documents
// ──────────────────────────────────────────────

export async function searchDocuments(
  query: string,
  limit?: number
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const { data, error } = await getSupabase().rpc("search_documents", {
    p_query: query,
    p_limit: limit ?? 20,
  });

  if (error) throw error;
  return (data ?? []).map(rowToSearchResult);
}

/** Browse tab: paginated metadata only — no content column sent to client */
export async function listDocumentsPaginated(
  page: number,
  pageSize: number = 50
): Promise<{ documents: Omit<IndexedDocument, "content">[]; totalCount: number }> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await getSupabase()
    .from("indexed_documents")
    .select("id, file_path, file_name, last_indexed, size", { count: "exact" })
    .order("file_name")
    .range(from, to);

  if (error) throw error;

  const documents = (data ?? []).map((row) => ({
    id: row.id as string,
    filePath: row.file_path as string,
    fileName: row.file_name as string,
    lastIndexed: new Date(row.last_indexed as string).getTime(),
    size: row.size as number,
  }));

  return { documents, totalCount: count ?? 0 };
}

/** File viewer dialog: fetch single document content on-demand */
export async function getDocumentContent(id: string): Promise<IndexedDocument | null> {
  const { data, error } = await getSupabase()
    .from("indexed_documents")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw error;
  }
  return rowToDocument(data);
}

export async function upsertDocument(doc: {
  filePath: string;
  fileName: string;
  content: string;
  size: number;
}): Promise<string> {
  const { data, error } = await getSupabase()
    .from("indexed_documents")
    .upsert(
      {
        file_path: doc.filePath,
        file_name: doc.fileName,
        content: doc.content,
        last_indexed: new Date().toISOString(),
        size: doc.size,
      },
      { onConflict: "file_path" }
    )
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("indexed_documents")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// ──────────────────────────────────────────────
// Cron Jobs
// ──────────────────────────────────────────────

export async function listCronJobs(): Promise<CronJob[]> {
  const { data, error } = await getSupabase()
    .from("cron_jobs")
    .select("*")
    .order("name");

  if (error) throw error;
  return (data ?? []).map(rowToCronJob);
}

export async function upsertCronJob(job: {
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  model?: string;
}): Promise<string> {
  const { data, error } = await getSupabase()
    .from("cron_jobs")
    .upsert(
      {
        name: job.name,
        schedule: job.schedule,
        command: job.command,
        enabled: job.enabled,
        last_run: job.lastRun ? new Date(job.lastRun).toISOString() : null,
        next_run: job.nextRun ? new Date(job.nextRun).toISOString() : null,
        model: job.model ?? null,
      },
      { onConflict: "name" }
    )
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function updateCronJobLastRun(
  name: string,
  lastRun: number,
  nextRun?: number
): Promise<void> {
  const update: Record<string, unknown> = {
    last_run: new Date(lastRun).toISOString(),
  };
  if (nextRun !== undefined) {
    update.next_run = new Date(nextRun).toISOString();
  }

  const { error } = await getSupabase()
    .from("cron_jobs")
    .update(update)
    .eq("name", name);

  if (error) throw error;
}

export async function removeCronJob(name: string): Promise<boolean> {
  const { error, count } = await getSupabase()
    .from("cron_jobs")
    .delete()
    .eq("name", name);

  if (error) throw error;
  return (count ?? 0) > 0;
}
