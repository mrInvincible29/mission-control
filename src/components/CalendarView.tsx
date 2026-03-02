"use client";

import useSWR, { mutate } from "swr";
import { listCronJobs } from "@/lib/supabase/queries";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Clock, Copy, Check, Filter, Timer } from "lucide-react";
import type { CronJob } from "@/types";
import { CreateCronDialog } from "@/components/CreateCronDialog";
import { useToast } from "@/components/Toast";

function parseScheduleToDay(schedule: string): number[] {
  const lower = schedule.toLowerCase();

  if (lower.includes("daily") || lower.includes("every day")) {
    return [0, 1, 2, 3, 4, 5, 6];
  }

  if (/every\s+\d+\s*(hours?|h|minutes?|m)\b/i.test(schedule)) {
    return [0, 1, 2, 3, 4, 5, 6];
  }

  if (lower.includes("weekday")) {
    return [1, 2, 3, 4, 5];
  }
  if (lower.includes("weekend")) {
    return [0, 6];
  }

  const dayMap: Record<string, number> = {
    sun: 0, sunday: 0,
    mon: 1, monday: 1,
    tue: 2, tuesday: 2,
    wed: 3, wednesday: 3,
    thu: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6,
  };

  const days: number[] = [];
  for (const [key, value] of Object.entries(dayMap)) {
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(schedule) && !days.includes(value)) {
      days.push(value);
    }
  }

  return days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6];
}

// Convert a time from its source timezone to IST (UTC+5:30)
function convertToIST(hour: number, minute: number, sourceTimezone: string): { hour: number; minute: number } {
  const tz = sourceTimezone.toLowerCase();
  
  // If already IST, no conversion needed
  if (tz.includes('ist') || tz.includes('kolkata') || tz.includes('mumbai')) {
    return { hour, minute };
  }
  
  // If UTC, add 5:30
  if (tz.includes('utc') || tz === '') {
    let newMinute = minute + 30;
    let newHour = hour + 5;
    if (newMinute >= 60) {
      newMinute -= 60;
      newHour += 1;
    }
    if (newHour >= 24) newHour -= 24;
    return { hour: newHour, minute: newMinute };
  }
  
  // Unknown timezone, return as-is
  return { hour, minute };
}

// Detect timezone from schedule string
function detectTimezone(schedule: string): string {
  if (/\bIST\b/i.test(schedule) || /kolkata/i.test(schedule)) return 'IST';
  if (/\bUTC\b/i.test(schedule)) return 'UTC';
  return 'UTC'; // default to UTC
}

function getTimesFromSchedule(
  schedule: string,
  nextRun?: number
): { hour: number; minute: number; isBanner?: boolean }[] {
  const sourceTz = detectTimezone(schedule);
  
  const everyHoursMatch = schedule.match(/every\s+(\d+)\s*(?:hours?|h)\b/i);
  if (everyHoursMatch) {
    const interval = parseInt(everyHoursMatch[1]);
    if (interval <= 6) {
      return [{ hour: 0, minute: 0, isBanner: true }];
    }
    const times: { hour: number; minute: number }[] = [];
    for (let hour = 0; hour < 24; hour += interval) {
      const ist = convertToIST(hour, 0, sourceTz);
      times.push(ist);
    }
    return times;
  }

  const everyMinutesMatch = schedule.match(/every\s+(\d+)\s*(?:minutes?|m)\b/i);
  if (everyMinutesMatch) {
    const interval = parseInt(everyMinutesMatch[1]);
    if (interval < 120) {
      return [{ hour: 0, minute: 0, isBanner: true }];
    }
    const times: { hour: number; minute: number }[] = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += interval) {
        const ist = convertToIST(hour, minute, sourceTz);
        times.push(ist);
      }
    }
    return times;
  }

  const everyDaysMatch = schedule.match(/every\s+(\d+)\s+days?/i);
  if (everyDaysMatch && nextRun) {
    // nextRun is Unix timestamp — convert to IST directly
    const nextRunDate = new Date(nextRun);
    const istOffset = 5.5 * 60; // IST = UTC+5:30 in minutes
    const utcMinutes = nextRunDate.getUTCHours() * 60 + nextRunDate.getUTCMinutes();
    const istMinutes = utcMinutes + istOffset;
    const hour = Math.floor((istMinutes % 1440) / 60);
    const minute = istMinutes % 60;
    return [{ hour, minute }];
  }

  const timeMatches = schedule.matchAll(/(\d{1,2}):(\d{2})\s*(am|pm)?/gi);
  const times: { hour: number; minute: number }[] = [];
  for (const match of timeMatches) {
    let hour = parseInt(match[1]);
    const minute = parseInt(match[2]);
    const meridian = match[3]?.toLowerCase();
    if (meridian === "pm" && hour !== 12) hour += 12;
    if (meridian === "am" && hour === 12) hour = 0;
    const ist = convertToIST(hour, minute, sourceTz);
    times.push(ist);
  }
  if (times.length > 0) {
    return times;
  }

  const hourMatch = schedule.match(/(\d{1,2})\s*(am|pm)/i);
  if (hourMatch) {
    let hour = parseInt(hourMatch[1]);
    if (hourMatch[2].toLowerCase() === "pm" && hour !== 12) hour += 12;
    if (hourMatch[2].toLowerCase() === "am" && hour === 12) hour = 0;
    const ist = convertToIST(hour, 0, sourceTz);
    return [{ hour: ist.hour, minute: ist.minute }];
  }

  return [];
}

