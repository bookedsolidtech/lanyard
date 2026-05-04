export interface OAuthProfile {
  account?: { email?: string; display_name?: string; uuid?: string };
  organization?: {
    uuid?: string;
    organization_type?: string;
    rate_limit_tier?: string;
    billing_type?: string;
    has_extra_usage_enabled?: boolean;
  };
}

export async function fetchOAuthProfile(accessToken: string): Promise<OAuthProfile | null> {
  const { request } = await import('node:https');
  return new Promise((resolve) => {
    const req = request(
      'https://api.anthropic.com/api/oauth/profile',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as OAuthProfile);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

export function formatOrgType(orgType: string | undefined): string {
  switch (orgType) {
    case 'claude_max':
      return 'Max';
    case 'claude_pro':
      return 'Pro';
    case 'claude_team':
      return 'Team';
    case 'claude_enterprise':
      return 'Enterprise';
    default:
      return orgType || 'unknown';
  }
}
