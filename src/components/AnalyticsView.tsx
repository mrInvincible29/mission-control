"use client";

import useSWR from "swr";
import { getAnalytics } from "@/lib/supabase/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useMemo, useEffect, useCallback } from "react";
import { TrendingUp, TrendingDown, Minus, Zap, DollarSign, Activity, AlertTriangle, RefreshCw, Gauge, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { formatTokens, formatCost, getModelColor } from "@/lib/formatters";
import { AnalyticsSkeleton } from "@/components/Skeletons";

const TIME_RANGES = [
  { label: "1d", value: 1 },
  { label: "7d", value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
];

const HEATMAP_METRICS = [
  { key: "count" as const, label: "Activity" },
  { key: "tokens" as const, label: "Tokens" },
  { key: "cost" as const, label: "Cost" },
];

function formatShortDay(dayStr: string): string {
  const date = new Date(dayStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatHour(hour: number): string {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

// Tiny inline SVG sparkline for stat cards
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 48;
  const h = 16;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return `${x},${y}`;
  });

  return (
    <svg width={w} height={h} className="inline-block ml-1 align-middle opacity-60">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Pure SVG bar chart with Y-axis scale labels
function BarChart({
  data,
  valueKey,
  labelKey,
  formatValue,
  formatLabel,
  color = "var(--color-primary)",
  height = 120,
}: {
  data: Array<Record<string, any>>;
  valueKey: string;
  labelKey: string;
  formatValue: (v: number) => string;
  formatLabel: (v: string) => string;
  color?: string;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
        No data available
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d[valueKey] as number), 1);
  // Use a wider viewBox so SVG text doesn't scale up when stretched to fill container
  const vbWidth = 700;
  const barGap = 4;
  const leftPadding = 55;
  const rightPadding = 15;
  const usableWidth = vbWidth - leftPadding - rightPadding;
  const barWidth = Math.max(8, (usableWidth - data.length * barGap) / data.length);
  const totalBarsWidth = data.length * (barWidth + barGap);
  const chartWidth = totalBarsWidth + leftPadding + rightPadding;
  const barAreaHeight = height - 10;

  return (
    <TooltipProvider>
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${height + 24}`}
          className="w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Y-axis scale labels */}
          {[0.5, 1].map((frac) => {
            const y = height - barAreaHeight * frac;
            return (
              <text
                key={`y-${frac}`}
                x={leftPadding - 6}
                y={y + 3}
                textAnchor="end"
                fill="currentColor"
                opacity={0.3}
                fontSize={9}
                fontFamily="monospace"
              >
                {formatValue(maxVal * frac)}
              </text>
            );
          })}

          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map((frac) => (
            <line
              key={frac}
              x1={leftPadding}
              y1={height - barAreaHeight * frac}
              x2={chartWidth - rightPadding}
              y2={height - barAreaHeight * frac}
              stroke="currentColor"
              strokeOpacity={0.06}
              strokeWidth={0.5}
            />
          ))}

          {/* Bars */}
          {data.map((d, i) => {
            const val = d[valueKey] as number;
            const barHeight = (val / maxVal) * barAreaHeight;
            const x = leftPadding + i * (barWidth + barGap);

            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <g className="cursor-pointer">
                    {/* Hover area */}
                    <rect
                      x={x}
                      y={0}
                      width={barWidth}
                      height={height}
                      fill="transparent"
                    />
                    {/* Bar */}
                    <rect
                      x={x}
                      y={height - barHeight}
                      width={barWidth}
                      height={Math.max(barHeight, 1)}
                      fill={color}
                      rx={Math.min(barWidth / 4, 3)}
                      opacity={val > 0 ? 0.8 : 0.15}
                      className="transition-opacity hover:opacity-100"
                    />
                  </g>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <div className="font-medium">{formatLabel(d[labelKey])}</div>
                  <div>{formatValue(val)}</div>
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* X-axis labels (show subset to avoid overlap) */}
          {data.map((d, i) => {
            const maxLabels = Math.max(5, Math.floor(chartWidth / 80));
            const step = Math.ceil(data.length / maxLabels);
            const showLabel =
              i === 0 ||
              i === data.length - 1 ||
              i % step === 0;
            if (!showLabel) return null;
            const x = leftPadding + i * (barWidth + barGap) + barWidth / 2;
            return (
              <text
                key={`label-${i}`}
                x={x}
                y={height + 16}
                textAnchor="middle"
                fill="currentColor"
                opacity={0.4}
                fontSize={10}
                fontFamily="monospace"
              >
                {formatLabel(d[labelKey])}
              </text>
            );
          })}
        </svg>
      </div>
    </TooltipProvider>
  );
}

// Hourly activity heatmap with metric toggle
function HourlyHeatmap({
  data,
  valueKey,
}: {
  data: Array<{ hour: number; count: number; tokens: number; cost: number }>;
  valueKey: "count" | "tokens" | "cost";
}) {
  const maxVal = Math.max(...data.map((d) => d[valueKey]), 1);

  return (
    <TooltipProvider>
      <div className="flex gap-[3px] flex-wrap">
        {data.map((d) => {
          const intensity = d[valueKey] / maxVal;
          const opacity = d[valueKey] === 0 ? 0.05 : 0.15 + intensity * 0.85;
          return (
            <Tooltip key={d.hour}>
              <TooltipTrigger asChild>
                <div
                  className="flex flex-col items-center gap-0.5 cursor-pointer"
                >
                  <div
                    className="w-6 h-6 sm:w-7 sm:h-7 rounded-sm bg-primary transition-opacity"
                    style={{ opacity }}
                  />
                  <span className="text-[8px] text-muted-foreground/60 font-mono">
                    {formatHour(d.hour)}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <div className="font-medium">{formatHour(d.hour)} - {formatHour(d.hour + 1)}</div>
                <div>{d.count} activities</div>
                {d.tokens > 0 && <div>{formatTokens(d.tokens)} tokens</div>}
                {d.cost > 0 && <div>{formatCost(d.cost)}</div>}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

// Stat card with trend, sparkline, and semantic color coding
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  trend,
  trendPercent,
  subtitle,
  trendSemantic = "positive",
  sparklineData,
  sparklineColor,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  trend?: "up" | "down" | "flat";
  trendPercent?: number;
  subtitle?: string;
  trendSemantic?: "positive" | "negative" | "neutral";
  sparklineData?: number[];
  sparklineColor?: string;
}) {
  const trendColor = (() => {
    if (!trend || trend === "flat") return "text-muted-foreground";
    if (trendSemantic === "negative") return trend === "up" ? "text-amber-400" : "text-emerald-400";
    if (trendSemantic === "neutral") return "text-blue-400";
    return trend === "up" ? "text-emerald-400" : "text-red-400";
  })();

  return (
    <div className="rounded-xl border border-border/50 bg-card/30 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={`rounded-lg p-1.5 ${color}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold tracking-tight">{value}</span>
        {trend && (
          <span className={`flex items-center gap-0.5 text-xs pb-0.5 ${trendColor}`}>
            {trend === "up" ? <TrendingUp className="h-3 w-3" /> :
             trend === "down" ? <TrendingDown className="h-3 w-3" /> :
             <Minus className="h-3 w-3" />}
            {trendPercent !== undefined && trend !== "flat" && (
              <span className="font-mono text-[10px]">
                {trend === "up" ? "+" : ""}{trendPercent > 0 ? trendPercent.toFixed(0) : trendPercent.toFixed(0)}%
              </span>
            )}
          </span>
        )}
      </div>
      {sparklineData && sparklineColor && (
        <div className="mt-1.5">
          <Sparkline data={sparklineData} color={sparklineColor} />
        </div>
      )}
      {subtitle && (
        <div className="text-[11px] text-muted-foreground mt-1">{subtitle}</div>
      )}
    </div>
  );
}

// Inline mini-bar for daily breakdown table cells
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="w-10 h-1.5 rounded-full bg-muted/30 overflow-hidden inline-block ml-1.5 align-middle">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }} />
    </div>
  );
}

