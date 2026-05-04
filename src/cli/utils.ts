export function parseFlag(args: string[], flag: string): string | null {
  const eqForm = args.find((a) => a.startsWith(`${flag}=`));
  if (eqForm) return eqForm.split('=').slice(1).join('=');
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1] ?? null;
  }
  return null;
}

export function isValidAccountName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(name);
}

export function tokenPreview(token: string | undefined): string {
  if (!token) return 'none';
  return `sk-ant-...${token.slice(-4)}`;
}

/** Strip inherited OAuth env vars so `claude auth login` always starts a fresh flow. */
export function buildLoginEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  delete env.CLAUDE_CODE_OAUTH_REFRESH_TOKEN;
  delete env.CLAUDE_CODE_OAUTH_SCOPES;
  return env;
}
