#!/usr/bin/env node
/**
 * Activity Sync - Watches OpenClaw logs and syncs to Mission Control
 * Run: node scripts/activity-sync.mjs
 */

import { createReadStream, watchFile, statSync } from 'fs';
import { createInterface } from 'readline';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const CONVEX_URL = process.env.CONVEX_URL || 'https://accomplished-rabbit-353.convex.cloud';
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const LOG_FILE = process.argv[2] || `/tmp/openclaw/openclaw-${today}.log`;
const client = new ConvexHttpClient(CONVEX_URL);

let lastPosition = 0;

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
  const stats = statSync(LOG_FILE);
  if (stats.size <= lastPosition) return;
  
  const stream = createReadStream(LOG_FILE, {
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
}

// Initial sync
console.log('[*] Activity Sync started');
console.log(`[*] Watching: ${LOG_FILE}`);

// Get current file size to only process new entries
try {
  lastPosition = statSync(LOG_FILE).size;
  console.log(`[*] Starting from position: ${lastPosition}`);
} catch {
  console.log('[*] Log file not found, will create when available');
}

// Watch for changes
watchFile(LOG_FILE, { interval: 2000 }, async () => {
  await processNewLines();
});

// Keep running
setInterval(() => {}, 1000);
