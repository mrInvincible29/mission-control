import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";

interface CpuInfo {
  user: number;
  system: number;
  idle: number;
  loadAvg: [number, number, number];
  cores: number;
}

interface MemoryInfo {
  totalMB: number;
  usedMB: number;
  availableMB: number;
  usedPercent: number;
  swapTotalMB: number;
  swapUsedMB: number;
}

interface DiskInfo {
  filesystem: string;
  mountpoint: string;
  sizeMB: number;
  usedMB: number;
  availableMB: number;
  usedPercent: number;
}

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  uptime: string;
}

interface ServiceStatus {
  name: string;
  active: boolean;
  status: string;
  description: string;
  uptime: string;
}

interface NetworkInfo {
  interface: string;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
}

interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  command: string;
}

// Module-level cache for delta-based CPU calculation.
// On each request, we compare current /proc/stat counters with the previous
// reading to compute actual recent CPU utilization (like top/htop) instead
// of a meaningless lifetime average.
let prevCpuCounters: { user: number; nice: number; system: number; idle: number; iowait: number; irq: number; softirq: number; total: number } | null = null;

function getCpu(): CpuInfo {
  const loadAvg = os.loadavg() as [number, number, number];
  const cores = os.cpus().length;

  try {
    const stat = fs.readFileSync("/proc/stat", "utf-8");
    const cpuLine = stat.split("\n")[0];
    const parts = cpuLine.split(/\s+/).slice(1).map(Number);
    const [user, nice, system, idle, iowait, irq, softirq] = parts;
    const total = user + nice + system + idle + iowait + irq + softirq;

    const current = { user, nice, system, idle, iowait, irq, softirq, total };

    let cpuUser: number;
    let cpuSystem: number;
    let cpuIdle: number;

    if (prevCpuCounters) {
      // Delta-based: compare with previous reading for real-time utilization
      const dTotal = total - prevCpuCounters.total;
      if (dTotal > 0) {
        cpuUser = ((user + nice - prevCpuCounters.user - prevCpuCounters.nice) / dTotal) * 100;
        cpuSystem = ((system + irq + softirq - prevCpuCounters.system - prevCpuCounters.irq - prevCpuCounters.softirq) / dTotal) * 100;
        cpuIdle = ((idle + iowait - prevCpuCounters.idle - prevCpuCounters.iowait) / dTotal) * 100;
      } else {
        cpuUser = 0;
        cpuSystem = 0;
        cpuIdle = 100;
      }
    } else {
      // First request after server start: use load average as a rough estimate
      // rather than the misleading cumulative /proc/stat values
      const loadPct = Math.min((loadAvg[0] / cores) * 100, 100);
      cpuUser = loadPct * 0.7;
      cpuSystem = loadPct * 0.3;
      cpuIdle = 100 - loadPct;
    }

    prevCpuCounters = current;

    return {
      user: Math.max(0, Math.min(100, cpuUser)),
      system: Math.max(0, Math.min(100, cpuSystem)),
      idle: Math.max(0, Math.min(100, cpuIdle)),
      loadAvg,
      cores,
    };
  } catch {
    return { user: 0, system: 0, idle: 100, loadAvg, cores };
  }
}

function getMemory(): MemoryInfo {
  try {
    const meminfo = fs.readFileSync("/proc/meminfo", "utf-8");
    const parse = (key: string): number => {
      const match = meminfo.match(new RegExp(`${key}:\\s+(\\d+)`));
      return match ? parseInt(match[1], 10) / 1024 : 0; // KB -> MB
    };
    const total = parse("MemTotal");
    const available = parse("MemAvailable");
    const swapTotal = parse("SwapTotal");
    const swapFree = parse("SwapFree");
    const used = total - available;
    return {
      totalMB: Math.round(total),
      usedMB: Math.round(used),
      availableMB: Math.round(available),
      usedPercent: total > 0 ? (used / total) * 100 : 0,
      swapTotalMB: Math.round(swapTotal),
      swapUsedMB: Math.round(swapTotal - swapFree),
    };
  } catch {
    return { totalMB: 0, usedMB: 0, availableMB: 0, usedPercent: 0, swapTotalMB: 0, swapUsedMB: 0 };
  }
}

