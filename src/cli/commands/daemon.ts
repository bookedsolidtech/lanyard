import {
  getDaemonPid,
  isDaemonRunning,
  startCredentialSyncDaemon,
  stopCredentialSyncDaemon,
} from '../../oauth/daemon.js';
import { getActiveAccount } from '../state.js';

export function accountDaemon(args: string[]): void {
  const [sub] = args;
  switch (sub) {
    case 'status':
    case undefined:
      status();
      return;
    case 'start':
      start();
      return;
    case 'stop':
      stop();
      return;
    default:
      process.stderr.write('Usage: lanyard daemon <status|start|stop>\n');
      process.exit(1);
  }
}

function status(): void {
  const pid = getDaemonPid();
  const active = getActiveAccount();
  if (pid === null) {
    process.stdout.write('Daemon: not running (no PID file).\n');
  } else if (isDaemonRunning()) {
    process.stdout.write(`Daemon: running (pid ${pid}).\n`);
  } else {
    process.stdout.write(`Daemon: stale PID file at pid ${pid} (process not alive).\n`);
  }
  process.stdout.write(`Active account: ${active || '(none)'}\n`);
}

function start(): void {
  const active = getActiveAccount();
  if (!active) {
    process.stderr.write(
      'No active account — daemon would exit immediately. Run `lanyard use <name>` first.\n',
    );
    process.exit(1);
  }
  startCredentialSyncDaemon();
  const pid = getDaemonPid();
  if (pid === null) {
    process.stderr.write('Failed to start daemon.\n');
    process.exit(1);
  }
  process.stdout.write(`Daemon started (pid ${pid}).\n`);
}

function stop(): void {
  stopCredentialSyncDaemon();
  process.stdout.write('Daemon stopped.\n');
}
