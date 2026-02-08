"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState, useMemo, useEffect, useRef } from "react";
import type { CronJob } from "@/types";

function parseScheduleToDay(schedule: string): number[] {
  // Parse cron-like schedule to days of week (0=Sun, 6=Sat)
  const lower = schedule.toLowerCase();
  
  // Explicit daily patterns
  if (lower.includes("daily") || lower.includes("every day")) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  
  // "every X hours/minutes" patterns = daily (but handled separately for times)
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
    // Match whole words only to avoid "sun" matching "sunday" twice
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(schedule) && !days.includes(value)) {
      days.push(value);
    }
  }
  
  // If no specific days found, assume daily
  return days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6];
}

function getTimesFromSchedule(
  schedule: string,
  nextRun?: number
): { hour: number; minute: number; isBanner?: boolean }[] {
  // Handle "every X hours" or "every Xh" - show as banner if too frequent (<=6 hours)
  const everyHoursMatch = schedule.match(/every\s+(\d+)\s*(?:hours?|h)\b/i);
  if (everyHoursMatch) {
    const interval = parseInt(everyHoursMatch[1]);
    // If 6 hours or less, show as banner (too frequent for calendar grid)
    if (interval <= 6) {
      return [{ hour: 0, minute: 0, isBanner: true }];
    }
    // Otherwise show on calendar
    const times: { hour: number; minute: number }[] = [];
    for (let hour = 0; hour < 24; hour += interval) {
      times.push({ hour, minute: 0 });
    }
    return times;
  }
  
  // Handle "every X minutes" or "every Xm" - very frequent, mark as banner
  const everyMinutesMatch = schedule.match(/every\s+(\d+)\s*(?:minutes?|m)\b/i);
  if (everyMinutesMatch) {
    const interval = parseInt(everyMinutesMatch[1]);
    // Always show as banner (too frequent for calendar)
    if (interval < 120) {
      return [{ hour: 0, minute: 0, isBanner: true }];
    }
    // For 60+ minute intervals, show hourly instances
    const times: { hour: number; minute: number }[] = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += interval) {
        times.push({ hour, minute });
      }
    }
    return times;
  }
  
  // Handle "every X days" - use nextRun to determine which day to show
  const everyDaysMatch = schedule.match(/every\s+(\d+)\s+days?/i);
  if (everyDaysMatch && nextRun) {
    const nextRunDate = new Date(nextRun);
    return [{ hour: nextRunDate.getHours(), minute: nextRunDate.getMinutes() }];
  }
  
  // Extract explicit time(s) from schedule string (handles "10:00am", "11:00pm", "14:30")
  // Also handles multiple times like "12:00am, 6:00am, 12:00pm, 6:00pm"
  const timeMatches = schedule.matchAll(/(\d{1,2}):(\d{2})\s*(am|pm)?/gi);
  const times: { hour: number; minute: number }[] = [];
  for (const match of timeMatches) {
    let hour = parseInt(match[1]);
    const minute = parseInt(match[2]);
    const meridian = match[3]?.toLowerCase();
    if (meridian === "pm" && hour !== 12) hour += 12;
    if (meridian === "am" && hour === 12) hour = 0;
    times.push({ hour, minute });
  }
  if (times.length > 0) {
    return times;
  }
  
  // Handle "10am" / "11pm" without colon
  const hourMatch = schedule.match(/(\d{1,2})\s*(am|pm)/i);
  if (hourMatch) {
    let hour = parseInt(hourMatch[1]);
    if (hourMatch[2].toLowerCase() === "pm" && hour !== 12) hour += 12;
    if (hourMatch[2].toLowerCase() === "am" && hour === 12) hour = 0;
    return [{ hour, minute: 0 }];
  }
  
  return [];
}

