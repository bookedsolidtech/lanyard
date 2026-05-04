import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpRoot: string;
let xdgData: string;
let xdgConfig: string;
let fakeHome: string;
let exitCode: number | null = null;
let stdout: string[];
let stderr: string[];

beforeEach(() => {
  vi.resetModules();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lanyard-completions-'));
  xdgData = path.join(tmpRoot, 'xdg-data');
  xdgConfig = path.join(tmpRoot, 'xdg-config');
  fakeHome = path.join(tmpRoot, 'home');
  fs.mkdirSync(fakeHome, { recursive: true });

  // Create the rc files we want to assert never get touched.
  fs.writeFileSync(path.join(fakeHome, '.zshrc'), '# user zshrc\n');
  fs.writeFileSync(path.join(fakeHome, '.bashrc'), '# user bashrc\n');
  fs.mkdirSync(path.join(fakeHome, '.config', 'fish'), { recursive: true });
  fs.writeFileSync(path.join(fakeHome, '.config', 'fish', 'config.fish'), '# user fish config\n');

  process.env.XDG_DATA_HOME = xdgData;
  process.env.XDG_CONFIG_HOME = xdgConfig;
  process.env.HOME = fakeHome;
  delete process.env.SHELL;

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
  exitCode = null;
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`__exit_${exitCode}__`);
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  if (tmpRoot && fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

function rcFilesUnchanged() {
  expect(fs.readFileSync(path.join(fakeHome, '.zshrc'), 'utf8')).toBe('# user zshrc\n');
  expect(fs.readFileSync(path.join(fakeHome, '.bashrc'), 'utf8')).toBe('# user bashrc\n');
  expect(fs.readFileSync(path.join(fakeHome, '.config', 'fish', 'config.fish'), 'utf8')).toBe(
    '# user fish config\n',
  );
}

describe('completions install', () => {
  it('zsh: writes _lanyard to $XDG_DATA_HOME/zsh/site-functions and never touches .zshrc', async () => {
    const { accountCompletions } = await import('../../../cli/commands/completions.js');
    accountCompletions(['install', '--shell', 'zsh']);

    const target = path.join(xdgData, 'zsh', 'site-functions', '_lanyard');
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toContain('#compdef lanyard');
    rcFilesUnchanged();
  });

  it('bash: writes lanyard to $XDG_DATA_HOME/bash-completion/completions and never touches .bashrc', async () => {
    const { accountCompletions } = await import('../../../cli/commands/completions.js');
    accountCompletions(['install', '--shell', 'bash']);

    const target = path.join(xdgData, 'bash-completion', 'completions', 'lanyard');
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toContain('_lanyard()');
    rcFilesUnchanged();
  });

  it('fish: writes lanyard.fish to $XDG_CONFIG_HOME/fish/completions and never touches config.fish', async () => {
    const { accountCompletions } = await import('../../../cli/commands/completions.js');
    accountCompletions(['install', '--shell', 'fish']);

    const target = path.join(xdgConfig, 'fish', 'completions', 'lanyard.fish');
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toContain('complete -c lanyard');
    rcFilesUnchanged();
  });

  it('refuses to overwrite an existing completion file without --force', async () => {
    const { accountCompletions } = await import('../../../cli/commands/completions.js');
    accountCompletions(['install', '--shell', 'zsh']);
    const target = path.join(xdgData, 'zsh', 'site-functions', '_lanyard');
    fs.writeFileSync(target, '# user-modified content\n');

    expect(() => accountCompletions(['install', '--shell', 'zsh'])).toThrow(/__exit_1__/);
    expect(fs.readFileSync(target, 'utf8')).toBe('# user-modified content\n');
    expect(stderr.join('')).toContain('already exists');
  });

  it('overwrites with --force', async () => {
    const { accountCompletions } = await import('../../../cli/commands/completions.js');
    accountCompletions(['install', '--shell', 'zsh']);
    const target = path.join(xdgData, 'zsh', 'site-functions', '_lanyard');
    fs.writeFileSync(target, 'old\n');
    accountCompletions(['install', '--shell', 'zsh', '--force']);
    expect(fs.readFileSync(target, 'utf8')).toContain('#compdef lanyard');
  });

  it('rejects an unsupported --shell value', async () => {
    const { accountCompletions } = await import('../../../cli/commands/completions.js');
    expect(() => accountCompletions(['install', '--shell', 'tcsh'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('Unsupported shell');
  });

  it('detects shell from $SHELL when --shell is omitted', async () => {
    process.env.SHELL = '/usr/local/bin/fish';
    const { accountCompletions } = await import('../../../cli/commands/completions.js');
    accountCompletions(['install']);
    const target = path.join(xdgConfig, 'fish', 'completions', 'lanyard.fish');
    expect(fs.existsSync(target)).toBe(true);
  });
});

describe('completions uninstall', () => {
  it('removes the file when present', async () => {
    const { accountCompletions } = await import('../../../cli/commands/completions.js');
    accountCompletions(['install', '--shell', 'bash']);
    const target = path.join(xdgData, 'bash-completion', 'completions', 'lanyard');
    expect(fs.existsSync(target)).toBe(true);
    accountCompletions(['uninstall', '--shell', 'bash']);
    expect(fs.existsSync(target)).toBe(false);
    rcFilesUnchanged();
  });

  it('is idempotent when the file is absent (no throw, exit 0)', async () => {
    const { accountCompletions } = await import('../../../cli/commands/completions.js');
    expect(() => accountCompletions(['uninstall', '--shell', 'zsh'])).not.toThrow();
    expect(stdout.join('')).toContain('nothing to remove');
  });
});

describe('completions print', () => {
  it('emits the script to stdout without writing any file', async () => {
    const { accountCompletions } = await import('../../../cli/commands/completions.js');
    accountCompletions(['print', '--shell', 'zsh']);
    expect(stdout.join('')).toContain('#compdef lanyard');
    expect(fs.existsSync(path.join(xdgData, 'zsh'))).toBe(false);
  });
});

describe('completions <unknown>', () => {
  it('rejects unknown subcommand with helpful usage', async () => {
    const { accountCompletions } = await import('../../../cli/commands/completions.js');
    expect(() => accountCompletions(['bogus'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('Usage');
    rcFilesUnchanged();
  });
});