function formatTime12h(hour: number, minute?: number): string {
  const minStr = minute != null && minute > 0 ? `:${String(minute).padStart(2, '0')}` : '';
  if (hour === 0) return `12${minStr} AM`;
  if (hour < 12) return `${hour}${minStr} AM`;
  if (hour === 12) return `12${minStr} PM`;
  return `${hour - 12}${minStr} PM`;
}

function getWeekDates(referenceDate: Date): Date[] {
  const dayOfWeek = referenceDate.getDay();
  const startOfWeek = new Date(referenceDate);
  startOfWeek.setDate(referenceDate.getDate() - dayOfWeek);
  startOfWeek.setHours(0, 0, 0, 0);

  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    dates.push(date);
  }
  return dates;
}

function getModelColor(model?: string): string {
  if (!model) return "bg-gray-500";
  const lowerModel = model.toLowerCase();

  if (lowerModel.includes("haiku")) return "bg-green-500";
  if (lowerModel.includes("sonnet")) return "bg-blue-500";
  if (lowerModel.includes("opus")) return "bg-purple-500";

  return "bg-gray-500";
}

function getModelBorderColor(model?: string): string {
  if (!model) return "border-l-gray-500";
  const lowerModel = model.toLowerCase();

  if (lowerModel.includes("haiku")) return "border-l-green-500";
  if (lowerModel.includes("sonnet")) return "border-l-blue-500";
  if (lowerModel.includes("opus")) return "border-l-purple-500";

  return "border-l-gray-500";
}

function getModelColorLight(model?: string): string {
  if (!model) return "bg-gray-500/20 hover:bg-gray-500/30";
  const lowerModel = model.toLowerCase();

  if (lowerModel.includes("haiku")) return "bg-green-500/20 hover:bg-green-500/30";
  if (lowerModel.includes("sonnet")) return "bg-blue-500/20 hover:bg-blue-500/30";
  if (lowerModel.includes("opus")) return "bg-purple-500/20 hover:bg-purple-500/30";

  return "bg-gray-500/20 hover:bg-gray-500/30";
}

function formatMonthYear(dates: Date[]): string {
  if (dates.length === 0) return "";
  const first = dates[0];
  const last = dates[dates.length - 1];
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthNamesShort = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  if (first.getFullYear() !== last.getFullYear()) {
    return `${monthNamesShort[first.getMonth()]} ${first.getFullYear()} – ${monthNamesShort[last.getMonth()]} ${last.getFullYear()}`;
  }
  if (first.getMonth() !== last.getMonth()) {
    return `${monthNamesShort[first.getMonth()]} – ${monthNamesShort[last.getMonth()]} ${first.getFullYear()}`;
  }
  return `${monthNames[first.getMonth()]} ${first.getFullYear()}`;
}

const DAY_NAMES_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const HOUR_HEIGHT = 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface ScheduledTask {
  job: CronJob;
  dayIndex: number;
  hour: number;
  minute: number;
}

