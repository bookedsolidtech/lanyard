import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import {
  ACTIVE_ACCOUNT_PATH,
  DATA_DIR,
  DEFAULT_KEYCHAIN_SERVICE,
  IDENTITY_MARKER,
  KEYCHAIN_ACCOUNT,
  KEYCHAIN_SERVICE_PREFIX,
  SYNC_PID_PATH,
} from '../config/paths.js';

/** How often the background sync daemon checks for refreshed tokens. */
export const SYNC_INTERVAL_MS = 45_000;
/** How long the daemon runs before auto-exiting (8 hours). */
export const SYNC_MAX_LIFETIME_MS = 8 * 60 * 60 * 1000;

export function startCredentialSyncDaemon(): void {
  stopCredentialSyncDaemon();
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const daemonScript = buildDaemonScript();
    const child = spawn(process.execPath, ['--eval', daemonScript], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        LANYARD_DATA_DIR: DATA_DIR,
        LANYARD_ACTIVE_ACCOUNT_PATH: ACTIVE_ACCOUNT_PATH,
        LANYARD_SYNC_PID_PATH: SYNC_PID_PATH,
        LANYARD_SYNC_INTERVAL_MS: String(SYNC_INTERVAL_MS),
        LANYARD_SYNC_MAX_LIFETIME_MS: String(SYNC_MAX_LIFETIME_MS),
        LANYARD_KEYCHAIN_ACCOUNT: KEYCHAIN_ACCOUNT,
        LANYARD_KEYCHAIN_SERVICE_PREFIX: KEYCHAIN_SERVICE_PREFIX,
        LANYARD_DEFAULT_KEYCHAIN_SERVICE: DEFAULT_KEYCHAIN_SERVICE,
        LANYARD_IDENTITY_MARKER: IDENTITY_MARKER,
      },
    });
    child.unref();
    if (child.pid) {
      writeFileSync(SYNC_PID_PATH, String(child.pid), 'utf8');
    }
  } catch {
    /* non-fatal — sync just won't happen in the background */
  }
}

export function stopCredentialSyncDaemon(): void {
  try {
    const pid = parseInt(readFileSync(SYNC_PID_PATH, 'utf8').trim(), 10);
    if (!isNaN(pid) && pid > 0) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* process already exited */
      }
    }
    unlinkSync(SYNC_PID_PATH);
  } catch {
    /* no PID file or already cleaned up */
  }
}

export function getDaemonPid(): number | null {
  try {
    const pid = parseInt(readFileSync(SYNC_PID_PATH, 'utf8').trim(), 10);
    return !isNaN(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function isDaemonRunning(): boolean {
  const pid = getDaemonPid();
  if (pid === null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Self-contained Node script run with `node --eval`. Uses only Node builtins
 * and the macOS `security` command, so it has no module-resolution dependency
 * on lanyard's install location.
 */
function buildDaemonScript(): string {
  return `
'use strict';
const { execFileSync } = require('node:child_process');
const { readFileSync, unlinkSync, existsSync } = require('node:fs');
const { userInfo } = require('node:os');

const ACTIVE_ACCOUNT_PATH = process.env.LANYARD_ACTIVE_ACCOUNT_PATH;
const SYNC_PID_PATH = process.env.LANYARD_SYNC_PID_PATH;
const SYNC_INTERVAL = parseInt(process.env.LANYARD_SYNC_INTERVAL_MS || '45000', 10);
const MAX_LIFETIME = parseInt(process.env.LANYARD_SYNC_MAX_LIFETIME_MS || '28800000', 10);
const KC_ACCOUNT = process.env.LANYARD_KEYCHAIN_ACCOUNT || 'lanyard';
const SERVICE_PREFIX = process.env.LANYARD_KEYCHAIN_SERVICE_PREFIX || 'lanyard-';
const DEFAULT_SERVICE = process.env.LANYARD_DEFAULT_KEYCHAIN_SERVICE || 'lanyard-__default__';
const MARKER = process.env.LANYARD_IDENTITY_MARKER || '_lanyardAccount';
const startTime = Date.now();

function readCC() {
  try {
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-a', userInfo().username, '-w'],
      { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' }
    );
    return raw.trim();
  } catch { return null; }
}

function readSvc(service) {
  try {
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-s', service, '-a', KC_ACCOUNT, '-w'],
      { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' }
    );
    return raw.trim();
  } catch { return null; }
}

function writeSvc(service, data) {
  execFileSync(
    'security',
    ['add-generic-password', '-s', service, '-a', KC_ACCOUNT, '-w', data, '-U'],
    { stdio: 'pipe' }
  );
}

function getActiveAccount() {
  try {
    const name = readFileSync(ACTIVE_ACCOUNT_PATH, 'utf8').trim();
    if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) return null;
    return name;
  } catch { return null; }
}

function extractRT(raw) {
  try {
    const parsed = JSON.parse(raw);
    const inner = parsed.claudeAiOauth || parsed;
    return (inner && inner.refreshToken) || null;
  } catch { return null; }
}

function sync() {
  const name = getActiveAccount();
  if (!name) { cleanup(); return; }
  if (Date.now() - startTime > MAX_LIFETIME) { cleanup(); return; }
  if (!existsSync(SYNC_PID_PATH)) { process.exit(0); }

  const service = SERVICE_PREFIX + name;
  const ccRaw = readCC();
  if (!ccRaw) return;
  const storedRaw = readSvc(service);
  if (ccRaw === storedRaw) return;

  try {
    const ccParsed = JSON.parse(ccRaw);
    const marker = ccParsed[MARKER];
    if (typeof marker === 'string' && marker !== name) return;
    if (typeof marker !== 'string') {
      const defaultRaw = readSvc(DEFAULT_SERVICE);
      if (defaultRaw) {
        const defaultRT = extractRT(defaultRaw);
        const ccRT = extractRT(ccRaw);
        if (defaultRT && ccRT && defaultRT === ccRT) return;
      }
    }
    delete ccParsed[MARKER];
    writeSvc(service, JSON.stringify(ccParsed));
  } catch { /* best-effort */ }
}

function cleanup() {
  try { unlinkSync(SYNC_PID_PATH); } catch { /* gone */ }
  process.exit(0);
}

setTimeout(() => {
  sync();
  const interval = setInterval(() => {
    try { sync(); } catch { cleanup(); }
  }, SYNC_INTERVAL);
  interval.unref();
}, 10000);

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
`.trim();
}
