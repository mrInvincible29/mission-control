/**
 * Shared formatting utilities used across dashboard components.
 * Consolidates duplicated formatTokens, formatCost, formatTime, etc.
 */

export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}

export function formatCost(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return "unknown";
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(ms: number): string {
  if (ms >= 3600000) return `${(ms / 3600000).toFixed(1)}h`;
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms > 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

/** Model color coding: haiku=green, sonnet=blue, opus=purple */
export function getModelColor(model?: string): {
  bg: string;
  bar: string;
  text: string;
  dot: string;
  border: string;
} {
  const lower = (model || "").toLowerCase();
  if (lower.includes("haiku"))
    return {
      bg: "bg-green-500/15",
      bar: "bg-green-500",
      text: "text-green-400",
      dot: "bg-green-500",
      border: "border-green-500/40",
    };
  if (lower.includes("sonnet"))
    return {
      bg: "bg-blue-500/15",
      bar: "bg-blue-500",
      text: "text-blue-400",
      dot: "bg-blue-500",
      border: "border-blue-500/40",
    };
  if (lower.includes("opus"))
    return {
      bg: "bg-purple-500/15",
      bar: "bg-purple-500",
      text: "text-purple-400",
      dot: "bg-purple-500",
      border: "border-purple-500/40",
    };
  return {
    bg: "bg-gray-500/15",
    bar: "bg-gray-500",
    text: "text-gray-400",
    dot: "bg-gray-500",
    border: "border-gray-500/40",
  };
}