interface BannerTask {
  job: CronJob;
  schedule: string;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatRelativeShort(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function getModelLabel(model?: string): string {
  if (!model) return "unknown";
  const lower = model.toLowerCase();
  if (lower.includes("haiku")) return "Haiku";
  if (lower.includes("sonnet")) return "Sonnet";
  if (lower.includes("opus")) return "Opus";
  return model;
}

type ModelFilter = "all" | "haiku" | "sonnet" | "opus";

function matchesModelFilter(model: string | undefined, filter: ModelFilter): boolean {
  if (filter === "all") return true;
  if (!model) return false;
  return model.toLowerCase().includes(filter);
}

/** Compact "Next Up" bar showing upcoming cron jobs with countdowns */
function NextUpBar({ jobs, currentTime, onJobClick }: {
  jobs: CronJob[];
  currentTime: Date;
  onJobClick: (job: CronJob) => void;
}) {
  const upcoming = useMemo(() => {
    const now = currentTime.getTime();
    return jobs
      .filter(j => j.enabled && j.nextRun && j.nextRun > now)
      .sort((a, b) => (a.nextRun || 0) - (b.nextRun || 0))
      .slice(0, 3);
  }, [jobs, currentTime]);

  if (upcoming.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-muted/20 overflow-x-auto" data-testid="next-up-bar">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 font-medium flex-shrink-0 uppercase tracking-wider">
        <Timer className="h-3 w-3" />
        Next
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {upcoming.map((job, i) => {
          const timeUntil = (job.nextRun || 0) - currentTime.getTime();
          return (
            <button
              key={job.id}
              onClick={() => onJobClick(job)}
              className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer border border-border/30 hover:border-border/60 bg-card/40 hover:bg-card/60 ${
                i === 0 ? "ring-1 ring-primary/20" : ""
              }`}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getModelColor(job.model)}`} />
              <span className="font-medium truncate max-w-[120px]">{job.name}</span>
              <span className={`font-mono text-[10px] flex-shrink-0 ${
                timeUntil < 3600000 ? "text-amber-400" : "text-muted-foreground"
              }`}>
                {formatCountdown(timeUntil)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Model filter chip bar */
function ModelFilterBar({
  filter,
  onChange,
  counts
}: {
  filter: ModelFilter;
  onChange: (f: ModelFilter) => void;
  counts: Record<ModelFilter, number>;
}) {
  const filters: { value: ModelFilter; label: string; color: string }[] = [
    { value: "all", label: "All", color: "" },
    { value: "haiku", label: "Haiku", color: "bg-green-500" },
    { value: "sonnet", label: "Sonnet", color: "bg-blue-500" },
    { value: "opus", label: "Opus", color: "bg-purple-500" },
  ];

  return (
    <div className="flex items-center gap-1" data-testid="model-filter">
      <Filter className="h-3 w-3 text-muted-foreground/40 mr-0.5" />
      {filters.map(f => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
            filter === f.value
              ? "bg-primary/15 text-primary border border-primary/30"
              : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50 border border-transparent"
          }`}
        >
          {f.color && <span className={`w-1.5 h-1.5 rounded-full ${f.color}`} />}
          {f.label}
          {counts[f.value] > 0 && (
            <span className="text-[9px] opacity-60">{counts[f.value]}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function TaskCardPopover({ job }: { job: CronJob }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm">{job.name}</span>
        <Badge variant={job.enabled ? "default" : "secondary"} className="text-[10px] h-4">
          {job.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground">{job.schedule}</div>
      {job.model && (
        <div className="flex items-center gap-1.5 text-xs">
          <div className={`w-2.5 h-2.5 rounded-full ${getModelColor(job.model)}`} />
          <span>{job.model}</span>
        </div>
      )}
      {job.nextRun && (
        <div className="text-xs text-muted-foreground">
          Next: {new Date(job.nextRun).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
        </div>
      )}
      <div className="text-[10px] text-muted-foreground/60 pt-1 border-t border-border/30">
        Click for full details
      </div>
    </div>
  );
}

export function CalendarView() {
  const { data: cronJobs } = useSWR("cron-jobs", listCronJobs, { refreshInterval: 60000 });
  const { toast } = useToast();
  const [selectedJob, setSelectedJob] = useState<CronJob | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<{ scheduleType: string; scheduleValue: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [referenceDate, setReferenceDate] = useState<Date>(() => new Date());
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [isMobile, setIsMobile] = useState(false);
  const [modelFilter, setModelFilter] = useState<ModelFilter>("all");
  const [copiedCommand, setCopiedCommand] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  // Auto-switch to day view on small screens
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
      if (e.matches) setViewMode("day");
    };
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const weekDates = useMemo(() => {
    if (!currentTime) return [];
    return getWeekDates(referenceDate);
  }, [currentTime ? currentTime.toDateString() : null, referenceDate]);

  const visibleDates = useMemo(() => {
    if (viewMode === "week") return weekDates;
    // Day view: show only the referenceDate's day
    const dayOfWeek = referenceDate.getDay();
    return weekDates.length > dayOfWeek ? [weekDates[dayOfWeek]] : [];
  }, [viewMode, weekDates, referenceDate]);

  const isCurrentWeek = useMemo(() => {
    if (!currentTime || weekDates.length === 0) return false;
    const today = new Date();
    return weekDates.some(d => d.toDateString() === today.toDateString());
  }, [currentTime, weekDates]);

  const goToPrev = useCallback(() => {
    setReferenceDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - (viewMode === "week" ? 7 : 1));
      return d;
    });
  }, [viewMode]);

  const goToNext = useCallback(() => {
    setReferenceDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + (viewMode === "week" ? 7 : 1));
      return d;
    });
  }, [viewMode]);

  const goToToday = useCallback(() => {
    setReferenceDate(new Date());
    hasScrolledRef.current = false;
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (res.ok) {
        await mutate("cron-jobs");
        toast("Cron jobs synced", "success");
      } else {
        toast("Sync failed", "error");
      }
    } catch {
      toast("Sync failed — network error", "error");
    } finally {
      setSyncing(false);
    }
  }, [toast]);

  const handleSlotClick = useCallback((date: Date, hour: number, clickY: number, cellTop: number) => {
    // Calculate minute from click position within the cell
    const minuteFraction = Math.max(0, Math.min(1, (clickY - cellTop) / HOUR_HEIGHT));
    const minute = Math.round(minuteFraction * 60 / 15) * 15; // snap to 15-min
    const clampedMinute = minute >= 60 ? 45 : minute;

    // Build datetime-local value in IST (the dialog handles IST→UTC conversion)
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(hour).padStart(2, "0");
    const min = String(clampedMinute).padStart(2, "0");

    setCreatePrefill({
      scheduleType: "once",
      scheduleValue: `${yyyy}-${mm}-${dd}T${hh}:${min}`,
    });
    setShowCreateDialog(true);
  }, []);

  // Initialize time on client only (avoids hydration mismatch)
  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Listen for command palette "open-create-cron" event
  useEffect(() => {
    const handler = () => {
      setCreatePrefill(null);
      setShowCreateDialog(true);
    };
    window.addEventListener("open-create-cron", handler);
    return () => window.removeEventListener("open-create-cron", handler);
  }, []);

  // Scroll to current IST hour on mount or when navigating to current week
  useEffect(() => {
    if (scrollContainerRef.current && !hasScrolledRef.current) {
      const now = new Date();
      const istOffset = 5.5 * 60;
      const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      const istHour = Math.floor(((utcMinutes + istOffset) % 1440) / 60);
      const scrollTarget = Math.max(0, istHour - 2) * HOUR_HEIGHT;
      scrollContainerRef.current.scrollTop = scrollTarget;
      hasScrolledRef.current = true;
    }
  }, [cronJobs, isCurrentWeek]);

  const { scheduledTasks, bannerTasks } = useMemo((): {
    scheduledTasks: ScheduledTask[];
    bannerTasks: BannerTask[]
  } => {
    if (!cronJobs) return { scheduledTasks: [], bannerTasks: [] };

    const tasks: ScheduledTask[] = [];
    const banners: BannerTask[] = [];

    for (const job of cronJobs) {
      const times = getTimesFromSchedule(job.schedule, job.nextRun);

      if (times.some(t => t.isBanner)) {
        banners.push({
          job,
          schedule: job.schedule,
        });
        continue;
      }

      const everyDaysMatch = job.schedule.match(/every\s+(\d+)\s+days?/i);
      if (everyDaysMatch && job.nextRun) {
        const intervalDays = parseInt(everyDaysMatch[1]);
        const intervalMs = intervalDays * 24 * 60 * 60 * 1000;

        const weekStart = new Date(weekDates[0]);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekDates[6]);
        weekEnd.setHours(23, 59, 59, 999);

        let checkDate = new Date(job.nextRun);

        while (checkDate.getTime() > weekStart.getTime()) {
          checkDate = new Date(checkDate.getTime() - intervalMs);
        }
        checkDate = new Date(checkDate.getTime() + intervalMs);

        while (checkDate.getTime() <= weekEnd.getTime()) {
          const checkDateOnly = new Date(checkDate);
          checkDateOnly.setHours(0, 0, 0, 0);

          for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const weekDateOnly = new Date(weekDates[dayIndex]);
            weekDateOnly.setHours(0, 0, 0, 0);

            if (checkDateOnly.getTime() === weekDateOnly.getTime()) {
              for (const time of times) {
                tasks.push({
                  job,
                  dayIndex,
                  hour: time.hour,
                  minute: time.minute,
                });
              }
              break;
            }
          }
          checkDate = new Date(checkDate.getTime() + intervalMs);
        }
      } else {
        const onceAtMatch = job.schedule.match(/once at/i);
        if (onceAtMatch) {
          if (!job.enabled) continue;

          const runTime = job.nextRun || job.lastRun;
          if (runTime) {
            const runDate = new Date(runTime);
            const weekStart = new Date(weekDates[0]);
            weekStart.setHours(0, 0, 0, 0);
            const weekEnd = new Date(weekDates[6]);
            weekEnd.setHours(23, 59, 59, 999);

            if (runDate >= weekStart && runDate <= weekEnd) {
              const dayIndex = runDate.getDay();
              tasks.push({
                job,
                dayIndex,
                hour: runDate.getHours(),
                minute: runDate.getMinutes(),
              });
            }
          }
          continue;
        }

        const days = parseScheduleToDay(job.schedule);

        for (const time of times) {
          for (const dayIndex of days) {
            tasks.push({
              job,
              dayIndex,
              hour: time.hour,
              minute: time.minute,
            });
          }
        }
      }
    }

    return { scheduledTasks: tasks, bannerTasks: banners };
  }, [cronJobs, weekDates]);

  // Model filter counts (unfiltered totals)
  const modelCounts = useMemo((): Record<ModelFilter, number> => {
    if (!cronJobs) return { all: 0, haiku: 0, sonnet: 0, opus: 0 };
    const counts = { all: cronJobs.length, haiku: 0, sonnet: 0, opus: 0 };
    for (const job of cronJobs) {
      const m = (job.model || "").toLowerCase();
      if (m.includes("haiku")) counts.haiku++;
      else if (m.includes("sonnet")) counts.sonnet++;
      else if (m.includes("opus")) counts.opus++;
    }
    return counts;
  }, [cronJobs]);

  // Filter tasks and remap dayIndex to visible column index
  const visibleTasks = useMemo(() => {
    const visibleDayIndices = visibleDates.map(d => {
      return weekDates.findIndex(wd => wd.toDateString() === d.toDateString());
    });

    return scheduledTasks
      .filter(t => visibleDayIndices.includes(t.dayIndex) && matchesModelFilter(t.job.model, modelFilter))
      .map(t => ({
        ...t,
        colIndex: visibleDayIndices.indexOf(t.dayIndex),
      }));
  }, [scheduledTasks, visibleDates, weekDates, modelFilter]);

  // Banner tasks filtered by model
  const visibleBannerTasks = useMemo(() => {
    return bannerTasks.filter(t => matchesModelFilter(t.job.model, modelFilter));
  }, [bannerTasks, modelFilter]);

  // Task count per visible day column (for badges in headers)
  const dayTaskCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const task of visibleTasks) {
      counts[task.colIndex] = (counts[task.colIndex] || 0) + 1;
    }
    // Add banner task count to each day
    if (visibleBannerTasks.length > 0) {
      for (let i = 0; i < visibleDates.length; i++) {
        counts[i] = (counts[i] || 0) + visibleBannerTasks.length;
      }
    }
    return counts;
  }, [visibleTasks, visibleBannerTasks, visibleDates]);

  const currentTimePosition = useMemo(() => {
    if (!currentTime) return { dayIndex: 0, topPosition: 0, visibleColIndex: -1, istTimeLabel: "" };
    const now = currentTime;
    // Convert current time to IST for positioning on the grid
    const istOffset = 5.5 * 60; // IST = UTC+5:30 in minutes
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const istTotalMinutes = (utcMinutes + istOffset) % 1440;
    const istHour = Math.floor(istTotalMinutes / 60);
    const istMinute = Math.floor(istTotalMinutes % 60);

    const dayIndex = now.getDay();
    const topPosition = (istHour * HOUR_HEIGHT) + (istMinute / 60 * HOUR_HEIGHT);

    // Find if today is in visible dates
    const visibleColIndex = visibleDates.findIndex(d => d.toDateString() === now.toDateString());

    // Format IST time for the label
    const istTimeLabel = formatTime12h(istHour, istMinute);

    return { dayIndex, topPosition, visibleColIndex, istTimeLabel };
  }, [currentTime, visibleDates]);

  const colCount = visibleDates.length;
  const gutterWidth = isMobile ? 44 : 60;
  const gridCols = `${gutterWidth}px repeat(${colCount}, 1fr)`;

  if (!currentTime || weekDates.length === 0) {
    return (
      <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
        <CardHeader className="pb-3 flex-shrink-0" />
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
      {/* Navigation header */}
      <CardHeader className="pb-2 flex-shrink-0 px-4 pt-4">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Today button */}
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            className="text-xs"
          >
            Today
          </Button>

          {/* Prev / Next */}
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-xs" onClick={goToPrev}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={goToNext}>
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {/* Month / Year label */}
          <span className="text-sm sm:text-lg font-semibold select-none truncate">
            {viewMode === "day"
              ? referenceDate.toLocaleDateString(undefined, isMobile
                  ? { month: "short", day: "numeric", year: "numeric" }
                  : { weekday: "long", month: "long", day: "numeric", year: "numeric" })
              : formatMonthYear(weekDates)}
          </span>

          {/* Create button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setCreatePrefill(null); setShowCreateDialog(true); }}
            className="text-xs gap-1"
          >
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">New</span>
          </Button>

          {/* Sync button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="text-xs gap-1"
            title="Sync cron jobs with OpenClaw"
          >
            <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Sync</span>
          </Button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Model filter */}
          <div className="hidden sm:flex">
            <ModelFilterBar filter={modelFilter} onChange={setModelFilter} counts={modelCounts} />
          </div>

          {/* View toggle */}
          <div className="bg-muted rounded-lg p-0.5 flex gap-0.5">
            <Button
              variant={viewMode === "day" ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setViewMode("day")}
            >
              Day
            </Button>
            <Button
              variant={viewMode === "week" ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setViewMode("week")}
            >
              Week
            </Button>
          </div>
        </div>
        {/* Mobile model filter row */}
        <div className="flex sm:hidden mt-2">
          <ModelFilterBar filter={modelFilter} onChange={setModelFilter} counts={modelCounts} />
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <div className="h-full flex flex-col">
          {/* Next Up countdown bar */}
          {cronJobs && cronJobs.length > 0 && currentTime && (
            <NextUpBar jobs={cronJobs} currentTime={currentTime} onJobClick={setSelectedJob} />
          )}

          {/* Day headers — Google Calendar style */}
          <div
            className="grid border-b border-border/50 bg-background sticky top-0 z-10"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="border-r border-border/50 flex items-end justify-center pb-1">
              <span className="text-[9px] text-muted-foreground/60 font-medium">IST</span>
            </div>
            {visibleDates.map((date, i) => {
              const isToday = date.toDateString() === currentTime.toDateString();
              const taskCount = dayTaskCounts[i] || 0;

              return (
                <div
                  key={i}
                  className="text-center py-2 px-2 border-r border-border/50"
                >
                  <div className={`text-[10px] font-medium tracking-wider ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {DAY_NAMES_SHORT[date.getDay()]}
                  </div>
                  <div className="relative inline-flex items-center justify-center">
                    <div
                      className={`text-xl sm:text-2xl font-medium mt-0.5 leading-none inline-flex items-center justify-center ${
                        isToday
                          ? "bg-primary text-primary-foreground rounded-full w-8 h-8 sm:w-10 sm:h-10"
                          : ""
                      }`}
                    >
                      {date.getDate()}
                    </div>
                    {taskCount > 0 && (
                      <span
                        className="absolute -top-1 -right-3 min-w-[14px] h-[14px] rounded-full bg-muted text-[9px] font-bold text-muted-foreground inline-flex items-center justify-center px-0.5"
                        data-testid="day-task-count"
                      >
                        {taskCount}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* All-day row */}
          {visibleBannerTasks.length > 0 && (
            <div
              className="grid border-b border-border/50 bg-background"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div className="border-r border-border/50 px-2 py-1.5 text-[10px] text-muted-foreground text-right flex items-start justify-end">
                all-day
              </div>
              <div
                className="py-1.5 px-1 flex flex-wrap gap-1 border-r border-border/50"
                style={{ gridColumn: `2 / ${colCount + 2}` }}
              >
                {visibleBannerTasks.map(task => (
                  <HoverCard key={task.job.id} openDelay={300} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <button
                        onClick={() => setSelectedJob(task.job)}
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border-l-[3px] transition-colors cursor-pointer ${
                          task.job.enabled
                            ? `${getModelColorLight(task.job.model)} ${getModelBorderColor(task.job.model)}`
                            : "bg-muted/50 hover:bg-muted border-l-muted-foreground/40 opacity-60"
                        }`}
                      >
                        <span className={`font-semibold ${task.job.enabled ? "" : "line-through"}`}>
                          {task.job.name}
                        </span>
                        <span className="opacity-50">·</span>
                        <span className="opacity-60">{task.schedule}</span>
                      </button>
                    </HoverCardTrigger>
                    <HoverCardContent side="bottom" className="w-64">
                      <TaskCardPopover job={task.job} />
                    </HoverCardContent>
                  </HoverCard>
                ))}
              </div>
            </div>
          )}

          {/* Scrollable time grid */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-auto">
            <div
              className="grid relative"
              style={{
                gridTemplateColumns: gridCols,
                ...(viewMode === "week" && !isMobile ? { minWidth: "800px" } : {}),
              }}
            >
              {/* Time labels and grid */}
              {HOURS.map((hour) => (
                <div key={hour} className="contents">
                  {/* Time label */}
                  <div
                    className="border-r border-b border-border/50 px-2 py-1 text-[11px] text-muted-foreground text-right sticky left-0 bg-background z-[5]"
                    style={{ height: `${HOUR_HEIGHT}px` }}
                  >
                    {formatTime12h(hour)}
                  </div>

                  {/* Day cells */}
                  {visibleDates.map((date, colIdx) => {
                    const isToday = date.toDateString() === currentTime.toDateString();

                    return (
                      <div
                        key={`${hour}-${colIdx}`}
                        className={`border-r border-b border-border/50 relative overflow-hidden cursor-pointer hover:bg-primary/10 transition-colors ${
                          isToday ? "bg-primary/5" : ""
                        }`}
                        style={{ height: `${HOUR_HEIGHT}px` }}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          handleSlotClick(date, hour, e.clientY, rect.top);
                        }}
                      >
                        {/* Half-hour dashed line */}
                        <div
                          className="absolute left-0 right-0 border-t border-dashed border-border/20 pointer-events-none"
                          style={{ top: `${HOUR_HEIGHT / 2}px` }}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Scheduled tasks - positioned absolutely */}
              {(() => {
                // Group tasks by column and hour to handle overlaps
                const taskGroups: Record<string, typeof visibleTasks> = {};
                visibleTasks.forEach(task => {
                  const key = `${task.colIndex}-${task.hour}`;
                  if (!taskGroups[key]) taskGroups[key] = [];
                  taskGroups[key].push(task);
                });

                return visibleTasks.map((task, idx) => {
                  const key = `${task.colIndex}-${task.hour}`;
                  const group = taskGroups[key];
                  const indexInGroup = group.findIndex(t => t.job.id === task.job.id && t.colIndex === task.colIndex);
                  const groupSize = group.length;

                  const maxVisible = 3;
                  if (indexInGroup >= maxVisible) return null;

                  const visibleCount = Math.min(groupSize, maxVisible);
                  const minuteOffset = (task.minute / 60) * HOUR_HEIGHT;
                  const topPosition = (task.hour * HOUR_HEIGHT) + minuteOffset + 2;
                  const cellWidth = `((100% - ${gutterWidth}px) / ${colCount})`;
                  const taskWidthPercent = 100 / visibleCount;
                  const leftOffset = taskWidthPercent * indexInGroup;

                  const isDayView = viewMode === "day";

                  return (
                    <HoverCard key={`${task.job.id}-${task.colIndex}-${idx}`} openDelay={300} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <button
                          onClick={() => setSelectedJob(task.job)}
                          className={`absolute rounded-sm px-1.5 py-0.5 text-left transition-all cursor-pointer z-[2] overflow-hidden border-l-[3px] ${
                            task.job.enabled
                              ? `${getModelColorLight(task.job.model)} ${getModelBorderColor(task.job.model)}`
                              : "bg-muted/50 hover:bg-muted border-l-muted-foreground/40 opacity-60"
                          }`}
                          style={{
                            top: `${topPosition}px`,
                            left: `calc(${gutterWidth}px + ${cellWidth} * ${task.colIndex} + ${cellWidth} * ${leftOffset / 100})`,
                            width: `calc(${cellWidth} * ${taskWidthPercent / 100} - 3px)`,
                            height: `${Math.max(HOUR_HEIGHT - minuteOffset - 6, 20)}px`,
                          }}
                        >
                          <div className={`text-[10px] font-semibold truncate leading-tight ${
                            task.job.enabled ? "" : "line-through"
                          }`}>
                            {task.job.name}
                          </div>
                          {isDayView ? (
                            <>
                              <div className="text-[9px] opacity-70 truncate">
                                {task.job.schedule}
                              </div>
                              {task.job.model && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <div className={`w-1.5 h-1.5 rounded-full ${getModelColor(task.job.model)}`} />
                                  <span className="text-[9px] opacity-60 truncate">{task.job.model}</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-[9px] opacity-70 truncate">
                              {formatTime12h(task.hour, task.minute)}
                            </div>
                          )}
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent side="right" className="w-64">
                        <TaskCardPopover job={task.job} />
                      </HoverCardContent>
                    </HoverCard>
                  );
                });
              })()}

              {/* "+N more" indicator for slots with more than 3 tasks */}
              {(() => {
                const taskGroups: Record<string, typeof visibleTasks> = {};
                visibleTasks.forEach(task => {
                  const key = `${task.colIndex}-${task.hour}`;
                  if (!taskGroups[key]) taskGroups[key] = [];
                  taskGroups[key].push(task);
                });

                return Object.entries(taskGroups)
                  .filter(([_, group]) => group.length > 3)
                  .map(([key, group]) => {
                    const [colIndex, hour] = key.split('-').map(Number);
                    const extraCount = group.length - 3;
                    const cellWidth = `((100% - ${gutterWidth}px) / ${colCount})`;

                    return (
                      <div
                        key={`more-${key}`}
                        className="absolute text-[9px] bg-background/80 px-1 rounded text-muted-foreground font-medium z-[4]"
                        style={{
                          top: `${hour * HOUR_HEIGHT + HOUR_HEIGHT - 16}px`,
                          left: `calc(${gutterWidth}px + ${cellWidth} * ${colIndex} + ${cellWidth} - 45px)`,
                        }}
                      >
                        +{extraCount}
                      </div>
                    );
                  });
              })()}

              {/* Current time indicator */}
              {currentTimePosition.visibleColIndex >= 0 && (
                <>
                  {/* Red line */}
                  <div
                    className="absolute right-0 h-[2px] bg-red-500 z-[3] pointer-events-none"
                    style={{
                      top: `${currentTimePosition.topPosition}px`,
                      left: `${gutterWidth}px`,
                    }}
                  />
                  {/* Pulsing red dot at the left edge of time gutter */}
                  <div
                    className="absolute z-[3] pointer-events-none"
                    style={{
                      top: `${currentTimePosition.topPosition - 5}px`,
                      left: `${gutterWidth - 6}px`,
                    }}
                  >
                    <div className="w-3 h-3 bg-red-500 rounded-full" />
                    <div className="absolute inset-0 w-3 h-3 bg-red-500 rounded-full animate-ping opacity-40" />
                  </div>
                  {/* "Now" time label in the gutter */}
                  <div
                    className="absolute z-[6] pointer-events-none"
                    data-testid="current-time-label"
                    style={{
                      top: `${currentTimePosition.topPosition - 8}px`,
                      left: `2px`,
                    }}
                  >
                    <span className="text-[8px] font-bold text-red-500 bg-background/90 px-0.5 rounded">
                      {currentTimePosition.istTimeLabel}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>

      {/* Create cron dialog */}
      <CreateCronDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        prefill={createPrefill}
        onCreated={handleSync}
      />

      {/* Task details dialog — enhanced layout */}
      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="job-detail-dialog">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {selectedJob?.model && (
                <div className={`w-3 h-12 rounded-full flex-shrink-0 ${getModelColor(selectedJob.model)}`} />
              )}
              <div className="min-w-0">
                <DialogTitle className="text-lg">{selectedJob?.name}</DialogTitle>
                {selectedJob && (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={selectedJob.enabled ? "default" : "secondary"} className="text-[10px] h-5">
                      {selectedJob.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    {selectedJob.model && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${getModelColor(selectedJob.model)}`} />
                        {getModelLabel(selectedJob.model)}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-4 mt-2">
              {/* Schedule & timing */}
              <div className="rounded-lg bg-muted/30 border border-border/30 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{selectedJob.schedule}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {selectedJob.lastRun && (
                    <div>
                      <span className="text-muted-foreground/60 text-[10px] uppercase tracking-wider">Last run</span>
                      <p className="mt-0.5 font-mono">
                        {new Date(selectedJob.lastRun).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{formatRelativeShort(selectedJob.lastRun)}</p>
                    </div>
                  )}
                  {selectedJob.nextRun && (
                    <div>
                      <span className="text-muted-foreground/60 text-[10px] uppercase tracking-wider">Next run</span>
                      <p className="mt-0.5 font-mono">
                        {new Date(selectedJob.nextRun).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                      </p>
                      {selectedJob.nextRun > Date.now() && (
                        <p className="text-[10px] text-amber-400 font-medium">in {formatCountdown(selectedJob.nextRun - Date.now())}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Command */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Prompt / Command</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedJob.command || "");
                      setCopiedCommand(true);
                      setTimeout(() => setCopiedCommand(false), 2000);
                    }}
                  >
                    {copiedCommand ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copiedCommand ? "Copied" : "Copy"}
                  </Button>
                </div>
                <pre className="text-xs bg-black/20 dark:bg-black/40 p-3 rounded-lg whitespace-pre-wrap break-words max-h-[40vh] overflow-y-auto font-mono leading-relaxed border border-border/20">
                  {selectedJob.command}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
