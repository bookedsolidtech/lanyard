import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpRoot: string;
let dataDir: string;

vi.mock('env-paths', () => ({
  default: () => ({
    config: dataDir,
    data: dataDir,
    cache: dataDir,
    log: dataDir,
    temp: dataDir,
  }),
}));

beforeEach(() => {
  vi.resetModules();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lanyard-daemon-'));
  dataDir = path.join(tmpRoot, 'data');
});

afterEach(() => {
  if (tmpRoot && fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

describe('getDaemonPid', () => {
  it('returns null when no PID file exists', async () => {
    const { getDaemonPid } = await import('../../oauth/daemon.js');
    expect(getDaemonPid()).toBeNull();
  });

  it('returns the parsed PID when a valid file exists', async () => {
    const { SYNC_PID_PATH } = await import('../../config/paths.js');
    fs.mkdirSync(path.dirname(SYNC_PID_PATH), { recursive: true });
    fs.writeFileSync(SYNC_PID_PATH, '12345\n');
    const { getDaemonPid } = await import('../../oauth/daemon.js');
    expect(getDaemonPid()).toBe(12345);
  });

  it('returns null when the file contains garbage', async () => {
    const { SYNC_PID_PATH } = await import('../../config/paths.js');
    fs.mkdirSync(path.dirname(SYNC_PID_PATH), { recursive: true });
    fs.writeFileSync(SYNC_PID_PATH, 'not-a-pid');
    const { getDaemonPid } = await import('../../oauth/daemon.js');
    expect(getDaemonPid()).toBeNull();
  });

  it('returns null for non-positive PIDs', async () => {
    const { SYNC_PID_PATH } = await import('../../config/paths.js');
    fs.mkdirSync(path.dirname(SYNC_PID_PATH), { recursive: true });
    fs.writeFileSync(SYNC_PID_PATH, '0\n');
    const { getDaemonPid } = await import('../../oauth/daemon.js');
    expect(getDaemonPid()).toBeNull();
  });
});

describe('isDaemonRunning', () => {
  it('returns false when there is no PID file', async () => {
    const { isDaemonRunning } = await import('../../oauth/daemon.js');
    expect(isDaemonRunning()).toBe(false);
  });

  it('returns true when process.kill(pid, 0) succeeds (live process)', async () => {
    const { SYNC_PID_PATH } = await import('../../config/paths.js');
    fs.mkdirSync(path.dirname(SYNC_PID_PATH), { recursive: true });
    // Use the current process PID — process.kill(self, 0) always succeeds.
    fs.writeFileSync(SYNC_PID_PATH, String(process.pid));
    const { isDaemonRunning } = await import('../../oauth/daemon.js');
    expect(isDaemonRunning()).toBe(true);
  });

  it('returns false when the process is no longer alive', async () => {
    const { SYNC_PID_PATH } = await import('../../config/paths.js');
    fs.mkdirSync(path.dirname(SYNC_PID_PATH), { recursive: true });
    // PID 1 is init/launchd — we can't kill it but signal-0 against an
    // unrelated PID we don't own returns EPERM, which the helper treats
    // as alive. Use a PID that almost certainly doesn't exist.
    fs.writeFileSync(SYNC_PID_PATH, '999999');
    const { isDaemonRunning } = await import('../../oauth/daemon.js');
    expect(isDaemonRunning()).toBe(false);
  });
});

describe('stopCredentialSyncDaemon', () => {
  it('removes the PID file when present', async () => {
    const { SYNC_PID_PATH } = await import('../../config/paths.js');
    fs.mkdirSync(path.dirname(SYNC_PID_PATH), { recursive: true });
    // Use our own PID so the SIGTERM goes to a real process we can survive
    // (process.kill against self with a real signal is dangerous; mock kill
    // instead).
    fs.writeFileSync(SYNC_PID_PATH, '99999');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const { stopCredentialSyncDaemon } = await import('../../oauth/daemon.js');
    stopCredentialSyncDaemon();
    expect(fs.existsSync(SYNC_PID_PATH)).toBe(false);
    expect(killSpy).toHaveBeenCalledWith(99999, 'SIGTERM');
    killSpy.mockRestore();
  });

  it('is idempotent when no PID file exists (no throw)', async () => {
    const { stopCredentialSyncDaemon } = await import('../../oauth/daemon.js');
    expect(() => stopCredentialSyncDaemon()).not.toThrow();
  });

  it('still removes the PID file if signaling fails (process already gone)', async () => {
    const { SYNC_PID_PATH } = await import('../../config/paths.js');
    fs.mkdirSync(path.dirname(SYNC_PID_PATH), { recursive: true });
    fs.writeFileSync(SYNC_PID_PATH, '99999');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });
    const { stopCredentialSyncDaemon } = await import('../../oauth/daemon.js');
    stopCredentialSyncDaemon();
    expect(fs.existsSync(SYNC_PID_PATH)).toBe(false);
    killSpy.mockRestore();
  });
});

describe('SYNC_INTERVAL_MS / SYNC_MAX_LIFETIME_MS exports', () => {
  it('exports the production defaults (45s poll, 8h lifetime)', async () => {
    const { SYNC_INTERVAL_MS, SYNC_MAX_LIFETIME_MS } = await import('../../oauth/daemon.js');
    expect(SYNC_INTERVAL_MS).toBe(45_000);
    expect(SYNC_MAX_LIFETIME_MS).toBe(8 * 60 * 60 * 1000);
  });
});
