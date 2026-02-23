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
import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, Minus, Zap, DollarSign, Activity, AlertTriangle } from "lucide-react";
import { formatTokens, formatCost, getModelColor } from "@/lib/formatters";

const TIME_RANGES = [
  { label: "7d", value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
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

// Pure SVG bar chart
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
  const padding = 30;
  const barWidth = Math.max(8, (vbWidth - padding * 2 - data.length * barGap) / data.length);
  const totalBarsWidth = data.length * (barWidth + barGap);
  const chartWidth = totalBarsWidth + padding * 2;

  return (
    <TooltipProvider>
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${height + 24}`}
          className="w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map((frac) => (
            <line
              key={frac}
              x1={padding}
              y1={height - height * frac}
              x2={chartWidth - padding}
              y2={height - height * frac}
              stroke="currentColor"
              strokeOpacity={0.06}
              strokeWidth={0.5}
            />
          ))}

          {/* Bars */}
          {data.map((d, i) => {
            const val = d[valueKey] as number;
            const barHeight = (val / maxVal) * (height - 10);
            const x = padding + i * (barWidth + barGap);

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
            const x = padding + i * (barWidth + barGap) + barWidth / 2;
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

// Hourly activity heatmap
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

// Stat card with optional trend
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  trend,
  trendPercent,
  subtitle,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  trend?: "up" | "down" | "flat";
  trendPercent?: number;
  subtitle?: string;
}) {
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
          <span className={`flex items-center gap-0.5 text-xs pb-0.5 ${
            trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-muted-foreground"
          }`}>
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
      {subtitle && (
        <div className="text-[11px] text-muted-foreground mt-1">{subtitle}</div>
      )}
    </div>
  );
}

export function AnalyticsView() {
  const [days, setDays] = useState(14);
  const { data: analytics } = useSWR(
    ["analytics", days],
    () => getAnalytics(days),
    { refreshInterval: 60000 }
  );

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

  const peakHour = useMemo(() => {
    if (!analytics) return null;
    const max = analytics.hourly.reduce((best, h) => h.count > best.count ? h : best, analytics.hourly[0]);
    return max.count > 0 ? max : null;
  }, [analytics]);

  if (!analytics) {
    return (
      <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading analytics...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
      <CardHeader className="pb-2 flex-shrink-0 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Usage Analytics</CardTitle>
          <div className="flex items-center gap-1">
            {TIME_RANGES.map((range) => (
              <Button
                key={range.value}
                variant={days === range.value ? "secondary" : "ghost"}
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setDays(range.value)}
              >
                {range.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-4 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Cost"
            value={formatCost(analytics.totalCost)}
            icon={DollarSign}
            color="bg-emerald-500/15 text-emerald-400"
            trend={trends.cost}
            trendPercent={trends.costPct}
            subtitle={`~${formatCost(avgCostPerDay)}/day avg`}
          />
          <StatCard
            label="Total Tokens"
            value={formatTokens(analytics.totalTokens)}
            icon={Zap}
            color="bg-blue-500/15 text-blue-400"
            trend={trends.tokens}
            trendPercent={trends.tokensPct}
            subtitle={`${analytics.models.length} model${analytics.models.length !== 1 ? "s" : ""} used`}
          />
          <StatCard
            label="Activities"
            value={analytics.totalActivities.toLocaleString()}
            icon={Activity}
            color="bg-purple-500/15 text-purple-400"
            subtitle={`${days}-day window`}
          />
          <StatCard
            label="Errors"
            value={analytics.totalErrors.toLocaleString()}
            icon={AlertTriangle}
            color={analytics.totalErrors > 0 ? "bg-red-500/15 text-red-400" : "bg-gray-500/15 text-gray-400"}
            trend={trends.errors}
            trendPercent={trends.errorsPct}
            subtitle={analytics.totalActivities > 0 ? `${((analytics.totalErrors / analytics.totalActivities) * 100).toFixed(1)}% error rate` : undefined}
          />
        </div>

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
            color="rgb(16 185 129)" // emerald-500
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
            color="rgb(59 130 246)" // blue-500
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Model Breakdown */}
          <div className="rounded-xl border border-border/50 bg-card/30 p-4">
            <h3 className="text-sm font-medium mb-3">Model Breakdown</h3>
            {analytics.models.length === 0 ? (
              <p className="text-xs text-muted-foreground">No model usage data</p>
            ) : (
              <div className="space-y-3">
                {analytics.models.map((m) => {
                  const colors = getModelColor(m.model);
                  const pct = analytics.totalTokens > 0 ? (m.tokens / analytics.totalTokens) * 100 : 0;
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
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Activity by Hour */}
          <div className="rounded-xl border border-border/50 bg-card/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Activity by Hour</h3>
              {peakHour && (
                <Badge variant="outline" className="text-[10px]">
                  Peak: {formatHour(peakHour.hour)}
                </Badge>
              )}
            </div>
            <HourlyHeatmap data={analytics.hourly} valueKey="count" />
          </div>
        </div>

        {/* Activity by Category */}
        <div className="rounded-xl border border-border/50 bg-card/30 p-4">
          <h3 className="text-sm font-medium mb-3">Activity by Category</h3>
          {analytics.categories.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity data</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {analytics.categories.map((c) => {
                const pct = analytics.totalActivities > 0 ? (c.count / analytics.totalActivities) * 100 : 0;
                return (
                  <TooltipProvider key={c.category}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 cursor-default">
                          <span className="text-xs font-medium">{c.category}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {c.count}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{pct.toFixed(0)}%</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        <div>{c.count} activities</div>
                        {c.tokens > 0 && <div>{formatTokens(c.tokens)} tokens</div>}
                        {c.cost > 0 && <div>{formatCost(c.cost)} cost</div>}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          )}
        </div>

        {/* Daily Breakdown Table */}
        <div className="rounded-xl border border-border/50 bg-card/30 p-4">
          <h3 className="text-sm font-medium mb-3">Daily Breakdown</h3>
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
                {[...analytics.daily].reverse().map((d) => (
                  <tr key={d.day} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
                    <td className="py-1.5 pr-4 font-mono text-muted-foreground">{formatShortDay(d.day)}</td>
                    <td className="py-1.5 px-2 text-right">{d.count}</td>
                    <td className="py-1.5 px-2 text-right text-blue-400">
                      {d.tokens > 0 ? formatTokens(d.tokens) : "—"}
                    </td>
                    <td className="py-1.5 px-2 text-right text-emerald-400">
                      {d.cost > 0 ? formatCost(d.cost) : "—"}
                    </td>
                    <td className={`py-1.5 pl-2 text-right ${d.errors > 0 ? "text-red-400" : "text-muted-foreground/40"}`}>
                      {d.errors > 0 ? d.errors : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
