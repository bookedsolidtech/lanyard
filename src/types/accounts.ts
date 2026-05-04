export interface Account {
  description?: string;
  credential_store: 'keychain';
  keychain_service: string;
}

export interface AccountsConfig {
  version: string;
  accounts: Record<string, Account>;
}

export interface AccountCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string | number;
  scopes?: string[];
  subscriptionType?: string;
  rateLimitTier?: string;
}