function formatTime(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

function getWeekDates(): Date[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek);
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

function getModelColorLight(model?: string): string {
  if (!model) return "bg-gray-500/20 hover:bg-gray-500/30 border-gray-500/40";
  const lowerModel = model.toLowerCase();
  
  if (lowerModel.includes("haiku")) return "bg-green-500/20 hover:bg-green-500/30 border-green-500/40";
  if (lowerModel.includes("sonnet")) return "bg-blue-500/20 hover:bg-blue-500/30 border-blue-500/40";
  if (lowerModel.includes("opus")) return "bg-purple-500/20 hover:bg-purple-500/30 border-purple-500/40";
  
  return "bg-gray-500/20 hover:bg-gray-500/30 border-gray-500/40";
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_HEIGHT = 60; // pixels per hour
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

export function CalendarView() {
  const cronJobs = useQuery(api.cronJobs.list) as CronJob[] | undefined;
  const [selectedJob, setSelectedJob] = useState<CronJob | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  
  const weekDates = useMemo(() => {
    if (!currentTime) return [];
    return getWeekDates();
  }, [currentTime ? currentTime.toDateString() : null]);
  
  // Initialize time on client only (avoids hydration mismatch)
  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);
  
  // Scroll to current hour on mount
  useEffect(() => {
    if (scrollContainerRef.current && !hasScrolledRef.current) {
      const now = new Date();
      const currentHour = now.getHours();
      // Scroll to 2 hours before current time for context
      const scrollTarget = Math.max(0, currentHour - 2) * HOUR_HEIGHT;
      scrollContainerRef.current.scrollTop = scrollTarget;
      hasScrolledRef.current = true;
    }
  }, [cronJobs]);
  
  const { scheduledTasks, bannerTasks } = useMemo((): { 
    scheduledTasks: ScheduledTask[]; 
    bannerTasks: BannerTask[] 
  } => {
    if (!cronJobs) return { scheduledTasks: [], bannerTasks: [] };
    
    const tasks: ScheduledTask[] = [];
    const banners: BannerTask[] = [];
    
    for (const job of cronJobs) {
      const times = getTimesFromSchedule(job.schedule, job.nextRun);
      
      // Check if any time is marked as banner (frequent tasks)
      if (times.some(t => t.isBanner)) {
        banners.push({
          job,
          schedule: job.schedule,
        });
        continue;
      }
      
      // Handle "every X days" - show on days within the week based on nextRun
      const everyDaysMatch = job.schedule.match(/every\s+(\d+)\s+days?/i);
      if (everyDaysMatch && job.nextRun) {
        const intervalDays = parseInt(everyDaysMatch[1]);
        const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
        const nextRunDate = new Date(job.nextRun);
        
        // Get week start/end timestamps
        const weekStart = new Date(weekDates[0]);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekDates[6]);
        weekEnd.setHours(23, 59, 59, 999);
        
        // Find all occurrences within the week by iterating from nextRun backwards and forwards
        let checkDate = new Date(job.nextRun);
        
        // Go backwards to find occurrences before nextRun
        while (checkDate.getTime() > weekStart.getTime()) {
          checkDate = new Date(checkDate.getTime() - intervalMs);
        }
        // Now move forward through the week
        checkDate = new Date(checkDate.getTime() + intervalMs);
        
        while (checkDate.getTime() <= weekEnd.getTime()) {
          const checkDateOnly = new Date(checkDate);
          checkDateOnly.setHours(0, 0, 0, 0);
          
          // Find which day of the week this falls on
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
        // Check if this is a one-time "at" schedule (e.g., "once at 2/1/2026, 1:55:06 PM")
        const onceAtMatch = job.schedule.match(/once at/i);
        if (onceAtMatch) {
          // For one-time tasks, only show if the scheduled date is within this week
          // Skip disabled one-time tasks entirely (they're in the past)
          if (!job.enabled) continue;
          
          // Try to extract the date from nextRun or lastRun
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
        
        // Regular daily/weekly schedules
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
  
  // Calculate current time indicator position
  const currentTimePosition = useMemo(() => {
    if (!currentTime) return { dayIndex: 0, topPosition: 0 };
    const now = currentTime;
    const dayIndex = now.getDay();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const topPosition = (hour * HOUR_HEIGHT) + (minute / 60 * HOUR_HEIGHT);
    
    return { dayIndex, topPosition };
  }, [currentTime]);

  if (!currentTime || weekDates.length === 0) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <CardTitle className="text-lg font-semibold">Weekly Schedule</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="text-lg font-semibold">Weekly Schedule</CardTitle>
      </CardHeader>
      
      {/* Frequent tasks banner */}
      {bannerTasks.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {bannerTasks.map(task => (
            <button
              key={task.job._id}
              onClick={() => setSelectedJob(task.job)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs border transition-colors ${
                task.job.enabled
                  ? getModelColorLight(task.job.model)
                  : "bg-muted/50 hover:bg-muted border-muted-foreground/20 opacity-60"
              }`}
            >
              <span className={`font-semibold ${task.job.enabled ? "" : "line-through"}`}>
                {task.job.name}
              </span>
              <span className="opacity-60">•</span>
              <span className="opacity-70">{task.schedule}</span>
            </button>
          ))}
        </div>
      )}
      
      <CardContent className="flex-1 overflow-hidden p-0">
        <div className="h-full flex flex-col">
          {/* Header with day names */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-background sticky top-0 z-10">
            <div className="border-r" /> {/* Empty corner */}
            {weekDates.map((date, dayIndex) => {
              const isToday = currentTime && date.toDateString() === currentTime.toDateString();
              
              return (
                <div
                  key={dayIndex}
                  className={`text-center py-3 px-2 border-r ${
                    isToday ? "bg-primary/5" : ""
                  }`}
                >
                  <div className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    <span className="hidden sm:inline">{DAY_NAMES[dayIndex]}</span>
                    <span className="sm:hidden">{DAY_NAMES_SHORT[dayIndex]}</span>
                  </div>
                  <div className={`text-lg font-semibold ${isToday ? "text-primary" : ""}`}>
                    {date.getDate()}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Scrollable time grid */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-auto">
            <div className="grid grid-cols-[60px_repeat(7,1fr)] relative min-w-[800px]">
              {/* Time labels and grid */}
              {HOURS.map((hour) => (
                <div key={hour} className="contents">
                  {/* Time label */}
                  <div
                    className="border-r border-b px-2 py-1 text-xs text-muted-foreground text-right sticky left-0 bg-background z-[5]"
                    style={{ height: `${HOUR_HEIGHT}px` }}
                  >
                    {formatTime(hour)}
                  </div>
                  
                  {/* Day cells */}
                  {weekDates.map((date, dayIndex) => {
                    const isToday = currentTime && date.toDateString() === currentTime.toDateString();
                    
                    return (
                      <div
                        key={`${hour}-${dayIndex}`}
                        className={`border-r border-b relative overflow-hidden ${
                          isToday ? "bg-primary/5" : ""
                        }`}
                        style={{ height: `${HOUR_HEIGHT}px` }}
                      />
                    );
                  })}
                </div>
              ))}
              
              {/* Scheduled tasks - positioned absolutely */}
              {(() => {
                // Group tasks by day and hour to handle overlaps
                const taskGroups: Record<string, ScheduledTask[]> = {};
                scheduledTasks.forEach(task => {
                  const key = `${task.dayIndex}-${task.hour}`;
                  if (!taskGroups[key]) taskGroups[key] = [];
                  taskGroups[key].push(task);
                });
                
                return scheduledTasks.map((task, idx) => {
                  const key = `${task.dayIndex}-${task.hour}`;
                  const group = taskGroups[key];
                  const indexInGroup = group.findIndex(t => t.job._id === task.job._id && t.dayIndex === task.dayIndex);
                  const groupSize = group.length;
                  
                  // Horizontal stacking - divide cell width among tasks
                  const maxVisible = 3;
                  if (indexInGroup >= maxVisible) return null;
                  
                  const visibleCount = Math.min(groupSize, maxVisible);
                  const topPosition = (task.hour * HOUR_HEIGHT) + 2;
                  const cellWidth = `((100% - 60px) / 7)`;
                  const taskWidthPercent = 100 / visibleCount;
                  const leftOffset = taskWidthPercent * indexInGroup;
                  
                  return (
                    <button
                      key={`${task.job._id}-${task.dayIndex}-${idx}`}
                      onClick={() => setSelectedJob(task.job)}
                      className={`absolute border rounded-sm px-1 py-0.5 text-left transition-all cursor-pointer z-[2] overflow-hidden ${
                        task.job.enabled
                          ? getModelColorLight(task.job.model)
                          : "bg-muted/50 hover:bg-muted border-muted-foreground/20 opacity-60"
                      }`}
                      style={{
                        top: `${topPosition}px`,
                        left: `calc(60px + ${cellWidth} * ${task.dayIndex} + ${cellWidth} * ${leftOffset / 100})`,
                        width: `calc(${cellWidth} * ${taskWidthPercent / 100} - 3px)`,
                        height: `${HOUR_HEIGHT - 6}px`,
                      }}
                    >
                      <div className={`text-[10px] font-semibold truncate leading-tight ${
                        task.job.enabled ? "" : "line-through"
                      }`}>
                        {task.job.name}
                      </div>
                      <div className="text-[9px] opacity-70 truncate">
                        {formatTime(task.hour)}
                      </div>
                    </button>
                  );
                });
              })()}
              
              {/* "+N more" indicator for slots with more than 3 tasks */}
              {(() => {
                const taskGroups: Record<string, ScheduledTask[]> = {};
                scheduledTasks.forEach(task => {
                  const key = `${task.dayIndex}-${task.hour}`;
                  if (!taskGroups[key]) taskGroups[key] = [];
                  taskGroups[key].push(task);
                });
                
                return Object.entries(taskGroups)
                  .filter(([_, group]) => group.length > 3)
                  .map(([key, group]) => {
                    const [dayIndex, hour] = key.split('-').map(Number);
                    const extraCount = group.length - 3;
                    const cellWidth = `((100% - 60px) / 7)`;
                    
                    return (
                      <div
                        key={`more-${key}`}
                        className="absolute text-[9px] bg-background/80 px-1 rounded text-muted-foreground font-medium z-[4]"
                        style={{
                          top: `${hour * HOUR_HEIGHT + HOUR_HEIGHT - 16}px`,
                          left: `calc(60px + ${cellWidth} * ${dayIndex} + ${cellWidth} - 45px)`,
                        }}
                      >
                        +{extraCount}
                      </div>
                    );
                  });
              })()}
              
              {/* Current time indicator */}
              {weekDates.some(date => currentTime && date.toDateString() === currentTime.toDateString()) && (
                <>
                  {/* Red line */}
                  <div
                    className="absolute left-[60px] right-0 h-[2px] bg-red-500 z-[3] pointer-events-none"
                    style={{
                      top: `${currentTimePosition.topPosition}px`,
                    }}
                  />
                  {/* Red dot at the start */}
                  <div
                    className="absolute w-3 h-3 bg-red-500 rounded-full z-[3] pointer-events-none"
                    style={{
                      top: `${currentTimePosition.topPosition - 5}px`,
                      left: `calc(60px + ((100% - 60px) / 7) * ${currentTimePosition.dayIndex})`,
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
      
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
                  <p className="text-sm">{new Date(selectedJob.lastRun).toLocaleString()}</p>
                </div>
              )}
              {selectedJob.nextRun && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Next Run</label>
                  <p className="text-sm">{new Date(selectedJob.nextRun).toLocaleString()}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
