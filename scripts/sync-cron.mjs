#!/usr/bin/env node
/**
 * Sync OpenClaw cron jobs to Mission Control Convex database
 * Run via: node scripts/sync-cron.mjs
 * 
 * This script:
 * 1. Fetches cron jobs from OpenClaw via CLI
 * 2. Converts schedule objects to readable strings
 * 3. Upserts to Convex (add new, update existing, mark deleted as disabled)
 */

import { execSync } from 'child_process';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const CONVEX_URL = process.env.CONVEX_URL || 'https://accomplished-rabbit-353.convex.cloud';

function scheduleToString(schedule) {
  if (!schedule || typeof schedule === 'string') return schedule || 'unknown';
  
  switch (schedule.kind) {
    case 'cron':
      // Parse cron expression to human readable
      const expr = schedule.expr;
      const tz = schedule.tz || 'UTC';
      // Common patterns
      if (expr === '0 23 * * *' && tz === 'Asia/Kolkata') return 'daily 11:00pm IST';
      if (expr === '0 10 * * *' && tz === 'Asia/Kolkata') return 'daily 10:00am IST';
      if (expr === '30 14 * * *') return 'daily 8:00pm IST'; // 14:30 UTC = 20:00 IST
      if (expr === '0 18 * * 0') return 'Sunday 11:30pm IST'; // 18:00 UTC Sunday = 23:30 IST
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
      return `once at ${date.toISOString()}`;
      
    default:
      return JSON.stringify(schedule);
  }
}

function extractCommand(job) {
  if (job.payload?.text) return job.payload.text.slice(0, 100);
  if (job.payload?.message) return job.payload.message.slice(0, 100);
  return 'No command';
}

function extractModel(job) {
  // Check payload.model first, then top-level
  if (job.payload?.model) {
    const m = job.payload.model.toLowerCase();
    if (m.includes('haiku')) return 'claude-haiku-4-5';
    if (m.includes('opus')) return 'claude-opus-4-5';
    if (m.includes('sonnet')) return 'claude-sonnet-4-5';
    return job.payload.model;
  }
  return 'claude-haiku-4-5'; // default
}

async function main() {
  console.log('🔄 Syncing OpenClaw cron jobs to Mission Control...\n');
  
  // Fetch cron jobs from OpenClaw
  let openclawJobs;
  try {
    const result = execSync('openclaw cron list --json 2>/dev/null', { encoding: 'utf-8' });
    const parsed = JSON.parse(result);
    openclawJobs = Array.isArray(parsed) ? parsed : parsed.jobs || [];
  } catch (e) {
    console.error('Failed to fetch OpenClaw cron jobs:', e.message);
    process.exit(1);
  }
  
  console.log(`Found ${openclawJobs.length} jobs in OpenClaw\n`);
  
  // Connect to Convex
  const client = new ConvexHttpClient(CONVEX_URL);
  
  // Get existing jobs from Convex
  const existingJobs = await client.query(api.cronJobs.list);
  const existingByName = new Map(existingJobs.map(j => [j.name, j]));
  
  const openclawNames = new Set();
  
  // Upsert each OpenClaw job
  for (const job of openclawJobs) {
    const name = job.name;
    openclawNames.add(name);
    
    const scheduleStr = scheduleToString(job.schedule);
    const command = extractCommand(job);
    const model = extractModel(job);
    const enabled = job.enabled !== false;
    const lastRun = job.state?.lastRunAtMs;
    const nextRun = job.state?.nextRunAtMs || job.nextRun;
    
    const existing = existingByName.get(name);
    
    // Check if update needed
    const needsUpdate = !existing || 
      existing.schedule !== scheduleStr ||
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
      console.log(`${existing ? '📝 Updated' : '➕ Added'}: ${name}`);
    } else {
      console.log(`✓ Unchanged: ${name}`);
    }
  }
  
  // Disable jobs that no longer exist in OpenClaw
  for (const [name, job] of existingByName) {
    if (!openclawNames.has(name) && job.enabled) {
      await client.mutation(api.cronJobs.upsert, {
        name,
        schedule: job.schedule,
        command: job.command,
        enabled: false,
        model: job.model,
        lastRun: job.lastRun,
        nextRun: job.nextRun,
      });
      console.log(`🗑️ Disabled (removed from OpenClaw): ${name}`);
    }
  }
  
  console.log('\n✅ Sync complete!');
}

main().catch(console.error);
