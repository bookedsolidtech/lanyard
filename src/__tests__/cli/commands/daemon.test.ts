import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpRoot: string;
let dataDir: string;
let stdout: string[];
let stderr: string[];

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
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lanyard-daemon-cmd-'));
  dataDir = path.join(tmpRoot, 'data');
  stdout = [];
  stderr = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`__exit_${code ?? 0}__`);
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  if (tmpRoot && fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

describe('accountDaemon — status', () => {
  it('reports "not running" when no PID file exists', async () => {
    const { accountDaemon } = await import('../../../cli/commands/daemon.js');
    accountDaemon(['status']);
    const out = stdout.join('');
    expect(out).toContain('Daemon: not running');
    expect(out).toContain('Active account: (none)');
  });

  it('reports "running" with PID when the process is live (self-test)', async () => {
    const { SYNC_PID_PATH } = await import('../../../config/paths.js');
    fs.mkdirSync(path.dirname(SYNC_PID_PATH), { recursive: true });
    fs.writeFileSync(SYNC_PID_PATH, String(process.pid));
    const { setActiveAccount } = await import('../../../cli/state.js');
    setActiveAccount('work');

    const { accountDaemon } = await import('../../../cli/commands/daemon.js');
    accountDaemon(['status']);
    const out = stdout.join('');
    expect(out).toContain(`Daemon: running (pid ${process.pid})`);
    expect(out).toContain('Active account: work');
  });

  it('reports "stale PID" when the file points at a dead process', async () => {
    const { SYNC_PID_PATH } = await import('../../../config/paths.js');
    fs.mkdirSync(path.dirname(SYNC_PID_PATH), { recursive: true });
    fs.writeFileSync(SYNC_PID_PATH, '999999');

    const { accountDaemon } = await import('../../../cli/commands/daemon.js');
    accountDaemon(['status']);
    expect(stdout.join('')).toContain('stale PID file');
  });

  it('defaults to status when no subcommand is given', async () => {
    const { accountDaemon } = await import('../../../cli/commands/daemon.js');
    accountDaemon([]);
    expect(stdout.join('')).toContain('Daemon:');
  });
});

describe('accountDaemon — start', () => {
  it('refuses to start when no account is active', async () => {
    const { accountDaemon } = await import('../../../cli/commands/daemon.js');
    expect(() => accountDaemon(['start'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('No active account');
  });
});

describe('accountDaemon — stop', () => {
  it('removes the PID file (idempotent if absent)', async () => {
    const { SYNC_PID_PATH } = await import('../../../config/paths.js');
    fs.mkdirSync(path.dirname(SYNC_PID_PATH), { recursive: true });
    fs.writeFileSync(SYNC_PID_PATH, '99999');
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    const { accountDaemon } = await import('../../../cli/commands/daemon.js');
    accountDaemon(['stop']);
    expect(fs.existsSync(SYNC_PID_PATH)).toBe(false);
    expect(stdout.join('')).toContain('Daemon stopped');
  });
});

describe('accountDaemon — bad subcommand', () => {
  it('rejects an unknown subcommand with usage', async () => {
    const { accountDaemon } = await import('../../../cli/commands/daemon.js');
    expect(() => accountDaemon(['restart'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('Usage: lanyard daemon');
  });
});
