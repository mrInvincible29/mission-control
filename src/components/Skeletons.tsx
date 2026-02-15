/**
 * Shimmer skeleton loaders that match the layout of each dashboard tab.
 * Replaces the generic "Loading..." text with visual placeholders.
 */

function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-muted/60 ${className}`}
    />
  );
}

function ShimmerText({ width = "w-20", height = "h-3" }: { width?: string; height?: string }) {
  return <Shimmer className={`${width} ${height}`} />;
}

/** Activity Feed: stat cards + filter bar + list items */
export function ActivitySkeleton() {
  return (
    <div className="px-4 pt-4 space-y-4">
      {/* Stats banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg bg-muted/30 p-2.5 space-y-2">
            <ShimmerText width="w-16" height="h-2.5" />
            <Shimmer className="w-12 h-5" />
          </div>
        ))}
      </div>
      {/* Filter bar */}
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Shimmer key={i} className="h-7 w-16 rounded-md" />
        ))}
      </div>
      {/* Search bar */}
      <Shimmer className="h-8 w-full rounded-md" />
      {/* Activity items */}
      <div className="space-y-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-2.5 rounded-lg border border-border/30 space-y-2">
            <div className="flex items-center gap-2">
              <Shimmer className="w-6 h-6 rounded" />
              <ShimmerText width="w-24" height="h-3" />
              <div className="ml-auto">
                <ShimmerText width="w-14" height="h-2.5" />
              </div>
            </div>
            <ShimmerText width="w-full" height="h-3" />
            <ShimmerText width="w-3/4" height="h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Calendar: navigation + grid */
export function CalendarSkeleton() {
  return (
    <div className="px-4 pt-4 space-y-4">
      {/* Nav bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shimmer className="h-8 w-8 rounded-md" />
          <Shimmer className="h-8 w-8 rounded-md" />
          <Shimmer className="h-8 w-16 rounded-md" />
        </div>
        <Shimmer className="h-5 w-32" />
        <div className="flex gap-1">
          <Shimmer className="h-8 w-14 rounded-md" />
          <Shimmer className="h-8 w-14 rounded-md" />
        </div>
      </div>
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <Shimmer key={i} className="h-10 rounded-md" />
        ))}
      </div>
      {/* Time slots */}
      <div className="space-y-0.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-1">
            <Shimmer className="w-12 h-12 rounded-sm flex-shrink-0" />
            <div className="flex-1 grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, j) => (
                <Shimmer key={j} className="h-12 rounded-sm" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Search: tabs + file list or search input */
export function SearchSkeleton() {
  return (
    <div className="px-4 pt-4 space-y-4">
      {/* Tab bar */}
      <div className="flex gap-2">
        <Shimmer className="h-8 w-20 rounded-md" />
        <Shimmer className="h-8 w-20 rounded-md" />
      </div>
      {/* Search input */}
      <Shimmer className="h-9 w-full rounded-md" />
      {/* File list */}
      <div className="space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-border/30">
            <Shimmer className="w-4 h-4 rounded" />
            <ShimmerText width="w-48" height="h-3" />
            <div className="ml-auto">
              <ShimmerText width="w-12" height="h-2.5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Agent Sessions: session list + detail panel */
export function AgentsSkeleton() {
  return (
    <div className="px-4 pt-4 flex gap-4 h-[600px]">
      {/* Session list */}
      <div className="w-full lg:w-2/5 space-y-2">
        <Shimmer className="h-8 w-full rounded-md" />
        <div className="space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-3 rounded-lg border border-border/30 space-y-2">
              <div className="flex items-center gap-2">
                <Shimmer className="w-14 h-4 rounded-full" />
                <div className="ml-auto">
                  <ShimmerText width="w-12" height="h-2.5" />
                </div>
              </div>
              <ShimmerText width="w-full" height="h-3" />
              <div className="flex gap-2">
                <Shimmer className="w-16 h-4 rounded" />
                <Shimmer className="w-12 h-4 rounded" />
                <Shimmer className="w-14 h-4 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Detail panel */}
      <div className="hidden lg:flex flex-1 items-center justify-center border border-border/30 rounded-lg">
        <ShimmerText width="w-40" height="h-4" />
      </div>
    </div>
  );
}

/** Analytics: stat cards + chart placeholders */
export function AnalyticsSkeleton() {
  return (
    <div className="px-4 pt-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Shimmer className="h-5 w-32" />
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Shimmer key={i} className="h-7 w-10 rounded-md" />
          ))}
        </div>
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <ShimmerText width="w-16" height="h-2.5" />
              <Shimmer className="w-7 h-7 rounded-lg" />
            </div>
            <Shimmer className="w-20 h-7" />
            <ShimmerText width="w-24" height="h-2.5" />
          </div>
        ))}
      </div>
      {/* Chart placeholder */}
      <div className="rounded-xl border border-border/30 p-4 space-y-3">
        <ShimmerText width="w-24" height="h-3.5" />
        <Shimmer className="w-full h-[120px] rounded" />
      </div>
      {/* Second chart */}
      <div className="rounded-xl border border-border/30 p-4 space-y-3">
        <ShimmerText width="w-24" height="h-3.5" />
        <Shimmer className="w-full h-[120px] rounded" />
      </div>
    </div>
  );
}

/** System Health: gauge circles + sections */
export function HealthSkeleton() {
  return (
    <div className="px-4 pt-4 space-y-6">
      {/* Overview gauges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border/30">
            <Shimmer className="w-20 h-20 rounded-full" />
            <ShimmerText width="w-14" height="h-3" />
            <ShimmerText width="w-10" height="h-2.5" />
          </div>
        ))}
      </div>
      {/* Detail sections */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Shimmer className="w-5 h-5 rounded" />
              <ShimmerText width="w-24" height="h-3.5" />
            </div>
            <Shimmer className="w-full h-3 rounded-full" />
            <Shimmer className="w-3/4 h-3 rounded-full" />
            <div className="flex justify-between">
              <ShimmerText width="w-16" height="h-2.5" />
              <ShimmerText width="w-16" height="h-2.5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Cron Runs: stats + job list */
export function CronRunsSkeleton() {
  return (
    <div className="px-4 pt-4 space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg bg-muted/30 p-2.5 space-y-1.5">
            <ShimmerText width="w-14" height="h-2.5" />
            <Shimmer className="w-10 h-5" />
          </div>
        ))}
      </div>
      {/* Filter bar */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer key={i} className="h-7 w-16 rounded-md" />
        ))}
      </div>
      {/* Job items */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-3 rounded-lg border border-border/30 flex items-center gap-3">
            <Shimmer className="w-10 h-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <ShimmerText width="w-32" height="h-3.5" />
              <ShimmerText width="w-48" height="h-2.5" />
            </div>
            <Shimmer className="w-16 h-8 rounded hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Log Viewer: source buttons + terminal area */
export function LogsSkeleton() {
  return (
    <div className="px-4 pt-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Shimmer className="h-5 w-24" />
        <div className="flex gap-2">
          <Shimmer className="h-7 w-16 rounded-md" />
          <Shimmer className="h-7 w-7 rounded-md" />
        </div>
      </div>
      {/* Source buttons */}
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Shimmer key={i} className="h-7 w-28 rounded-md" />
        ))}
      </div>
      {/* Filter row */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Shimmer key={i} className="h-6 w-20 rounded-md" />
        ))}
      </div>
      {/* Search */}
      <Shimmer className="h-8 w-full rounded-md" />
      {/* Terminal area */}
      <div className="rounded-lg bg-black/40 border border-border/30 p-3 space-y-1">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex gap-2">
            <Shimmer className="w-14 h-3.5 flex-shrink-0 bg-muted/30" />
            <Shimmer className="w-8 h-3.5 flex-shrink-0 bg-muted/30" />
            <Shimmer className={`h-3.5 bg-muted/30 ${i % 3 === 0 ? "w-full" : i % 3 === 1 ? "w-3/4" : "w-1/2"}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
