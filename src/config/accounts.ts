import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { z } from 'zod';
import type { Account, AccountsConfig } from '../types/accounts.js';
import { ACCOUNTS_PATH } from './paths.js';

const TOKEN_PATTERN = /sk-ant-/;

const AccountSchema = z.object({
  description: z.string().optional(),
  credential_store: z.literal('keychain'),
  keychain_service: z.string(),
});

const AccountsConfigSchema = z.object({
  version: z.string(),
  accounts: z.record(AccountSchema),
});

function validateNoInlineTokens(raw: string): void {
  if (TOKEN_PATTERN.test(raw)) {
    throw new Error(
      'accounts.yaml contains what appears to be an inline token (sk-ant-*). ' +
        'Tokens must be stored in Keychain, never in config files.',
    );
  }
}

export function loadAccounts(): AccountsConfig {
  if (!fs.existsSync(ACCOUNTS_PATH)) {
    return { version: '1', accounts: {} };
  }
  const raw = fs.readFileSync(ACCOUNTS_PATH, 'utf8');
  validateNoInlineTokens(raw);
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse accounts YAML at ${ACCOUNTS_PATH}: ${err instanceof Error ? err.message : err}`,
    );
  }
  try {
    return AccountsConfigSchema.parse(parsed);
  } catch (err) {
    throw new Error(
      `Invalid accounts config at ${ACCOUNTS_PATH}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

export function saveAccounts(config: AccountsConfig): void {
  const dir = path.dirname(ACCOUNTS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const yaml = stringifyYaml(config, { lineWidth: 120 });
  validateNoInlineTokens(yaml);
  fs.writeFileSync(ACCOUNTS_PATH, yaml, 'utf8');
}

export function getAccount(name: string): Account | undefined {
  return loadAccounts().accounts[name];
}

export function upsertAccount(name: string, account: Account): void {
  const config = loadAccounts();
  config.accounts[name] = account;
  saveAccounts(config);
}

export function removeAccount(name: string): boolean {
  const config = loadAccounts();
  if (!(name in config.accounts)) return false;
  delete config.accounts[name];
  saveAccounts(config);
  return true;
}

export function listAccountNames(): string[] {
  return Object.keys(loadAccounts().accounts);
}
