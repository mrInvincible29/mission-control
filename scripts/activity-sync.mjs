#!/usr/bin/env node
/**
 * Activity Sync - Watches OpenClaw logs and syncs to Mission Control
 * Run: node scripts/activity-sync.mjs
 *
 * Handles midnight log file rollover automatically.
 */

import { createReadStream, watchFile, unwatchFile, statSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const CONVEX_URL = process.env.CONVEX_URL || 'https://accomplished-rabbit-353.convex.cloud';
const client = new ConvexHttpClient(CONVEX_URL);

let currentDate = '';
let currentLogFile = '';
let lastPosition = 0;

function getToday() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getLogFile(date) {
  return process.argv[2] || `/tmp/openclaw/openclaw-${date}.log`;
}

async function postActivity(activity) {
  try {
    await client.mutation(api.activities.create, activity);
    console.log(`[✓] Logged: ${activity.actionType} - ${activity.description.slice(0, 50)}...`);
  } catch (err) {
    console.error('[✗] Failed to post activity:', err.message);
  }
}

function parseLogLine(line) {
  try {
    // Parse the JSON log line
    const data = JSON.parse(line);
    const message = data['1'] || '';
    const subsystem = data['0'] || '';
    const timestamp = new Date(data.time || data._meta?.date).getTime();

    // Filter for interesting events
    if (message.includes('tool call') || message.includes('Tool:')) {
      const toolMatch = message.match(/Tool:\s*(\w+)/i) || message.match(/tool[_\s]?call[:\s]+(\w+)/i);
      return {
        actionType: 'tool_call',
        description: message.slice(0, 200),
        timestamp,
        status: 'success',
        metadata: { tool: toolMatch?.[1] || 'unknown' }
      };
    }

    if (message.includes('message sent') || message.includes('Sending message')) {
      return {
        actionType: 'message',
        description: message.slice(0, 200),
        timestamp,
        status: 'success',
        metadata: { channel: 'telegram' }
      };
    }

    if (message.includes('exec') || message.includes('command')) {
      return {
        actionType: 'exec',
        description: message.slice(0, 200),
        timestamp,
        status: 'success',
        metadata: {}
      };
    }

    if (message.includes('error') || message.includes('Error')) {
      return {
        actionType: 'error',
        description: message.slice(0, 200),
        timestamp,
        status: 'error',
        metadata: { error: message }
      };
    }

    return null; // Skip uninteresting lines
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

function checkDateRollover() {
  const today = getToday();
  if (today === currentDate) return;

  // Date changed — switch to new log file
  const newLogFile = getLogFile(today);
  console.log(`[*] Date rollover: ${currentDate} → ${today}`);
  console.log(`[*] Switching to: ${newLogFile}`);

  // Stop watching old file
  unwatchFile(currentLogFile);

  currentDate = today;
  startWatching(newLogFile);
}

// Initial setup
currentDate = getToday();
const initialLogFile = getLogFile(currentDate);

console.log('[*] Activity Sync started');
console.log(`[*] Watching: ${initialLogFile}`);

startWatching(initialLogFile);

// Check for date rollover every 60 seconds
setInterval(checkDateRollover, 60000);