function getDisks(): DiskInfo[] {
  try {
    const output = execSync("df -BM --output=source,target,size,used,avail,pcent -x tmpfs -x devtmpfs -x overlay 2>/dev/null", {
      timeout: 5000,
    }).toString();
    return output
      .split("\n")
      .slice(1)
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        return {
          filesystem: parts[0],
          mountpoint: parts[1],
          sizeMB: parseInt(parts[2]) || 0,
          usedMB: parseInt(parts[3]) || 0,
          availableMB: parseInt(parts[4]) || 0,
          usedPercent: parseInt(parts[5]) || 0,
        };
      })
      .filter((d) => d.sizeMB > 100); // Filter out tiny mounts
  } catch {
    return [];
  }
}

function getDocker(): DockerContainer[] {
  try {
    const output = execSync(
      'docker ps --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.Ports}}|{{.RunningFor}}" 2>/dev/null',
      { timeout: 5000 }
    ).toString();
    return output
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [id, name, image, status, state, ports, uptime] = line.split("|");
        return { id, name, image, status, state, ports: ports || "", uptime: uptime || "" };
      });
  } catch {
    return [];
  }
}

function getServices(): ServiceStatus[] {
  const serviceNames = ["mission-control", "traefik", "mc-file-watcher", "docker", "ssh"];
  const services: ServiceStatus[] = [];

  for (const name of serviceNames) {
    try {
      const active = execSync(`systemctl is-active ${name} 2>/dev/null`, { timeout: 3000 })
        .toString()
        .trim();
      let description = "";
      let uptime = "";
      try {
        description = execSync(`systemctl show -p Description --value ${name} 2>/dev/null`, { timeout: 3000 })
          .toString()
          .trim();
        const since = execSync(`systemctl show -p ActiveEnterTimestamp --value ${name} 2>/dev/null`, { timeout: 3000 })
          .toString()
          .trim();
        if (since) {
          const start = new Date(since).getTime();
          const now = Date.now();
          const diff = now - start;
          if (diff > 86400000) uptime = `${Math.floor(diff / 86400000)}d`;
          else if (diff > 3600000) uptime = `${Math.floor(diff / 3600000)}h`;
          else uptime = `${Math.floor(diff / 60000)}m`;
        }
      } catch { /* ignore */ }
      services.push({
        name,
        active: active === "active",
        status: active,
        description,
        uptime,
      });
    } catch {
      services.push({ name, active: false, status: "inactive", description: "", uptime: "" });
    }
  }
  return services;
}

function getNetwork(): NetworkInfo[] {
  try {
    const netDev = fs.readFileSync("/proc/net/dev", "utf-8");
    return netDev
      .split("\n")
      .slice(2)
      .filter((line) => line.trim())
      .map((line) => {
        const [iface, rest] = line.trim().split(":");
        const parts = rest.trim().split(/\s+/).map(Number);
        return {
          interface: iface.trim(),
          rxBytes: parts[0],
          txBytes: parts[8],
          rxPackets: parts[1],
          txPackets: parts[9],
        };
      })
      .filter((n) => n.interface !== "lo" && (n.rxBytes > 0 || n.txBytes > 0));
  } catch {
    return [];
  }
}

function getTopProcesses(): ProcessInfo[] {
  try {
    const output = execSync('ps aux --sort=-%cpu | head -8', { timeout: 5000 }).toString();
    return output
      .split("\n")
      .slice(1)
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        return {
          pid: parseInt(parts[1]) || 0,
          user: parts[0],
          cpu: parseFloat(parts[2]) || 0,
          mem: parseFloat(parts[3]) || 0,
          command: parts.slice(10).join(" ").substring(0, 80),
        };
      });
  } catch {
    return [];
  }
}

export async function GET(_request: NextRequest) {
  try {
    const uptime = os.uptime();
    const hostname = os.hostname();

    const data = {
      timestamp: Date.now(),
      hostname,
      uptime,
      cpu: getCpu(),
      memory: getMemory(),
      disks: getDisks(),
      docker: getDocker(),
      services: getServices(),
      network: getNetwork(),
      topProcesses: getTopProcesses(),
    };

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to gather system metrics" },
      { status: 500, headers: { "Cache-Control": "no-cache, no-store, must-revalidate" } }
    );
  }
}
