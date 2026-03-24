"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PingResult {
  /** Unix timestamp in ms */
  ts: number;
  /** "up" | "degraded" | "down" */
  status: "up" | "degraded" | "down";
  /** Response time in ms (null if down) */
  responseTime: number | null;
}

export interface ServiceHistory {
  /** Service name (key) */
  name: string;
  /** Last N ping results, newest last */
  pings: PingResult[];
  /** Uptime percentage (0-100) based on stored pings */
  uptimePercent: number;
  /** Average response time for "up" pings */
  avgResponseTime: number | null;
}

const STORAGE_KEY = "mc-service-history";
const MAX_PINGS = 30;
/** Minimum interval between recording pings (50s) — prevents duplicates from rapid re-renders */
const MIN_INTERVAL_MS = 50_000;

interface StoredHistory {
  /** version for future migrations */
  v: 1;
  /** Map of service name -> ping results */
  services: Record<string, PingResult[]>;
  /** Last recorded timestamp to prevent duplicate entries */
  lastRecorded: number;
}

function loadHistory(): StoredHistory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { v: 1, services: {}, lastRecorded: 0 };
    const parsed = JSON.parse(raw);
    if (parsed?.v === 1) return parsed;
    return { v: 1, services: {}, lastRecorded: 0 };
  } catch {
    return { v: 1, services: {}, lastRecorded: 0 };
  }
}

function saveHistory(history: StoredHistory): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function computeUptime(pings: PingResult[]): number {
  if (pings.length === 0) return 100;
  const upCount = pings.filter((p) => p.status === "up").length;
  return Math.round((upCount / pings.length) * 100);
}

function computeAvgResponseTime(pings: PingResult[]): number | null {
  const upPings = pings.filter((p) => p.responseTime !== null && p.status === "up");
  if (upPings.length === 0) return null;
  const sum = upPings.reduce((acc, p) => acc + (p.responseTime ?? 0), 0);
  return Math.round(sum / upPings.length);
}

interface ServiceData {
  name: string;
  status: "up" | "degraded" | "down";
  responseTime: number | null;
}

/**
 * Tracks service health check results over time in localStorage.
 * Each time `recordPings` is called with fresh service data, it appends
 * a new ping result per service (max 30 per service).
 *
 * Returns computed history with uptime percentages and response time averages.
 */
export function useServiceHistory() {
  const [historyMap, setHistoryMap] = useState<Record<string, ServiceHistory>>({});
  const lastRecordedRef = useRef(0);

  // Load on mount
  useEffect(() => {
    const stored = loadHistory();
    lastRecordedRef.current = stored.lastRecorded;
    const map: Record<string, ServiceHistory> = {};
    for (const [name, pings] of Object.entries(stored.services)) {
      map[name] = {
        name,
        pings,
        uptimePercent: computeUptime(pings),
        avgResponseTime: computeAvgResponseTime(pings),
      };
    }
    setHistoryMap(map);
  }, []);

  const recordPings = useCallback((services: ServiceData[]) => {
    const now = Date.now();

    // Don't record too frequently
    if (now - lastRecordedRef.current < MIN_INTERVAL_MS) return;
    lastRecordedRef.current = now;

    const stored = loadHistory();
    stored.lastRecorded = now;

    for (const svc of services) {
      const existing = stored.services[svc.name] ?? [];
      const ping: PingResult = {
        ts: now,
        status: svc.status,
        responseTime: svc.responseTime,
      };
      // Append and trim to max
      const updated = [...existing, ping].slice(-MAX_PINGS);
      stored.services[svc.name] = updated;
    }

    // Prune services that haven't been seen in current data
    const currentNames = new Set(services.map((s) => s.name));
    for (const name of Object.keys(stored.services)) {
      if (!currentNames.has(name)) {
        // Keep old data but don't add new pings
      }
    }

    saveHistory(stored);

    // Update state
    const map: Record<string, ServiceHistory> = {};
    for (const [name, pings] of Object.entries(stored.services)) {
      map[name] = {
        name,
        pings,
        uptimePercent: computeUptime(pings),
        avgResponseTime: computeAvgResponseTime(pings),
      };
    }
    setHistoryMap(map);
  }, []);

  /** Fleet-wide uptime across all tracked services */
  const fleetUptime = (() => {
    const allServices = Object.values(historyMap);
    if (allServices.length === 0) return null;
    const allPings = allServices.flatMap((s) => s.pings);
    if (allPings.length === 0) return null;
    return computeUptime(allPings);
  })();

  /** Number of total pings recorded (for the oldest service) */
  const totalPings = Math.max(
    ...Object.values(historyMap).map((s) => s.pings.length),
    0
  );

  return { historyMap, recordPings, fleetUptime, totalPings };
}
