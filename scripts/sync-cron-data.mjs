#!/usr/bin/env node
/**
 * Sync cron jobs from a JSON file to Mission Control Supabase database
 *
 * Usage:
 * 1. First export cron jobs: write the output of `cron list` to /tmp/openclaw-crons.json
 * 2. Then run: node scripts/sync-cron-data.mjs
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HOME = process.env.HOME || '/home/h2';
const INPUT_FILE = process.argv[2] || `${HOME}/.openclaw/cron/jobs.json`;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[!] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

function scheduleToString(schedule) {
  if (!schedule || typeof schedule === 'string') return schedule || 'unknown';

  switch (schedule.kind) {
    case 'cron': {
      const expr = schedule.expr;
      const tz = schedule.tz || 'UTC';
      const parts = expr.split(' ');
      if (parts.length === 5) {
        const [minute, hour, day, month, weekday] = parts;
        const tzSuffix = tz === 'Asia/Kolkata' ? ' IST' : tz === 'UTC' ? ' UTC' : ` ${tz}`;

        if (day === '*' && month === '*' && weekday === '*') {
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
          const hr = parseInt(hour);
          const min = minute.padStart(2, '0');
          if (hr === 0) return `daily 12:${min}am${tzSuffix}`;
          if (hr === 12) return `daily 12:${min}pm${tzSuffix}`;
          if (hr < 12) return `daily ${hr}:${min}am${tzSuffix}`;
          return `daily ${hr - 12}:${min}pm${tzSuffix}`;
        }

        if (day === '*' && month === '*' && weekday !== '*') {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const weekdays = weekday.split(',').map(w => w.trim());
          const dayName = weekdays.length > 1
            ? weekdays.map(w => dayNamesShort[parseInt(w)] || w).join(', ')
            : dayNames[parseInt(weekdays[0])] || weekdays[0];
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
    }

    case 'every': {
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
    }

    case 'at': {
      const date = new Date(schedule.atMs);
      return `once at ${date.toLocaleString()}`;
    }

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
    const m = job.payload.model;
    const stripped = m.includes('/') ? m.split('/').pop() : m;
    return stripped;
  }
  if (job.payload?.kind === 'systemEvent' || job.sessionTarget === 'main') {
    return 'main-session';
  }
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

  // Get existing jobs
  const { data: existingJobs, error: listErr } = await supabase
    .from('cron_jobs')
    .select('*')
    .order('name');

  if (listErr) {
    console.error('Failed to list existing jobs:', listErr.message);
    process.exit(1);
  }

  const existingByName = new Map(existingJobs.map(j => [j.name, j]));
  const openclawNames = new Set();

  for (const job of openclawJobs) {
    const name = job.name;
    if (!name) continue;
    if (job.enabled === false) continue;
    openclawNames.add(name);

    const scheduleStr = scheduleToString(job.schedule);
    const command = extractCommand(job);
    const model = extractModel(job);
    const enabled = true;
    const lastRun = job.state?.lastRunAtMs;
    const nextRun = job.state?.nextRunAtMs || job.nextRun;

    const existing = existingByName.get(name);

    const needsUpdate = !existing ||
      existing.schedule !== scheduleStr ||
      existing.command !== command ||
      existing.enabled !== enabled ||
      existing.model !== model;

    if (needsUpdate) {
      const { error } = await supabase
        .from('cron_jobs')
        .upsert(
          {
            name,
            schedule: scheduleStr,
            command,
            enabled,
            model,
            last_run: lastRun ? new Date(lastRun).toISOString() : null,
            next_run: nextRun ? new Date(nextRun).toISOString() : null,
          },
          { onConflict: 'name' }
        );

      if (error) {
        console.error(`  ❌ Failed to upsert ${name}:`, error.message);
        continue;
      }
      console.log(`${existing ? '📝' : '➕'} ${name} (${scheduleStr})`);
    } else {
      console.log(`✓ ${name}`);
    }
  }

  // Delete disabled/removed jobs
  for (const job of openclawJobs) {
    if (job.name && job.enabled === false) {
      const existing = existingByName.get(job.name);
      if (existing) {
        await supabase.from('cron_jobs').delete().eq('name', job.name);
        console.log(`🗑️ Deleted (disabled): ${job.name}`);
      }
      openclawNames.delete(job.name);
    }
  }
  for (const [name] of existingByName) {
    if (!openclawNames.has(name)) {
      await supabase.from('cron_jobs').delete().eq('name', name);
      console.log(`🗑️ Deleted (removed): ${name}`);
    }
  }

  // Verification
  console.log('\n🔍 Verifying sync...');
  const { data: verifyJobs, error: verifyErr } = await supabase
    .from('cron_jobs')
    .select('*')
    .order('name');

  if (verifyErr) {
    console.error('Failed to verify:', verifyErr.message);
    process.exit(1);
  }

  const verifyByName = new Map(verifyJobs.map(j => [j.name, j]));
  let errors = 0;

  for (const job of openclawJobs) {
    if (!job.name || job.enabled === false) continue;
    const synced = verifyByName.get(job.name);
    const srcCommand = extractCommand(job);
    const srcModel = extractModel(job);

    if (!synced) {
      console.error(`  ❌ ${job.name}: missing from Supabase`);
      errors++;
      continue;
    }
    if (synced.command !== srcCommand) {
      console.error(`  ❌ ${job.name}: command mismatch`);
      errors++;
    }
    if (synced.model !== srcModel) {
      console.error(`  ❌ ${job.name}: model mismatch (src=${srcModel}, db=${synced.model})`);
      errors++;
    }
    if (synced.enabled !== (job.enabled !== false)) {
      console.error(`  ❌ ${job.name}: enabled mismatch`);
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