// Stacked horizontal bar showing model cost proportions
function ModelCostBar({
  models,
  totalCost,
}: {
  models: Array<{ model: string; cost: number; tokens: number; count: number }>;
  totalCost: number;
}) {
  if (models.length === 0 || totalCost <= 0) return null;

  const sorted = [...models].sort((a, b) => b.cost - a.cost);

  return (
    <TooltipProvider>
      <div data-testid="model-cost-bar" className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-muted-foreground font-medium">Cost by Model</span>
          <span className="text-[10px] text-emerald-400 font-mono">{formatCost(totalCost)}</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden bg-muted/30 gap-px">
          {sorted.map((m) => {
            const pct = (m.cost / totalCost) * 100;
            if (pct < 0.5) return null;
            const colors = getModelColor(m.model);
            return (
              <Tooltip key={m.model}>
                <TooltipTrigger asChild>
                  <div
                    className={`h-full ${colors.bar} transition-all duration-500 cursor-pointer hover:brightness-125`}
                    style={{ width: `${Math.max(pct, 1)}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <div className="font-medium">{m.model}</div>
                  <div>{formatCost(m.cost)} ({pct.toFixed(1)}%)</div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="flex gap-3 mt-1.5">
          {sorted.filter(m => (m.cost / totalCost) >= 0.01).map((m) => {
            const colors = getModelColor(m.model);
            const pct = (m.cost / totalCost) * 100;
            return (
              <div key={m.model} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                <span className="text-[10px] text-muted-foreground">
                  {m.model.split("-").pop() || m.model} {pct.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

// Category proportion stacked bar
function CategoryBar({
  categories,
  total,
}: {
  categories: Array<{ category: string; count: number; tokens: number; cost: number }>;
  total: number;
}) {
  if (categories.length === 0 || total <= 0) return null;

  const CATEGORY_COLORS: Record<string, { bar: string; dot: string }> = {
    important: { bar: "bg-red-500/70", dot: "bg-red-400" },
    model: { bar: "bg-purple-500/70", dot: "bg-purple-400" },
    message: { bar: "bg-blue-500/70", dot: "bg-blue-400" },
    system: { bar: "bg-gray-500/70", dot: "bg-gray-400" },
    noise: { bar: "bg-zinc-500/70", dot: "bg-zinc-400" },
  };

  const sorted = [...categories].sort((a, b) => b.count - a.count);

  return (
    <TooltipProvider>
      <div data-testid="category-bar">
        <div className="flex h-2.5 rounded-full overflow-hidden bg-muted/30 gap-px mb-2">
          {sorted.map((c) => {
            const pct = (c.count / total) * 100;
            if (pct < 0.5) return null;
            const colors = CATEGORY_COLORS[c.category] || { bar: "bg-slate-500/70", dot: "bg-slate-400" };
            return (
              <Tooltip key={c.category}>
                <TooltipTrigger asChild>
                  <div
                    className={`h-full ${colors.bar} transition-all duration-500 cursor-pointer hover:brightness-125`}
                    style={{ width: `${Math.max(pct, 1)}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  <div className="font-medium">{c.category}</div>
                  <div>{c.count} activities ({pct.toFixed(1)}%)</div>
                  {c.tokens > 0 && <div>{formatTokens(c.tokens)} tokens</div>}
                  {c.cost > 0 && <div>{formatCost(c.cost)} cost</div>}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {sorted.map((c) => {
            const pct = (c.count / total) * 100;
            const colors = CATEGORY_COLORS[c.category] || { bar: "bg-slate-500/70", dot: "bg-slate-400" };
            return (
              <div key={c.category} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                <span className="text-[10px] text-muted-foreground">
                  {c.category} <span className="font-mono">{c.count}</span>
                  <span className="text-muted-foreground/50 ml-0.5">({pct.toFixed(0)}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

// Auto-generated insights strip
function InsightsStrip({
  analytics,
  days,
}: {
  analytics: {
    daily: Array<{ day: string; tokens: number; cost: number; count: number; errors: number }>;
    hourly: Array<{ hour: number; tokens: number; cost: number; count: number }>;
    models: Array<{ model: string; tokens: number; cost: number; count: number }>;
    totalActivities: number;
    totalTokens: number;
    totalCost: number;
    totalErrors: number;
    days: number;
  };
  days: number;
}) {
  const insights = useMemo(() => {
    const result: Array<{ text: string; type: "info" | "good" | "warn" }> = [];

    // Peak hour
    if (analytics.hourly.length > 0) {
      const peak = analytics.hourly.reduce((best, h) => h.count > best.count ? h : best, analytics.hourly[0]);
      if (peak.count > 0) {
        result.push({ text: `Peak hour: ${formatHour(peak.hour)} (${peak.count} activities)`, type: "info" });
      }
    }

    // Top model by cost
    if (analytics.models.length > 0) {
      const topModel = [...analytics.models].sort((a, b) => b.cost - a.cost)[0];
      if (topModel.cost > 0) {
        const pct = analytics.totalCost > 0 ? (topModel.cost / analytics.totalCost) * 100 : 0;
        const shortName = topModel.model.split("-").pop() || topModel.model;
        result.push({ text: `${shortName} is ${pct.toFixed(0)}% of cost (${formatCost(topModel.cost)})`, type: "info" });
      }
    }

    // Busiest day
    if (analytics.daily.length > 1) {
      const busiestDay = analytics.daily.reduce((best, d) => d.count > best.count ? d : best, analytics.daily[0]);
      if (busiestDay.count > 0) {
        result.push({ text: `Busiest: ${formatShortDay(busiestDay.day)} (${busiestDay.count} activities)`, type: "info" });
      }
    }

    // Error rate warning
    if (analytics.totalActivities > 0 && analytics.totalErrors > 0) {
      const errorRate = (analytics.totalErrors / analytics.totalActivities) * 100;
      if (errorRate >= 5) {
        result.push({ text: `${errorRate.toFixed(1)}% error rate over ${days}d`, type: "warn" });
      }
    }

    // Zero-activity days
    const zeroDays = analytics.daily.filter(d => d.count === 0).length;
    if (zeroDays > 0 && days > 1) {
      result.push({ text: `${zeroDays} day${zeroDays > 1 ? "s" : ""} with no activity`, type: zeroDays > days / 2 ? "warn" : "info" });
    }

    // Cost spike detection: any day > 3x average
    if (analytics.daily.length > 2) {
      const avgCost = analytics.totalCost / analytics.daily.filter(d => d.cost > 0).length;
      const spike = analytics.daily.find(d => d.cost > avgCost * 3 && avgCost > 0);
      if (spike) {
        result.push({ text: `Cost spike: ${formatShortDay(spike.day)} (${formatCost(spike.cost)}, ${(spike.cost / avgCost).toFixed(1)}x avg)`, type: "warn" });
      }
    }

    return result.slice(0, 4); // max 4 insights
  }, [analytics, days]);

  if (insights.length === 0) return null;

  const typeStyles = {
    info: "text-blue-400/80",
    good: "text-emerald-400/80",
    warn: "text-amber-400/80",
  };

  return (
    <div data-testid="insights-strip" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-2 text-[11px]">
      <Lightbulb className="h-3 w-3 text-amber-400/60 flex-shrink-0" />
      {insights.map((insight, i) => (
        <span key={i} className={typeStyles[insight.type]}>
          {insight.text}
          {i < insights.length - 1 && <span className="text-border ml-3">|</span>}
        </span>
      ))}
    </div>
  );
}

const DAILY_BREAKDOWN_COLLAPSE_THRESHOLD = 7;

export function AnalyticsView() {
  const [days, setDays] = useState(14);
  const [heatmapMetric, setHeatmapMetric] = useState<"count" | "tokens" | "cost">("count");
  const [breakdownExpanded, setBreakdownExpanded] = useState(false);
  const { data: analytics, error, mutate } = useSWR(
    ["analytics", days],
    () => getAnalytics(days),
    { refreshInterval: 60000 }
  );

  // Keyboard shortcuts: [ and ] to cycle time ranges
  const cycleTimeRange = useCallback((direction: "prev" | "next") => {
    setDays((current) => {
      const currentIdx = TIME_RANGES.findIndex(r => r.value === current);
      if (currentIdx === -1) return current;
      const nextIdx = direction === "next"
        ? Math.min(currentIdx + 1, TIME_RANGES.length - 1)
        : Math.max(currentIdx - 1, 0);
      return TIME_RANGES[nextIdx].value;
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "[") {
        e.preventDefault();
        cycleTimeRange("prev");
      } else if (e.key === "]") {
        e.preventDefault();
        cycleTimeRange("next");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cycleTimeRange]);

  // Reset breakdown expansion when switching time ranges
  useEffect(() => {
    setBreakdownExpanded(false);
  }, [days]);

  // Compute trends: compare first half vs second half with percentage change
  const trends = useMemo(() => {
    if (!analytics || analytics.daily.length < 2) return {
      cost: "flat" as const, costPct: 0,
      tokens: "flat" as const, tokensPct: 0,
      errors: "flat" as const, errorsPct: 0,
    };

    const mid = Math.floor(analytics.daily.length / 2);
    const firstHalf = analytics.daily.slice(0, mid);
    const secondHalf = analytics.daily.slice(mid);

    const sumCost = (arr: typeof firstHalf) => arr.reduce((s, d) => s + d.cost, 0);
    const sumTokens = (arr: typeof firstHalf) => arr.reduce((s, d) => s + d.tokens, 0);
    const sumErrors = (arr: typeof firstHalf) => arr.reduce((s, d) => s + d.errors, 0);

    const calcTrend = (first: number, second: number) => {
      const pct = first > 0 ? ((second - first) / first) * 100 : (second > 0 ? 100 : 0);
      const direction = second > first * 1.1 ? "up" as const : second < first * 0.9 ? "down" as const : "flat" as const;
      return { direction, pct };
    };

    const cost = calcTrend(sumCost(firstHalf), sumCost(secondHalf));
    const tokens = calcTrend(sumTokens(firstHalf), sumTokens(secondHalf));
    const errors = calcTrend(sumErrors(firstHalf), sumErrors(secondHalf));

    return {
      cost: cost.direction, costPct: cost.pct,
      tokens: tokens.direction, tokensPct: tokens.pct,
      errors: errors.direction, errorsPct: errors.pct,
    };
  }, [analytics]);

  const avgCostPerDay = useMemo(() => {
    if (!analytics || analytics.days === 0) return 0;
    return analytics.totalCost / analytics.days;
  }, [analytics]);

  // Cost efficiency: cost per 1K tokens
  const costPer1K = useMemo(() => {
    if (!analytics || analytics.totalTokens === 0) return 0;
    return (analytics.totalCost / analytics.totalTokens) * 1000;
  }, [analytics]);

  // Active days count (days with at least 1 activity)
  const activeDays = useMemo(() => {
    if (!analytics) return 0;
    return analytics.daily.filter(d => d.count > 0).length;
  }, [analytics]);

  // Sparkline data arrays (daily values for trend lines)
  const sparklines = useMemo(() => {
    if (!analytics) return { cost: [], tokens: [], count: [], errors: [] };
    return {
      cost: analytics.daily.map(d => d.cost),
      tokens: analytics.daily.map(d => d.tokens),
      count: analytics.daily.map(d => d.count),
      errors: analytics.daily.map(d => d.errors),
    };
  }, [analytics]);

  const peakHour = useMemo(() => {
    if (!analytics) return null;
    const max = analytics.hourly.reduce((best, h) => h.count > best.count ? h : best, analytics.hourly[0]);
    return max.count > 0 ? max : null;
  }, [analytics]);

  // Peak heatmap hour for selected metric
  const peakHourForMetric = useMemo(() => {
    if (!analytics) return null;
    const max = analytics.hourly.reduce((best, h) => h[heatmapMetric] > best[heatmapMetric] ? h : best, analytics.hourly[0]);
    return max[heatmapMetric] > 0 ? max : null;
  }, [analytics, heatmapMetric]);

  // Max values for daily breakdown mini-bars + peak day detection
  const maxDaily = useMemo(() => {
    if (!analytics) return { count: 1, tokens: 1, cost: 1, peakDay: "" };
    const peakCostDay = analytics.daily.reduce((best, d) => d.cost > best.cost ? d : best, analytics.daily[0]);
    return {
      count: Math.max(...analytics.daily.map(d => d.count), 1),
      tokens: Math.max(...analytics.daily.map(d => d.tokens), 1),
      cost: Math.max(...analytics.daily.map(d => d.cost), 1),
      peakDay: peakCostDay?.day ?? "",
    };
  }, [analytics]);

  // Daily breakdown rows (reversed = most recent first)
  const dailyRows = useMemo(() => {
    if (!analytics) return [];
    return [...analytics.daily].reverse();
  }, [analytics]);

  const showCollapse = dailyRows.length > DAILY_BREAKDOWN_COLLAPSE_THRESHOLD;
  const visibleRows = showCollapse && !breakdownExpanded
    ? dailyRows.slice(0, DAILY_BREAKDOWN_COLLAPSE_THRESHOLD)
    : dailyRows;
  const hiddenCount = dailyRows.length - DAILY_BREAKDOWN_COLLAPSE_THRESHOLD;

  // Shimmer skeleton while loading (consistent with other views)
  if (!analytics && !error) {
    return <AnalyticsSkeleton />;
  }

  // Error state with retry
  if (error && !analytics) {
    return (
      <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-400 font-medium">Failed to load analytics</p>
            <p className="text-sm text-muted-foreground mt-1">{error?.message || "Unknown error"}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => mutate()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analytics) return null;

  return (
    <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
      {/* Connection error banner — shown when fetch fails but stale data is displayed */}
      {error && analytics && (
        <div className="mx-4 mt-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex items-center gap-2 text-xs">
          <RefreshCw className="h-3.5 w-3.5 text-amber-400 animate-spin flex-shrink-0" />
          <span className="text-amber-300">Connection lost — retrying...</span>
        </div>
      )}
      <CardHeader className="pb-0 flex-shrink-0 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Usage Analytics</CardTitle>
          <div className="flex items-center gap-1">
            {TIME_RANGES.map((range, idx) => (
              <TooltipProvider key={range.value}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={days === range.value ? "secondary" : "ghost"}
                      size="sm"
                      className="text-xs h-7 px-2"
                      onClick={() => setDays(range.value)}
                    >
                      {range.label}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-[10px]">
                    {idx === 0 ? "[" : idx === TIME_RANGES.length - 1 ? "]" : `[ / ]`} to cycle
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        </div>
        {/* Insights strip — auto-generated takeaways */}
        <InsightsStrip analytics={analytics} days={days} />
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-4 space-y-6 pt-2">
        {/* Summary Stats — 5 cards on desktop, 2+3 on mobile */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard
            label="Total Cost"
            value={formatCost(analytics.totalCost)}
            icon={DollarSign}
            color="bg-emerald-500/15 text-emerald-400"
            trend={trends.cost}
            trendPercent={trends.costPct}
            trendSemantic="negative"
            subtitle={`~${formatCost(avgCostPerDay)}/day avg`}
            sparklineData={sparklines.cost}
            sparklineColor="rgb(16 185 129)"
          />
          <StatCard
            label="Total Tokens"
            value={formatTokens(analytics.totalTokens)}
            icon={Zap}
            color="bg-blue-500/15 text-blue-400"
            trend={trends.tokens}
            trendPercent={trends.tokensPct}
            trendSemantic="neutral"
            subtitle={`${analytics.models.length} model${analytics.models.length !== 1 ? "s" : ""} used`}
            sparklineData={sparklines.tokens}
            sparklineColor="rgb(59 130 246)"
          />
          <StatCard
            label="Efficiency"
            value={costPer1K > 0 ? formatCost(costPer1K) : "\u2014"}
            icon={Gauge}
            color="bg-cyan-500/15 text-cyan-400"
            subtitle="cost per 1K tokens"
          />
          <StatCard
            label="Activities"
            value={analytics.totalActivities.toLocaleString()}
            icon={Activity}
            color="bg-purple-500/15 text-purple-400"
            subtitle={`${activeDays} of ${days}d active (${days > 0 ? Math.round((activeDays / days) * 100) : 0}%)`}
            sparklineData={sparklines.count}
            sparklineColor="rgb(168 85 247)"
          />
          <StatCard
            label="Errors"
            value={analytics.totalErrors.toLocaleString()}
            icon={AlertTriangle}
            color={analytics.totalErrors > 0 ? "bg-red-500/15 text-red-400" : "bg-gray-500/15 text-gray-400"}
            trend={trends.errors}
            trendPercent={trends.errorsPct}
            trendSemantic="negative"
            subtitle={analytics.totalActivities > 0 ? `${((analytics.totalErrors / analytics.totalActivities) * 100).toFixed(1)}% error rate` : undefined}
            sparklineData={sparklines.errors}
            sparklineColor="rgb(239 68 68)"
          />
        </div>

        {/* Model Cost Bar — stacked horizontal bar showing cost proportions */}
        <ModelCostBar models={analytics.models} totalCost={analytics.totalCost} />

        {/* Daily Cost Chart */}
        <div className="rounded-xl border border-border/50 bg-card/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Daily Cost</h3>
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              {formatCost(analytics.totalCost)} total
            </Badge>
          </div>
          <BarChart
            data={analytics.daily}
            valueKey="cost"
            labelKey="day"
            formatValue={formatCost}
            formatLabel={formatShortDay}
            color="rgb(16 185 129)"
          />
        </div>

        {/* Daily Token Chart */}
        <div className="rounded-xl border border-border/50 bg-card/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Daily Tokens</h3>
            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">
              {formatTokens(analytics.totalTokens)} total
            </Badge>
          </div>
          <BarChart
            data={analytics.daily}
            valueKey="tokens"
            labelKey="day"
            formatValue={formatTokens}
            formatLabel={formatShortDay}
            color="rgb(59 130 246)"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Model Breakdown with cost efficiency */}
          <div className="rounded-xl border border-border/50 bg-card/30 p-4">
            <h3 className="text-sm font-medium mb-3">Model Breakdown</h3>
            {analytics.models.length === 0 ? (
              <p className="text-xs text-muted-foreground">No model usage data</p>
            ) : (
              <div className="space-y-3">
                {analytics.models.map((m) => {
                  const colors = getModelColor(m.model);
                  const pct = analytics.totalTokens > 0 ? (m.tokens / analytics.totalTokens) * 100 : 0;
                  const modelCostPer1K = m.tokens > 0 ? (m.cost / m.tokens) * 1000 : 0;
                  return (
                    <div key={m.model} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                          <span className={`font-medium ${colors.text}`}>{m.model}</span>
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>{formatTokens(m.tokens)}</span>
                          <span className="text-emerald-400">{formatCost(m.cost)}</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${colors.bar} transition-all duration-500`}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-muted-foreground/60">
                        {pct.toFixed(1)}% of tokens &middot; {m.count} call{m.count !== 1 ? "s" : ""}
                        {modelCostPer1K > 0 && (
                          <span className="text-cyan-400/60"> &middot; {formatCost(modelCostPer1K)}/1K tok</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Activity by Hour — with metric toggle */}
          <div className="rounded-xl border border-border/50 bg-card/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Activity by Hour</h3>
              <div className="flex items-center gap-1">
                {peakHourForMetric && (
                  <Badge variant="outline" className="text-[10px] mr-1">
                    Peak: {formatHour(peakHourForMetric.hour)}
                  </Badge>
                )}
              </div>
            </div>
            {/* Metric toggle pills */}
            <div className="flex gap-1 mb-3" data-testid="heatmap-metric-toggle">
              {HEATMAP_METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setHeatmapMetric(m.key)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${
                    heatmapMetric === m.key
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <HourlyHeatmap data={analytics.hourly} valueKey={heatmapMetric} />
          </div>
        </div>

        {/* Activity by Category — stacked bar + legend */}
        <div className="rounded-xl border border-border/50 bg-card/30 p-4">
          <h3 className="text-sm font-medium mb-3">Activity by Category</h3>
          {analytics.categories.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity data</p>
          ) : (
            <CategoryBar categories={analytics.categories} total={analytics.totalActivities} />
          )}
        </div>

        {/* Daily Breakdown Table with peak highlighting + collapsible */}
        <div className="rounded-xl border border-border/50 bg-card/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Daily Breakdown</h3>
            {showCollapse && (
              <button
                onClick={() => setBreakdownExpanded(!breakdownExpanded)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                data-testid="breakdown-toggle"
              >
                {breakdownExpanded ? (
                  <>Show less <ChevronUp className="h-3 w-3" /></>
                ) : (
                  <>{hiddenCount} more <ChevronDown className="h-3 w-3" /></>
                )}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/30">
                  <th className="text-left py-2 pr-4 font-medium">Date</th>
                  <th className="text-right py-2 px-2 font-medium">Activities</th>
                  <th className="text-right py-2 px-2 font-medium">Tokens</th>
                  <th className="text-right py-2 px-2 font-medium">Cost</th>
                  <th className="text-right py-2 pl-2 font-medium">Errors</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((d) => {
                  const isPeakCost = d.day === maxDaily.peakDay && d.cost > 0;
                  const isPeakCount = d.count === maxDaily.count && d.count > 0;
                  return (
                    <tr
                      key={d.day}
                      className={`border-b border-border/10 transition-colors ${
                        isPeakCost
                          ? "bg-emerald-500/5 hover:bg-emerald-500/10"
                          : "hover:bg-muted/20"
                      }`}
                    >
                      <td className="py-1.5 pr-4 font-mono text-muted-foreground whitespace-nowrap">
                        {formatShortDay(d.day)}
                        {isPeakCost && (
                          <span className="ml-1.5 text-[9px] text-emerald-400 font-sans" title="Highest cost day">peak</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right whitespace-nowrap">
                        <span className={isPeakCount ? "font-semibold" : ""}>{d.count}</span>
                        <MiniBar value={d.count} max={maxDaily.count} color="bg-purple-500/50" />
                      </td>
                      <td className="py-1.5 px-2 text-right text-blue-400 whitespace-nowrap">
                        {d.tokens > 0 ? formatTokens(d.tokens) : "\u2014"}
                        {d.tokens > 0 && <MiniBar value={d.tokens} max={maxDaily.tokens} color="bg-blue-500/50" />}
                      </td>
                      <td className={`py-1.5 px-2 text-right whitespace-nowrap ${isPeakCost ? "text-emerald-300 font-semibold" : "text-emerald-400"}`}>
                        {d.cost > 0 ? formatCost(d.cost) : "\u2014"}
                        {d.cost > 0 && <MiniBar value={d.cost} max={maxDaily.cost} color="bg-emerald-500/50" />}
                      </td>
                      <td className={`py-1.5 pl-2 text-right ${d.errors > 0 ? "text-red-400" : "text-muted-foreground/40"}`}>
                        {d.errors > 0 ? d.errors : "\u2014"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Collapsed summary row */}
          {showCollapse && !breakdownExpanded && (
            <button
              onClick={() => setBreakdownExpanded(true)}
              className="w-full mt-2 py-1.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/10 rounded-md transition-colors text-center"
            >
              Show {hiddenCount} older day{hiddenCount !== 1 ? "s" : ""}...
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
