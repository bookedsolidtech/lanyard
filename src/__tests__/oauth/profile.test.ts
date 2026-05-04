import { afterEach, describe, expect, it, vi } from 'vitest';

const mockRequest = vi.fn();

vi.mock('node:https', () => ({
  request: (...args: unknown[]) => mockRequest(...args),
}));

const { fetchOAuthProfile, formatOrgType } = await import('../../oauth/profile.js');

interface FakeResponse {
  on: (event: string, handler: (...args: unknown[]) => void) => FakeResponse;
}

interface FakeRequest {
  on: (event: string, handler: (...args: unknown[]) => void) => FakeRequest;
  end: () => void;
  destroy: () => void;
}

function makeRequestMock(behavior: (req: FakeRequest, res: FakeResponse) => void): {
  request: ReturnType<typeof vi.fn>;
} {
  return {
    request: vi.fn((_url: unknown, _opts: unknown, callback: (res: FakeResponse) => void) => {
      const dataHandlers: Array<(chunk: Buffer) => void> = [];
      const endHandlers: Array<() => void> = [];
      const errorHandlers: Array<(err: Error) => void> = [];
      const timeoutHandlers: Array<() => void> = [];

      const res: FakeResponse = {
        on: (event, handler) => {
          if (event === 'data') dataHandlers.push(handler as (c: Buffer) => void);
          if (event === 'end') endHandlers.push(handler as () => void);
          return res;
        },
      };
      const req: FakeRequest = {
        on: (event, handler) => {
          if (event === 'error') errorHandlers.push(handler as (e: Error) => void);
          if (event === 'timeout') timeoutHandlers.push(handler as () => void);
          return req;
        },
        end: () => {
          // schedule the configured behavior on the next tick
          queueMicrotask(() => {
            // expose handlers via closure for the behavior
            (req as unknown as { __dispatch: typeof dispatch }).__dispatch = dispatch;
            behavior(req, res);
          });
        },
        destroy: () => undefined,
      };

      function dispatch(kind: 'data' | 'end' | 'error' | 'timeout', payload?: unknown) {
        if (kind === 'data') dataHandlers.forEach((h) => h(payload as Buffer));
        if (kind === 'end') endHandlers.forEach((h) => h());
        if (kind === 'error') errorHandlers.forEach((h) => h(payload as Error));
        if (kind === 'timeout') timeoutHandlers.forEach((h) => h());
      }
      // give the test access to the response stream via the request mock-call value
      callback(res);
      return req;
    }),
  };
}

afterEach(() => {
  mockRequest.mockReset();
});

describe('fetchOAuthProfile', () => {
  it('resolves to the parsed JSON body on 200', async () => {
    const body = JSON.stringify({
      account: { email: 'jane@example.com', display_name: 'Jane' },
      organization: { organization_type: 'claude_max', rate_limit_tier: 'max_5' },
    });
    const m = makeRequestMock((req, _res) => {
      const dispatch = (req as unknown as { __dispatch: (k: string, p?: unknown) => void })
        .__dispatch;
      dispatch('data', Buffer.from(body));
      dispatch('end');
    });
    mockRequest.mockImplementation(m.request);
    const profile = await fetchOAuthProfile('tok');
    expect(profile?.account?.email).toBe('jane@example.com');
    expect(profile?.organization?.organization_type).toBe('claude_max');
  });

  it('passes the access token as a Bearer Authorization header', async () => {
    const m = makeRequestMock((req, _res) => {
      const dispatch = (req as unknown as { __dispatch: (k: string, p?: unknown) => void })
        .__dispatch;
      dispatch('data', Buffer.from('{}'));
      dispatch('end');
    });
    mockRequest.mockImplementation(m.request);
    await fetchOAuthProfile('access-token-value');
    const opts = m.request.mock.calls[0]?.[1] as { headers: Record<string, string> } | undefined;
    expect(opts?.headers.Authorization).toBe('Bearer access-token-value');
  });

  it('returns null when the body is not valid JSON', async () => {
    const m = makeRequestMock((req, _res) => {
      const dispatch = (req as unknown as { __dispatch: (k: string, p?: unknown) => void })
        .__dispatch;
      dispatch('data', Buffer.from('<html>oops</html>'));
      dispatch('end');
    });
    mockRequest.mockImplementation(m.request);
    expect(await fetchOAuthProfile('tok')).toBeNull();
  });

  it('returns null on network error', async () => {
    const m = makeRequestMock((req, _res) => {
      const dispatch = (req as unknown as { __dispatch: (k: string, p?: unknown) => void })
        .__dispatch;
      dispatch('error', new Error('ECONNREFUSED'));
    });
    mockRequest.mockImplementation(m.request);
    expect(await fetchOAuthProfile('tok')).toBeNull();
  });

  it('returns null on timeout', async () => {
    const m = makeRequestMock((req, _res) => {
      const dispatch = (req as unknown as { __dispatch: (k: string, p?: unknown) => void })
        .__dispatch;
      dispatch('timeout');
    });
    mockRequest.mockImplementation(m.request);
    expect(await fetchOAuthProfile('tok')).toBeNull();
  });
});

describe('formatOrgType', () => {
  it.each([
    ['claude_max', 'Max'],
    ['claude_pro', 'Pro'],
    ['claude_team', 'Team'],
    ['claude_enterprise', 'Enterprise'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatOrgType(input)).toBe(expected);
  });

  it('echoes unknown types verbatim', () => {
    expect(formatOrgType('claude_future')).toBe('claude_future');
  });

  it('returns "unknown" for missing input', () => {
    expect(formatOrgType(undefined)).toBe('unknown');
  });
});
