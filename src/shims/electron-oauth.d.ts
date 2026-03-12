interface ElectronOAuthConfig {
  clientId: string;
  clientSecret?: string;
  scope: string;
}

interface ElectronOAuthResult {
  success: boolean;
  tokens?: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };
  error?: string;
}

interface ElectronOAuthBridge {
  authenticate(config: ElectronOAuthConfig): Promise<ElectronOAuthResult>;
}

declare global {
  interface Window {
    electronOAuth?: ElectronOAuthBridge;
  }
}

export {};
