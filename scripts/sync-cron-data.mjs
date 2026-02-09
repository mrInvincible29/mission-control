#!/usr/bin/env node
/**
 * Sync cron jobs from a JSON file to Mission Control Convex database
 * 
 * Usage:
 * 1. First export cron jobs: write the output of `cron list` to /tmp/openclaw-crons.json
 * 2. Then run: node scripts/sync-cron-data.mjs
 */

import { readFileSync } from 'fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const CONVEX_URL = process.env.CONVEX_URL || 'https://accomplished-rabbit-353.convex.cloud';
const HOME = process.env.HOME || '/home/h2';
// Prefer the authoritative source (OpenClaw's internal cron store) over agent-written exports
const INPUT_FILE = process.argv[2] || `${HOME}/.openclaw/cron/jobs.json`;

function scheduleToString(schedule) {
  if (!schedule || typeof schedule === 'string') return schedule || 'unknown';
  
  switch (schedule.kind) {
    case 'cron':
      const expr = schedule.expr;
      const tz = schedule.tz || 'UTC';
      // Parse cron: minute hour day month weekday
      const parts = expr.split(' ');
      if (parts.length === 5) {
        const [minute, hour, day, month, weekday] = parts;
        const tzSuffix = tz === 'Asia/Kolkata' ? ' IST' : tz === 'UTC' ? ' UTC' : ` ${tz}`;
        
        // Daily at specific time(s)
        if (day === '*' && month === '*' && weekday === '*') {
          // Multiple hours (e.g., "0 0,6,12,18 * * *")
          if (hour.includes(',')) {
            const hours = hour.split(',').map(h => {
              const hr = parseInt(h);
              if (hr === 0) return '12:00am';
              if (hr === 12) return '12:00pm';
              if (hr < 12) return `${hr}:${minute.padStart(2, '0')}am`;
              return `${hr - 12}:${minute.padStart(2, '0')}pm`;
            });
            return `daily ${hours.join(', ')}${tzSuffix}`;
          }
          // Single hour
          const hr = parseInt(hour);
          const min = minute.padStart(2, '0');
          if (hr === 0) return `daily 12:${min}am${tzSuffix}`;
          if (hr === 12) return `daily 12:${min}pm${tzSuffix}`;
          if (hr < 12) return `daily ${hr}:${min}am${tzSuffix}`;
          return `daily ${hr - 12}:${min}pm${tzSuffix}`;
        }
        
        // Weekly (specific weekday)
        if (day === '*' && month === '*' && weekday !== '*') {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const dayName = dayNames[parseInt(weekday)] || weekday;
          const hr = parseInt(hour);
          const min = minute.padStart(2, '0');
          let timeStr;
          if (hr === 0) timeStr = `12:${min}am`;
          else if (hr === 12) timeStr = `12:${min}pm`;
          else if (hr < 12) timeStr = `${hr}:${min}am`;
          else timeStr = `${hr - 12}:${min}pm`;
          return `${dayName} ${timeStr}${tzSuffix}`;
        }
      }
      return `cron: ${expr} (${tz})`;
      
    case 'every':
      const ms = schedule.everyMs;
      if (ms >= 86400000) {
        const days = Math.round(ms / 86400000);
        return `every ${days} day${days > 1 ? 's' : ''}`;
      } else if (ms >= 3600000) {
        const hours = Math.round(ms / 3600000);
        return `every ${hours} hour${hours > 1 ? 's' : ''}`;
      } else {
        const mins = Math.round(ms / 60000);
        return `every ${mins} minute${mins > 1 ? 's' : ''}`;
      }
      
    case 'at':
      const date = new Date(schedule.atMs);
      return `once at ${date.toLocaleString()}`;
      
    default:
      return JSON.stringify(schedule);
  }
}

function extractCommand(job) {
  if (job.payload?.text) return job.payload.text;
  if (job.payload?.message) return job.payload.message;
  return 'No command';
}

