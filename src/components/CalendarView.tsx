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
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState, useMemo } from "react";
import type { CronJob } from "@/types";

function parseScheduleToDay(schedule: string): number[] {
  // Parse cron-like schedule to days of week (0=Sun, 6=Sat)
  // Simple parser for common patterns
  
  if (schedule.includes("daily") || schedule.includes("every day") || schedule.toLowerCase().includes("every")) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  if (schedule.includes("weekday")) {
    return [1, 2, 3, 4, 5];
  }
  if (schedule.includes("weekend")) {
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
    if (schedule.toLowerCase().includes(key)) {
      days.push(value);
    }
  }
  
  // If no specific days found, assume daily
  return days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6];
}

function getTimeFromSchedule(schedule: string): string {
  // Extract time from schedule string
  const timeMatch = schedule.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
  }
  
  const hourMatch = schedule.match(/(\d{1,2})\s*(am|pm)/i);
  if (hourMatch) {
    let hour = parseInt(hourMatch[1]);
    if (hourMatch[2].toLowerCase() === "pm" && hour !== 12) hour += 12;
    if (hourMatch[2].toLowerCase() === "am" && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, "0")}:00`;
  }
  
  return "—";
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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView() {
  const cronJobs = useQuery(api.cronJobs.list) as CronJob[] | undefined;
  const [selectedJob, setSelectedJob] = useState<CronJob | null>(null);
  
  const weekDates = useMemo(() => getWeekDates(), []);
  
  const jobsByDay = useMemo(() => {
    const byDay: Record<number, CronJob[]> = {
      0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
    };
    
    if (!cronJobs) return byDay;
    
    for (const job of cronJobs) {
      const days = parseScheduleToDay(job.schedule);
      for (const day of days) {
        byDay[day].push(job);
      }
    }
    
    // Sort by time
    for (const day of Object.keys(byDay)) {
      byDay[parseInt(day)].sort((a: CronJob, b: CronJob) => {
        const timeA = getTimeFromSchedule(a.schedule);
        const timeB = getTimeFromSchedule(b.schedule);
        return timeA.localeCompare(timeB);
      });
    }
    
    return byDay;
  }, [cronJobs]);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">Weekly Schedule</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2">
          {weekDates.map((date, dayIndex) => {
            const isToday = date.toDateString() === new Date().toDateString();
            const jobs = jobsByDay[dayIndex] || [];
            
            return (
              <div
                key={dayIndex}
                className={`min-h-[300px] rounded-lg border p-2 ${
                  isToday
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card/30"
                }`}
              >
                <div className="text-center mb-2">
                  <div className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {DAY_NAMES[dayIndex]}
                  </div>
                  <div className={`text-lg font-semibold ${isToday ? "text-primary" : ""}`}>
                    {date.getDate()}
                  </div>
                </div>
                
                <div className="space-y-1">
                  {jobs.map((job: CronJob, idx: number) => (
                    <Dialog key={`${job._id}-${dayIndex}-${idx}`}>
                      <DialogTrigger asChild>
                        <button
                          onClick={() => setSelectedJob(job)}
                          className={`w-full text-left p-1.5 rounded text-xs transition-colors ${
                            job.enabled
                              ? "bg-primary/20 hover:bg-primary/30 text-primary-foreground"
                              : "bg-muted/50 hover:bg-muted text-muted-foreground line-through"
                          }`}
                        >
                          <div className="font-medium truncate">{job.name}</div>
                          <div className="text-[10px] opacity-70">
                            {getTimeFromSchedule(job.schedule)}
                          </div>
                        </button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{job.name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 mt-4">
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Schedule</label>
                            <p className="text-sm">{job.schedule}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Command</label>
                            <pre className="text-sm bg-muted p-2 rounded mt-1 overflow-x-auto">
                              {job.command}
                            </pre>
                          </div>
                          <div className="flex gap-4">
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Status</label>
                              <Badge variant={job.enabled ? "default" : "secondary"} className="ml-2">
                                {job.enabled ? "Enabled" : "Disabled"}
                              </Badge>
                            </div>
                            {job.lastRun && (
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">Last Run</label>
                                <p className="text-sm">{new Date(job.lastRun).toLocaleString()}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ))}
                  
                  {jobs.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-4">
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
