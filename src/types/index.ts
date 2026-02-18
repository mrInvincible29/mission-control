export interface Activity {
  id: string;
  actionType: string;
  category?: "important" | "model" | "message" | "system" | "noise";
  description: string;
  timestamp: number;
  status: "success" | "error" | "pending";
  metadata?: {
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

export interface IndexedDocument {
  id: string;
  filePath: string;
  fileName: string;
  content: string;
  lastIndexed: number;
  size: number;
}

export interface SearchResult {
  id: string;
  filePath: string;
  fileName: string;
  snippet: string;
  lastIndexed: number;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  model?: string;
}

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskSource = "manual" | "cron" | "telegram";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee: string | null;
  priority: TaskPriority;
  tags: string[];
  source: TaskSource;
  cronJobId: string | null;
  position: string;
  metadata: Record<string, unknown>;
  archived: boolean;
  createdAt: number; // epoch ms
  updatedAt: number;
  completedAt: number | null;
}

export interface Assignee {
  name: string;
  displayName: string;
  avatarUrl: string | null;
}
