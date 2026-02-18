#!/usr/bin/env node
/**
 * File Watcher - Automatically indexes new/changed files for Global Search (Supabase)
 * Run: node scripts/file-watcher.mjs
 */

import { watch, readFileSync, statSync, readdirSync } from 'fs';
import { join, basename, extname } from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKSPACE = '/home/h2/clawd';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[!] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// File extensions to index
const INDEXABLE_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml', '.sh', '.py', '.js', '.ts', '.mjs'
]);

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.cache'
]);

// Max file size to index (500KB)
const MAX_FILE_SIZE = 500 * 1024;

// Debounce tracking
const pendingUpdates = new Map();
const DEBOUNCE_MS = 1000;

async function indexFile(filePath) {
  try {
    const stats = statSync(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      console.log(`[skip] ${filePath} (too large: ${stats.size} bytes)`);
      return;
    }

    const content = readFileSync(filePath, 'utf8');
    const fileName = basename(filePath);

    const { error } = await supabase
      .from('indexed_documents')
      .upsert(
        {
          file_path: filePath,
          file_name: fileName,
          content: content.slice(0, 50000), // 50KB limit
          last_indexed: new Date().toISOString(),
          size: stats.size,
        },
        { onConflict: 'file_path' }
      );

    if (error) throw error;
    console.log(`[indexed] ${filePath}`);
  } catch (err) {
    console.error(`[error] ${filePath}:`, err.message);
  }
}

function shouldIndex(filePath) {
  const ext = extname(filePath).toLowerCase();
  return INDEXABLE_EXTENSIONS.has(ext);
}

function debounceIndex(filePath) {
  if (pendingUpdates.has(filePath)) {
    clearTimeout(pendingUpdates.get(filePath));
  }
  pendingUpdates.set(filePath, setTimeout(() => {
    pendingUpdates.delete(filePath);
    indexFile(filePath);
  }, DEBOUNCE_MS));
}

function watchDirectory(dir) {
  try {
    watch(dir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      const fullPath = join(dir, filename);

      // Skip unwanted directories
      for (const skipDir of SKIP_DIRS) {
        if (filename.includes(skipDir)) return;
      }

      // Check if file should be indexed
      if (!shouldIndex(fullPath)) return;

      // Check if file exists (might have been deleted)
      try {
        statSync(fullPath);
        debounceIndex(fullPath);
      } catch {
        console.log(`[deleted] ${fullPath}`);
      }
    });

    console.log(`[watching] ${dir}`);
  } catch (err) {
    console.error(`[error] Could not watch ${dir}:`, err.message);
  }
}

// Initial scan for any files that might have been missed
async function initialScan(dir, depth = 0) {
  if (depth > 5) return; // Max depth

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await initialScan(fullPath, depth + 1);
        }
      } else if (entry.isFile() && shouldIndex(fullPath)) {
        await indexFile(fullPath);
      }
    }
  } catch {
    // Ignore permission errors etc
  }
}

console.log('[*] File Watcher started (Supabase)');
console.log(`[*] Watching: ${WORKSPACE}`);
console.log('[*] Extensions:', [...INDEXABLE_EXTENSIONS].join(', '));

// Initial scan to index all existing files
console.log('[*] Running initial scan...');
await initialScan(WORKSPACE);
console.log('[*] Initial scan complete');

// Start watching for changes
watchDirectory(WORKSPACE);

// Also watch memory directory specifically
watchDirectory(join(WORKSPACE, 'memory'));

// Re-scan every 30 minutes to catch anything missed
setInterval(() => {
  console.log('[*] Periodic re-scan...');
  initialScan(WORKSPACE).then(() => console.log('[*] Re-scan complete'));
}, 30 * 60 * 1000);

// Keep running
setInterval(() => {}, 10000);
