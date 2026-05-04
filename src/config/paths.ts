import envPaths from 'env-paths';
import path from 'node:path';

const paths = envPaths('lanyard', { suffix: '' });

export const CONFIG_DIR = paths.config;
export const DATA_DIR = paths.data;
export const ACCOUNTS_PATH = path.join(CONFIG_DIR, 'accounts.yaml');
export const ACTIVE_ACCOUNT_PATH = path.join(DATA_DIR, 'active-account');
export const SWITCH_LOCK_PATH = path.join(DATA_DIR, 'account-switch.lock');
export const SYNC_PID_PATH = path.join(DATA_DIR, 'credential-sync.pid');
export const WRITTEN_RT_PATH = path.join(DATA_DIR, 'written-refresh-token');

export const KEYCHAIN_ACCOUNT = 'lanyard';
export const KEYCHAIN_SERVICE_PREFIX = 'lanyard-';
export const DEFAULT_KEYCHAIN_SERVICE = 'lanyard-__default__';
export const IDENTITY_MARKER = '_lanyardAccount';

export function keychainServiceFor(name: string): string {
  return `${KEYCHAIN_SERVICE_PREFIX}${name}`;
}
