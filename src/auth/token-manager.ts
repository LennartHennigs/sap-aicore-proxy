import { config } from '../config/app-config.js';

interface TokenCache {
  token: string | null;
  expiry: number;
}

class TokenManager {
  private cache: TokenCache = {
    token: null,
    expiry: 0
  };

  private refreshPromise: Promise<string> | null = null;

  async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.cache.token && Date.now() < this.cache.expiry) {
      return this.cache.token;
    }

    // Prevent race conditions by reusing existing refresh promise
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refreshToken();
    
    try {
      const token = await this.refreshPromise;
      return token;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async refreshToken(): Promise<string> {
    const credentials = Buffer.from(
      `${config.aicore.clientId}:${config.aicore.clientSecret}`
    ).toString('base64');

    const response = await fetch(
      `${config.aicore.authUrl}/oauth/token?grant_type=client_credentials`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json() as { access_token?: string; expires_in?: number };
    
    if (!data.access_token) {
      throw new Error('No access token received from authentication service');
    }

    this.cache.token = data.access_token;
    this.cache.expiry = Date.now() + ((data.expires_in || config.auth.defaultTokenExpiry) - config.auth.tokenExpiryBuffer) * 1000;
    
    return this.cache.token!; // We know it's not null at this point
  }

  clearCache(): void {
    this.cache.token = null;
    this.cache.expiry = 0;
  }
}

export const tokenManager = new TokenManager();