function extractModel(job) {
  if (job.payload?.model) {
    // Use the actual model string — strip provider prefix if present
    const m = job.payload.model;
    const stripped = m.includes('/') ? m.split('/').pop() : m;
    return stripped;
  }
  // systemEvent jobs run in main session (whatever the default model is)
  if (job.payload?.kind === 'systemEvent' || job.sessionTarget === 'main') {
    return 'main-session';
  }
  // agentTurn without explicit model — uses gateway default
  return 'default';
}

async function main() {
  console.log(`🔄 Reading cron jobs from ${INPUT_FILE}...\n`);
  
  let data;
  try {
    const content = readFileSync(INPUT_FILE, 'utf-8');
    data = JSON.parse(content);
  } catch (e) {
    console.error(`Failed to read ${INPUT_FILE}:`, e.message);
    process.exit(1);
  }
  
  const openclawJobs = data.jobs || data;
  console.log(`Found ${openclawJobs.length} jobs\n`);
  
  const client = new ConvexHttpClient(CONVEX_URL);
  const existingJobs = await client.query(api.cronJobs.list);
  const existingByName = new Map(existingJobs.map(j => [j.name, j]));
  
  const openclawNames = new Set();
  
  for (const job of openclawJobs) {
    const name = job.name;
    if (!name) continue;
    openclawNames.add(name);
    
    const scheduleStr = scheduleToString(job.schedule);
    const command = extractCommand(job);
    const model = extractModel(job);
    const enabled = job.enabled !== false;
    const lastRun = job.state?.lastRunAtMs;
    const nextRun = job.state?.nextRunAtMs || job.nextRun;
    
    const existing = existingByName.get(name);
    
    const needsUpdate = !existing || 
      existing.schedule !== scheduleStr ||
      existing.command !== command ||
      existing.enabled !== enabled ||
      existing.model !== model ||
      existing.lastRun !== lastRun ||
      existing.nextRun !== nextRun;
    
    if (needsUpdate) {
      await client.mutation(api.cronJobs.upsert, {
        name,
        schedule: scheduleStr,
        command,
        enabled,
        model,
        lastRun,
        nextRun,
      });
      console.log(`${existing ? '📝' : '➕'} ${name} (${scheduleStr})`);
    } else {
      console.log(`✓ ${name}`);
    }
  }
  
  // Disable removed jobs
  for (const [name, job] of existingByName) {
    if (!openclawNames.has(name) && job.enabled) {
      await client.mutation(api.cronJobs.upsert, {
        name: job.name,
        schedule: job.schedule,
        command: job.command,
        enabled: false,
        model: job.model,
        lastRun: job.lastRun,
        nextRun: job.nextRun,
      });
      console.log(`🗑️ Disabled: ${name}`);
    }
  }
  
  // ── Verification ──
  console.log('\n🔍 Verifying sync...');
  const verifyJobs = await client.query(api.cronJobs.list);
  const verifyByName = new Map(verifyJobs.map(j => [j.name, j]));
  let errors = 0;

  for (const job of openclawJobs) {
    if (!job.name) continue;
    const synced = verifyByName.get(job.name);
    const srcCommand = extractCommand(job);
    const srcModel = extractModel(job);

    if (!synced) {
      console.error(`  ❌ ${job.name}: missing from Convex`);
      errors++;
      continue;
    }
    if (synced.command !== srcCommand) {
      console.error(`  ❌ ${job.name}: command mismatch (src=${srcCommand.length} chars, convex=${(synced.command||'').length} chars)`);
      errors++;
    }
    if (synced.model !== srcModel) {
      console.error(`  ❌ ${job.name}: model mismatch (src=${srcModel}, convex=${synced.model})`);
      errors++;
    }
    if (synced.enabled !== (job.enabled !== false)) {
      console.error(`  ❌ ${job.name}: enabled mismatch (src=${job.enabled !== false}, convex=${synced.enabled})`);
      errors++;
    }
  }

  if (errors) {
    console.error(`\n⚠️ Sync completed with ${errors} verification error(s)`);
    process.exit(1);
  }
  console.log(`  ✅ All ${openclawNames.size} jobs verified — models, commands, and state match`);
}

main().catch(console.error);
