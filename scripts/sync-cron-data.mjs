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
const INPUT_FILE = process.argv[2] || '/tmp/openclaw-crons.json';

function scheduleToString(schedule) {
  if (!schedule || typeof schedule === 'string') return schedule || 'unknown';
  
  switch (schedule.kind) {
    case 'cron':
      const expr = schedule.expr;
      const tz = schedule.tz || 'UTC';
      // Common patterns
      if (expr === '0 23 * * *' && tz === 'Asia/Kolkata') return 'daily 11:00pm IST';
      if (expr === '0 10 * * *' && tz === 'Asia/Kolkata') return 'daily 10:00am IST';
      if (expr === '30 14 * * *') return 'daily 8:00pm IST';
      if (expr === '0 18 * * 0') return 'Sunday 11:30pm IST';
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
  if (job.payload?.text) return job.payload.text.slice(0, 100);
  if (job.payload?.message) return job.payload.message.slice(0, 100);
  return 'No command';
}

function extractModel(job) {
  if (job.payload?.model) {
    const m = job.payload.model.toLowerCase();
    if (m.includes('haiku')) return 'claude-haiku-4-5';
    if (m.includes('opus')) return 'claude-opus-4-5';
    if (m.includes('sonnet')) return 'claude-sonnet-4-5';
    return job.payload.model;
  }
  return 'claude-haiku-4-5';
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
  
  console.log('\n✅ Sync complete!');
}

main().catch(console.error);
