#!/usr/bin/env node
/**
 * Activity Sync - Watches OpenClaw logs and syncs to Mission Control (Supabase)
 * Run: node scripts/activity-sync.mjs
 *
 * Handles midnight log file rollover automatically.
 */

import { createReadStream, watchFile, unwatchFile, statSync, readdirSync } from 'fs';
import { createInterface } from 'readline';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[!] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const LOG_DIR = '/tmp/openclaw';

let currentLogFile = '';
let lastPosition = 0;

function findLatestLogFile() {
  if (process.argv[2]) return process.argv[2];
  try {
    const files = readdirSync(LOG_DIR)
      .filter(f => f.startsWith('openclaw-') && f.endsWith('.log'))
      .map(f => ({ name: f, path: join(LOG_DIR, f), mtime: statSync(join(LOG_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files[0]?.path || null;
  } catch { return null; }
}

async function postActivity(activity) {
  try {
    const { error } = await supabase.from('activities').insert({
      action_type: activity.actionType,
      category: activity.category ?? 'system',
      description: activity.description,
      timestamp: activity.timestamp
        ? new Date(activity.timestamp).toISOString()
        : new Date().toISOString(),
      status: activity.status,
      metadata: activity.metadata ?? null,
    });
    if (error) throw error;
    console.log(`[✓] Logged: ${activity.actionType} - ${activity.description.slice(0, 50)}...`);
  } catch (err) {
    console.error('[✗] Failed to post activity:', err.message);
  }
}

function parseLogLine(line) {
  try {
    const data = JSON.parse(line);
    const message = String(data['1'] ?? data['0'] ?? '');
    const timestamp = new Date(data.time || data._meta?.date).getTime();
    const logLevel = data._meta?.logLevelName || 'INFO';

    // Skip DEBUG heartbeat/queue noise — only keep tool calls
    if (logLevel === 'DEBUG') {
      if (message.includes('embedded run tool start:')) {
        const toolMatch = message.match(/tool=(\S+)/);
        return {
          actionType: 'tool_call',
          description: message.slice(0, 200),
          timestamp,
          status: 'success',
          metadata: { tool: toolMatch?.[1] || 'unknown' }
        };
      }
      return null;
    }

    // Use structured log level for error detection — NOT substring matching
    if (logLevel === 'ERROR') {
      return {
        actionType: 'error',
        description: message.slice(0, 200),
        timestamp,
        status: 'error',
        category: 'important',
        metadata: { error: message.slice(0, 500) }
      };
    }

    if (logLevel === 'WARN') {
      return {
        actionType: 'warning',
        description: message.slice(0, 200),
        timestamp,
        status: 'success',
        category: 'system',
        metadata: {}
      };
    }

    // INFO level — parse specific patterns
    if (message.includes('agent model:')) {
      const modelMatch = message.match(/agent model:\s*(.+)/);
      return {
        actionType: 'agent_start',
        description: `Agent started: ${modelMatch?.[1] || 'unknown'}`,
        timestamp,
        status: 'success',
        category: 'system',
        metadata: { model: modelMatch?.[1]?.trim() }
      };
    }

    if (message.includes('No reply from agent')) {
      return {
        actionType: 'agent_no_reply',
        description: 'No reply from agent',
        timestamp,
        status: 'success',
        category: 'system',
        metadata: {}
      };
    }

    // Skip remaining INFO noise
    return null;
  } catch {
    return null;
  }
}

async function processNewLines() {
  try {
    const stats = statSync(currentLogFile);
    if (stats.size <= lastPosition) return;

    const stream = createReadStream(currentLogFile, {
      start: lastPosition,
      encoding: 'utf8'
    });

    const rl = createInterface({ input: stream });

    for await (const line of rl) {
      const activity = parseLogLine(line);
      if (activity) {
        await postActivity(activity);
      }
    }

    lastPosition = stats.size;
  } catch (err) {
    // File may not exist yet after rollover
    if (err.code !== 'ENOENT') {
      console.error('[!] Error processing lines:', err.message);
    }
  }
}

function startWatching(logFile) {
  currentLogFile = logFile;
  lastPosition = 0;

  // Get current file size to only process new entries
  try {
    lastPosition = statSync(logFile).size;
    console.log(`[*] Starting from position: ${lastPosition}`);
  } catch {
    console.log('[*] Log file not found yet, will process when created');
  }

  // Watch for changes
  watchFile(logFile, { interval: 2000 }, async () => {
    await processNewLines();
  });
}

function checkForNewerFile() {
  const latest = findLatestLogFile();
  if (!latest || latest === currentLogFile) return;

  console.log(`[*] Newer log file found: ${latest}`);
  console.log(`[*] Switching from: ${currentLogFile}`);

  // Stop watching old file
  unwatchFile(currentLogFile);
  startWatching(latest);
}

// Initial setup
const initialLogFile = findLatestLogFile();

console.log('[*] Activity Sync started (Supabase)');

if (initialLogFile) {
  console.log(`[*] Watching: ${initialLogFile}`);
  startWatching(initialLogFile);
} else {
  console.log('[*] No log files found yet, will check every 60s');
}

// Check for newer log files every 60 seconds
setInterval(checkForNewerFile, 60000);
