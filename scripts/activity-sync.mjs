#!/usr/bin/env node
/**
 * Activity Sync - Watches OpenClaw logs and syncs to Mission Control (Supabase)
 * Run: node scripts/activity-sync.mjs
 *
 * Handles midnight log file rollover and log directory changes automatically.
 * Supports LOG_DIR env var override for custom log locations.
 *
 * Log directory discovery order:
 *   1. LOG_DIR env var (if set)
 *   2. /tmp/openclaw-{uid}/ (UID-namespaced, OpenClaw >=2026.2.19)
 *   3. /tmp/openclaw/ (legacy)
 *   4. Glob /tmp/openclaw-{wildcard}/ (any UID-namespaced dir with log files)
 */

import { createReadStream, watchFile, unwatchFile, statSync, readdirSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { join, basename } from 'path';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

// --- Log directory discovery (exported for testing) ---

/**
 * Discover the OpenClaw log directory. Tries multiple locations in priority order.
 * Returns the directory path (not the file), or null if none found.
 */
export function discoverLogDir() {
  // 1. Env var override — highest priority
  if (process.env.LOG_DIR) {
    if (dirHasLogFiles(process.env.LOG_DIR)) return process.env.LOG_DIR;
    // Even without files, trust the explicit override (files may appear later)
    if (existsSync(process.env.LOG_DIR)) return process.env.LOG_DIR;
  }

  // 2. UID-namespaced: /tmp/openclaw-<uid>/
  const uid = getUid();
  const uidDir = `/tmp/openclaw-${uid}`;
  if (dirHasLogFiles(uidDir)) return uidDir;

  // 3. Legacy: /tmp/openclaw/
  const legacyDir = '/tmp/openclaw';
  if (dirHasLogFiles(legacyDir)) return legacyDir;

  // 4. Glob: any /tmp/openclaw-*/ with log files (covers unknown UID or future changes)
  try {
    const tmpEntries = readdirSync('/tmp');
    const candidates = tmpEntries
      .filter(e => e.startsWith('openclaw-') || e === 'openclaw')
      .map(e => join('/tmp', e))
      .filter(d => dirHasLogFiles(d))
      .sort((a, b) => {
        // Prefer the dir with the most recently modified log file
        const aLatest = latestLogMtime(a);
        const bLatest = latestLogMtime(b);
        return bLatest - aLatest;
      });
    if (candidates.length > 0) return candidates[0];
  } catch { /* /tmp unreadable — unlikely but handle */ }

  return null;
}

/** Check if a directory exists and contains openclaw-*.log files */
export function dirHasLogFiles(dir) {
  try {
    return readdirSync(dir).some(f => f.startsWith('openclaw-') && f.endsWith('.log'));
  } catch { return false; }
}

/** Get mtime of the newest log file in a directory, or 0 */
function latestLogMtime(dir) {
  try {
    return Math.max(...readdirSync(dir)
      .filter(f => f.startsWith('openclaw-') && f.endsWith('.log'))
      .map(f => statSync(join(dir, f)).mtimeMs));
  } catch { return 0; }
}

/** Get current UID (cached) */
let _uid = null;
function getUid() {
  if (_uid !== null) return _uid;
  try {
    _uid = String(process.getuid());
  } catch {
    try { _uid = execSync('id -u', { encoding: 'utf8' }).trim(); } catch { _uid = '1000'; }
  }
  return _uid;
}

/**
 * Find the latest log file across the discovered log directory.
 * Accepts an explicit dir to search (for testing), otherwise uses discoverLogDir().
 */
export function findLatestLogFile(logDir) {
  if (process.argv[2]) return process.argv[2];
  const dir = logDir || discoverLogDir();
  if (!dir) return null;
  try {
    const files = readdirSync(dir)
      .filter(f => f.startsWith('openclaw-') && f.endsWith('.log'))
      .map(f => ({ name: f, path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files[0]?.path || null;
  } catch { return null; }
}

// --- Log line parsing (exported for testing) ---

export function parseLogLine(line) {
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

    // Use structured log level for error detection
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

// --- Main runtime (only runs when not imported as module) ---

const isMainModule = !process.argv[1]?.includes('node_modules') &&
  basename(process.argv[1] || '') === 'activity-sync.mjs' &&
  !process.env.ACTIVITY_SYNC_TEST;

if (isMainModule) {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[!] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  let currentLogDir = null;
  let currentLogFile = '';
  let lastPosition = 0;

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
      if (err.code !== 'ENOENT') {
        console.error('[!] Error processing lines:', err.message);
      }
    }
  }

  function startWatching(logFile) {
    currentLogFile = logFile;
    lastPosition = 0;

    try {
      lastPosition = statSync(logFile).size;
      console.log(`[*] Starting from position: ${lastPosition}`);
    } catch {
      console.log('[*] Log file not found yet, will process when created');
    }

    watchFile(logFile, { interval: 2000 }, async () => {
      await processNewLines();
    });
  }

  function checkForNewerFile() {
    // Re-discover log directory if current one has no recent files (>5 min)
    const freshDir = discoverLogDir();
    if (freshDir && freshDir !== currentLogDir) {
      console.log(`[*] Log directory changed: ${currentLogDir} → ${freshDir}`);
      currentLogDir = freshDir;
    }

    const latest = findLatestLogFile(currentLogDir);
    if (!latest) {
      if (currentLogFile) {
        console.log('[!] No log files found — will keep checking');
      }
      return;
    }
    if (latest === currentLogFile) return;

    console.log(`[*] Newer log file found: ${latest}`);
    if (currentLogFile) {
      console.log(`[*] Switching from: ${currentLogFile}`);
      unwatchFile(currentLogFile);
    }
    startWatching(latest);
  }

  // --- Startup ---
  currentLogDir = discoverLogDir();
  console.log('[*] Activity Sync started (Supabase)');

  if (currentLogDir) {
    console.log(`[*] Log directory: ${currentLogDir}`);
    const initialLogFile = findLatestLogFile(currentLogDir);
    if (initialLogFile) {
      console.log(`[*] Watching: ${initialLogFile}`);
      startWatching(initialLogFile);
    } else {
      console.log('[!] Log directory found but no log files yet — will check every 30s');
    }
  } else {
    console.log('[!] No log directory found. Checked: /tmp/openclaw-<uid>/, /tmp/openclaw/, /tmp/openclaw-*/');
    console.log('[*] Will retry discovery every 30s');
  }

  // Check for newer log files / directory changes every 30 seconds
  setInterval(checkForNewerFile, 30000);
}
