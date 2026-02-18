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
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
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

  // Filter tasks and remap dayIndex to visible column index
  const visibleTasks = useMemo(() => {
    const visibleDayIndices = visibleDates.map(d => {
      // Find the original dayIndex in weekDates
      return weekDates.findIndex(wd => wd.toDateString() === d.toDateString());
    });

    return scheduledTasks
      .filter(t => visibleDayIndices.includes(t.dayIndex))
      .map(t => ({
        ...t,
        colIndex: visibleDayIndices.indexOf(t.dayIndex),
      }));
  }, [scheduledTasks, visibleDates, weekDates]);

  // Banner tasks mapped to visible columns for all-day row
  const visibleBannerTasks = useMemo(() => {
    // Banner tasks appear on every visible day, so just return them as-is
    return bannerTasks;
  }, [bannerTasks]);

  const currentTimePosition = useMemo(() => {
    if (!currentTime) return { dayIndex: 0, topPosition: 0, visibleColIndex: -1 };
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

    return { dayIndex, topPosition, visibleColIndex };
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
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <div className="h-full flex flex-col">
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

              return (
                <div
                  key={i}
                  className="text-center py-2 px-2 border-r border-border/50"
                >
                  <div className={`text-[10px] font-medium tracking-wider ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {DAY_NAMES_SHORT[date.getDay()]}
                  </div>
                  <div
                    className={`text-xl sm:text-2xl font-medium mt-0.5 leading-none inline-flex items-center justify-center ${
                      isToday
                        ? "bg-primary text-primary-foreground rounded-full w-8 h-8 sm:w-10 sm:h-10"
                        : ""
                    }`}
                  >
                    {date.getDate()}
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
                  {/* Red dot at the left edge of time gutter */}
                  <div
                    className="absolute w-3 h-3 bg-red-500 rounded-full z-[3] pointer-events-none"
                    style={{
                      top: `${currentTimePosition.topPosition - 5}px`,
                      left: `${gutterWidth - 6}px`,
                    }}
                  />
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

      {/* Task details dialog */}
      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedJob?.name}</DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-3 mt-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Schedule</label>
                <p className="text-sm">{selectedJob.schedule}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Command</label>
                <pre className="text-sm bg-muted p-2 rounded mt-1 whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto">
                  {selectedJob.command}
                </pre>
              </div>
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <Badge variant={selectedJob.enabled ? "default" : "secondary"} className="ml-2">
                    {selectedJob.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                {selectedJob.model && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-muted-foreground">Model</label>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-3 h-3 rounded-full ${getModelColor(selectedJob.model)}`} />
                      <Badge variant="outline" className="border-border">
                        {selectedJob.model}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
              {selectedJob.lastRun && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Last Run</label>
                  <p className="text-sm">{new Date(selectedJob.lastRun).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
                </div>
              )}
              {selectedJob.nextRun && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Next Run</label>
                  <p className="text-sm">{new Date(selectedJob.nextRun).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
