import { NextResponse } from "next/server";
import { execFileSync } from "child_process";

interface ServiceEntry {
  name: string;
  url: string;
  port: number | null;
  systemd: string | null;
  category: string;
}

const SERVICES_REGISTRY: ServiceEntry[] = [
  { name: "Status Page", url: "https://status.quota.wtf", port: 39180, systemd: "status-page.service", category: "monitoring" },
  { name: "Server Health", url: "https://health.quota.wtf", port: 39185, systemd: "server-health.service", category: "monitoring" },
  { name: "Log Tail", url: "https://logs-tail.quota.wtf", port: 39190, systemd: "log-tail.service", category: "monitoring" },
  { name: "Cron Costs", url: "https://cron-costs.quota.wtf", port: 39195, systemd: "cron-costs.service", category: "finance" },
  { name: "Service Map", url: "https://services.quota.wtf", port: 39200, systemd: "service-map.service", category: "monitoring" },
  { name: "Tonight", url: "https://tonight.quota.wtf", port: 8847, systemd: "tonight-quota-wtf.service", category: "creative" },
  { name: "Mission Control", url: "https://mission-control.quota.wtf", port: 39151, systemd: "mission-control.service", category: "core" },
  { name: "CC Report", url: "https://cc-report.quota.wtf", port: null, systemd: null, category: "finance" },
  { name: "Swiggy Dashboard", url: "https://swiggy-dash.quota.wtf", port: null, systemd: null, category: "media" },
  { name: "Hevy Dashboard", url: "https://hevy.quota.wtf", port: null, systemd: null, category: "media" },
  { name: "Plex Dashboard", url: "https://plex-dash.quota.wtf", port: null, systemd: null, category: "media" },
  { name: "Companion", url: "https://companion.quota.wtf", port: null, systemd: null, category: "ai" },
];

async function checkHttpStatus(url: string): Promise<{ httpStatus: number | null; responseTime: number | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    const responseTime = Date.now() - start;
    return { httpStatus: res.status, responseTime };
  } catch {
    return { httpStatus: null, responseTime: null };
  } finally {
    clearTimeout(timeout);
  }
}

function checkSystemd(unit: string): string {
  try {
    const result = execFileSync("systemctl", ["is-active", unit], { timeout: 3000, encoding: "utf-8" }).trim();
    return result;
  } catch {
    return "inactive";
  }
}

export async function GET() {
  const results = await Promise.all(
    SERVICES_REGISTRY.map(async (svc) => {
      const [http, systemdStatus] = await Promise.all([
        checkHttpStatus(svc.url),
        Promise.resolve(svc.systemd ? checkSystemd(svc.systemd) : null),
      ]);

      let status: "up" | "degraded" | "down" = "down";
      if (http.httpStatus !== null && http.httpStatus >= 200 && http.httpStatus < 400) {
        status = "up";
      } else if (http.httpStatus !== null && http.httpStatus >= 400) {
        status = "degraded";
      }

      return {
        name: svc.name,
        url: svc.url,
        port: svc.port,
        category: svc.category,
        status,
        httpStatus: http.httpStatus,
        responseTime: http.responseTime,
        systemd: svc.systemd,
        systemdStatus,
      };
    })
  );

  return NextResponse.json(results, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
