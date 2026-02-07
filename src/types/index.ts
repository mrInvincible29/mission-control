export interface Activity {
  _id: string;
  actionType: string;
  description: string;
  timestamp: number;
  status: "success" | "error" | "pending";
  metadata?: {
    tool?: string;
    session?: string;
    channel?: string;
    duration?: number;
    error?: string;
  };
}

export interface IndexedDocument {
  _id: string;
  filePath: string;
  fileName: string;
  content: string;
  lastIndexed: number;
  size: number;
}

export interface SearchResult {
  _id: string;
  filePath: string;
  fileName: string;
  snippet: string;
  lastIndexed: number;
}

export interface CronJob {
  _id: string;
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
}
