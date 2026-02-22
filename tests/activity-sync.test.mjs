#!/usr/bin/env node
/**
 * Unit tests for activity-sync.mjs
 * Run: ACTIVITY_SYNC_TEST=1 node --test tests/activity-sync.test.mjs
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Prevent main module side effects
process.env.ACTIVITY_SYNC_TEST = '1';

const { discoverLogDir, dirHasLogFiles, findLatestLogFile, parseLogLine } = await import('../scripts/activity-sync.mjs');

// --- Test helpers ---

function makeTmpDir(prefix = 'activity-sync-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function createFakeLogFile(dir, name = 'openclaw-2026-02-22.log', content = '{}') {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

// --- Tests ---

describe('dirHasLogFiles', () => {
  let tmp;
  before(() => { tmp = makeTmpDir(); });
  after(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('returns false for non-existent directory', () => {
    assert.equal(dirHasLogFiles('/tmp/nonexistent-openclaw-test-xyz'), false);
  });

  it('returns false for empty directory', () => {
    assert.equal(dirHasLogFiles(tmp), false);
  });

  it('returns true when openclaw log files exist', () => {
    createFakeLogFile(tmp);
    assert.equal(dirHasLogFiles(tmp), true);
  });

  it('returns false for non-matching filenames', () => {
    const d = makeTmpDir();
    writeFileSync(join(d, 'other.log'), 'data');
    writeFileSync(join(d, 'openclaw.txt'), 'data');
    assert.equal(dirHasLogFiles(d), false);
    rmSync(d, { recursive: true, force: true });
  });
});

describe('discoverLogDir', () => {
  let tmpBase;
  const origEnv = process.env.LOG_DIR;

  before(() => {
    tmpBase = makeTmpDir('discover-test-');
  });
  after(() => {
    process.env.LOG_DIR = origEnv || '';
    if (!origEnv) delete process.env.LOG_DIR;
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('returns LOG_DIR env var when set and directory exists', () => {
    const customDir = join(tmpBase, 'custom-logs');
    mkdirSync(customDir, { recursive: true });
    createFakeLogFile(customDir);
    process.env.LOG_DIR = customDir;
    const result = discoverLogDir();
    assert.equal(result, customDir);
    delete process.env.LOG_DIR;
  });

  it('LOG_DIR env var takes priority even without log files if dir exists', () => {
    const emptyDir = join(tmpBase, 'empty-custom');
    mkdirSync(emptyDir, { recursive: true });
    process.env.LOG_DIR = emptyDir;
    const result = discoverLogDir();
    assert.equal(result, emptyDir);
    delete process.env.LOG_DIR;
  });

  it('finds UID-namespaced directory on this system', () => {
    // This test runs on the actual system — /tmp/openclaw-1000/ should exist
    delete process.env.LOG_DIR;
    const result = discoverLogDir();
    assert.ok(result, 'Should find a log directory');
    assert.ok(result.includes('/tmp/openclaw'), `Expected /tmp/openclaw* path, got: ${result}`);
  });
});

describe('findLatestLogFile', () => {
  let tmp;
  before(() => {
    tmp = makeTmpDir('find-latest-');
  });
  after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns null for empty directory', () => {
    const d = makeTmpDir('empty-');
    const result = findLatestLogFile(d);
    assert.equal(result, null);
    rmSync(d, { recursive: true, force: true });
  });

  it('returns the only log file', () => {
    const path = createFakeLogFile(tmp, 'openclaw-2026-02-20.log');
    const result = findLatestLogFile(tmp);
    assert.equal(result, path);
  });

  it('returns the most recently modified file', async () => {
    const older = createFakeLogFile(tmp, 'openclaw-2026-02-19.log', 'old');
    // Ensure different mtime
    await new Promise(r => setTimeout(r, 50));
    const newer = createFakeLogFile(tmp, 'openclaw-2026-02-22.log', 'new');
    const result = findLatestLogFile(tmp);
    assert.equal(result, newer);
  });

  it('returns null for non-existent directory', () => {
    const result = findLatestLogFile('/tmp/nonexistent-openclaw-test-xyz');
    assert.equal(result, null);
  });
});

describe('parseLogLine', () => {
  const ts = '2026-02-22T10:00:00.000Z';

  it('returns null for invalid JSON', () => {
    assert.equal(parseLogLine('not json'), null);
    assert.equal(parseLogLine(''), null);
  });

  it('parses ERROR log level', () => {
    const line = JSON.stringify({
      '0': 'Something went wrong',
      time: ts,
      _meta: { logLevelName: 'ERROR' }
    });
    const result = parseLogLine(line);
    assert.equal(result.actionType, 'error');
    assert.equal(result.status, 'error');
    assert.equal(result.category, 'important');
    assert.ok(result.description.includes('Something went wrong'));
  });

  it('parses WARN log level', () => {
    const line = JSON.stringify({
      '0': 'Rate limit approaching',
      time: ts,
      _meta: { logLevelName: 'WARN' }
    });
    const result = parseLogLine(line);
    assert.equal(result.actionType, 'warning');
    assert.equal(result.status, 'success');
  });

  it('parses DEBUG tool call', () => {
    const line = JSON.stringify({
      '0': 'embedded run tool start: tool=web_search',
      time: ts,
      _meta: { logLevelName: 'DEBUG' }
    });
    const result = parseLogLine(line);
    assert.equal(result.actionType, 'tool_call');
    assert.equal(result.metadata.tool, 'web_search');
  });

  it('skips DEBUG non-tool-call lines', () => {
    const line = JSON.stringify({
      '0': 'heartbeat check',
      time: ts,
      _meta: { logLevelName: 'DEBUG' }
    });
    assert.equal(parseLogLine(line), null);
  });

  it('parses agent_start from INFO', () => {
    const line = JSON.stringify({
      '0': 'agent model: claude-opus-4-6',
      time: ts,
      _meta: { logLevelName: 'INFO' }
    });
    const result = parseLogLine(line);
    assert.equal(result.actionType, 'agent_start');
    assert.ok(result.metadata.model.includes('claude-opus'));
  });

  it('parses agent_no_reply', () => {
    const line = JSON.stringify({
      '0': 'No reply from agent',
      time: ts,
      _meta: { logLevelName: 'INFO' }
    });
    const result = parseLogLine(line);
    assert.equal(result.actionType, 'agent_no_reply');
  });

  it('returns null for unrecognized INFO messages', () => {
    const line = JSON.stringify({
      '0': 'some random info message',
      time: ts,
      _meta: { logLevelName: 'INFO' }
    });
    assert.equal(parseLogLine(line), null);
  });

  it('uses field "1" when "0" is missing', () => {
    const line = JSON.stringify({
      '1': 'agent model: gpt-4o',
      time: ts,
      _meta: { logLevelName: 'INFO' }
    });
    const result = parseLogLine(line);
    assert.equal(result.actionType, 'agent_start');
    assert.equal(result.metadata.model, 'gpt-4o');
  });

  it('skips self-referential mission-control messages', () => {
    const line = JSON.stringify({
      '0': '[mission-control-sync] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
      time: ts,
      _meta: { logLevelName: 'ERROR' }
    });
    assert.equal(parseLogLine(line), null);
  });

  it('skips activity-sync self-referential messages', () => {
    const line = JSON.stringify({
      '0': 'activity-sync crashed with error',
      time: ts,
      _meta: { logLevelName: 'ERROR' }
    });
    assert.equal(parseLogLine(line), null);
  });

  it('skips routine tool calls (exec, read, write, edit)', () => {
    for (const tool of ['exec', 'read', 'write', 'edit', 'process', 'session_status']) {
      const line = JSON.stringify({
        '0': `embedded run tool start: tool=${tool}`,
        time: ts,
        _meta: { logLevelName: 'DEBUG' }
      });
      assert.equal(parseLogLine(line), null, `Should skip tool: ${tool}`);
    }
  });

  it('keeps interesting tool calls (message, web_search, browser)', () => {
    for (const tool of ['message', 'web_search', 'browser', 'tts', 'sessions_spawn']) {
      const line = JSON.stringify({
        '0': `embedded run tool start: tool=${tool}`,
        time: ts,
        _meta: { logLevelName: 'DEBUG' }
      });
      const result = parseLogLine(line);
      assert.ok(result, `Should keep tool: ${tool}`);
      assert.equal(result.metadata.tool, tool);
    }
  });

  it('truncates long descriptions to 200 chars', () => {
    const longMsg = 'x'.repeat(500);
    const line = JSON.stringify({
      '0': longMsg,
      time: ts,
      _meta: { logLevelName: 'ERROR' }
    });
    const result = parseLogLine(line);
    assert.equal(result.description.length, 200);
  });
});

describe('resilience to log directory changes', () => {
  it('discoverLogDir re-discovers when called again after directory changes', () => {
    // Simulate: old dir goes stale, new dir appears
    const oldDir = makeTmpDir('old-openclaw-');
    const newDir = makeTmpDir('new-openclaw-');

    createFakeLogFile(oldDir, 'openclaw-2026-02-19.log', 'old');
    createFakeLogFile(newDir, 'openclaw-2026-02-22.log', 'new');

    // With LOG_DIR pointing to old, it returns old
    process.env.LOG_DIR = oldDir;
    assert.equal(discoverLogDir(), oldDir);

    // Change LOG_DIR to new, re-discover returns new
    process.env.LOG_DIR = newDir;
    assert.equal(discoverLogDir(), newDir);

    delete process.env.LOG_DIR;
    rmSync(oldDir, { recursive: true, force: true });
    rmSync(newDir, { recursive: true, force: true });
  });
});
