import { NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, basename } from "path";

const TRAEFIK_DIR = "/home/h2/fast/ws/traefik/dynamic";
const SKIP_FILES = new Set(["catchall.yml", "authelia.yml"]);

interface ServiceEntry {
  name: string;
  url: string;
  port: number | null;
  systemd: string | null;
  category: string;
  hasAuth: boolean;
}

const OVERRIDES: Record<string, Partial<ServiceEntry>> = {
  "mission-control": { systemd: "mission-control.service", category: "core" },
  "status": { name: "Status Page", systemd: "status-page.service", category: "monitoring" },
  "server-health": { name: "Server Health", systemd: "server-health.service", category: "monitoring" },
  "log-tail": { name: "Log Tail", systemd: "log-tail.service", category: "monitoring" },
  "logs-dashboard": { name: "Logs (Grafana)", category: "monitoring" },
  "service-map": { systemd: "service-map.service", category: "monitoring" },
  "cron-costs": { systemd: "cron-costs.service", category: "finance" },
  "cc-report": { name: "CC Report", systemd: "cc-report.service", category: "finance" },
  "tonight": { systemd: "tonight-quota-wtf.service", category: "creative" },
  "companion": { category: "ai" },
  "hevy-dashboard": { name: "Hevy Dashboard", category: "media" },
  "plex-dashboard": { name: "Plex Dashboard", category: "media" },
  "swiggy-dashboard": { name: "Swiggy Dashboard", category: "media" },
  "qui": { name: "Qui (Autobrr)", category: "media" },
  "cross-seed": { category: "media" },
  "clawdbot": { category: "ai" },
  "openclaw-gw": { name: "OpenClaw Gateway", category: "ai" },
};

function kebabToTitle(s: string): string {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseTraefikYaml(filePath: string): ServiceEntry | null {
  const content = readFileSync(filePath, "utf8");
  const slug = basename(filePath, ".yml");

  // Extract first Host rule
  const hostMatch = content.match(/Host\(`([^`]+)`\)/);
  if (!hostMatch) return null;

  // Extract backend URL
  const urlMatch = content.match(/url:\s*"([^"]+)"/);
  if (!urlMatch) return null;

  // Extract port from backend URL
  const portMatch = urlMatch[1].match(/:(\d+)/);

  // Check for auth middleware (authelia forwardauth or basicAuth)
  const hasAuth =
    /authelia-forwardauth/i.test(content) ||
    /forwardAuth/i.test(content) ||
    /basicAuth/i.test(content);

  const overrides = OVERRIDES[slug] || {};

  return {
    name: overrides.name ?? kebabToTitle(slug),
    url: `https://${hostMatch[1]}`,
    port: portMatch ? parseInt(portMatch[1], 10) : null,
    systemd: overrides.systemd ?? null,
    category: overrides.category ?? "other",
    hasAuth,
  };
}

function discoverServices(): ServiceEntry[] {
  const services: ServiceEntry[] = [];

  try {
    const files = readdirSync(TRAEFIK_DIR).filter(
      (f) => f.endsWith(".yml") && !SKIP_FILES.has(f)
    );

    for (const file of files) {
      try {
        const svc = parseTraefikYaml(join(TRAEFIK_DIR, file));
        if (svc) services.push(svc);
      } catch {
        // skip unparseable files
      }
    }
  } catch (e) {
    console.error("Failed to read traefik dir:", e);
  }

  // Manually add Authelia SSO (skipped from auto-discovery)
  services.push({
    name: "Authelia SSO",
    url: "https://auth.quota.wtf",
    port: null,
    systemd: null,
    category: "core",
    hasAuth: false,
  });

  return services;
}

// Simple cache: re-read YAML at most every 60s
let cachedServices: ServiceEntry[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

function getServices(): ServiceEntry[] {
  const now = Date.now();
  if (!cachedServices || now - cacheTime > CACHE_TTL) {
    cachedServices = discoverServices();
    cacheTime = now;
  }
  return cachedServices;
}

async function checkHttpStatus(
  url: string
): Promise<{ httpStatus: number | null; responseTime: number | null }> {
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
    const result = execFileSync("systemctl", ["is-active", unit], {
      timeout: 3000,
      encoding: "utf-8",
    }).trim();
    return result;
  } catch {
    return "inactive";
  }
}

export async function GET() {
  const registry = getServices();

  const results = await Promise.all(
    registry.map(async (svc) => {
      const [http, systemdStatus] = await Promise.all([
        checkHttpStatus(svc.url),
        Promise.resolve(svc.systemd ? checkSystemd(svc.systemd) : null),
      ]);

      let status: "up" | "degraded" | "down" = "down";
      if (
        http.httpStatus !== null &&
        http.httpStatus >= 200 &&
        http.httpStatus < 400
      ) {
        status = "up";
      } else if (http.httpStatus !== null && http.httpStatus >= 400) {
        status = "degraded";
      }

      return {
        name: svc.name,
        url: svc.url,
        port: svc.port,
        category: svc.category,
        hasAuth: svc.hasAuth,
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
