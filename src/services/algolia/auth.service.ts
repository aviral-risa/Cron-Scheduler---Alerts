/**
 * Algolia Authentication Service (Production)
 *
 * Handles bearer token fetching, caching, and auto-refresh for Algolia API
 */

interface TokenResponse {
  access_token: string;
  token_type: string;
  expiration_time: number;
}

// Lazy getter for config to ensure env vars are loaded
const getAlgoliaConfig = () => {
  // Browser environment (Vite) - must use direct property access for Vite static analysis
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return {
      AUTH_URL: import.meta.env.VITE_ALGOLIA_AUTH_URL || 'https://authentication.risalabs.ai/api/v1/user-auth/token',
      USERNAME: import.meta.env.VITE_ALGOLIA_USERNAME || 'risa_front_end_user',
      PASSWORD: import.meta.env.VITE_ALGOLIA_PASSWORD,
      TOKEN_EXPIRATION_SECONDS: 2400,
      TOKEN_REFRESH_BUFFER_SECONDS: 300,
      MAX_RETRIES: 3,
    };
  }

  // Node.js environment (backend)
  if (typeof process !== 'undefined' && process.env) {
    return {
      AUTH_URL: process.env.VITE_ALGOLIA_AUTH_URL || process.env.ALGOLIA_AUTH_URL || 'https://authentication.risalabs.ai/api/v1/user-auth/token',
      USERNAME: process.env.VITE_ALGOLIA_USERNAME || process.env.ALGOLIA_USERNAME || 'risa_front_end_user',
      PASSWORD: process.env.VITE_ALGOLIA_PASSWORD || process.env.ALGOLIA_PASSWORD,
      TOKEN_EXPIRATION_SECONDS: 2400,
      TOKEN_REFRESH_BUFFER_SECONDS: 300,
      MAX_RETRIES: 3,
    };
  }

  // Fallback
  return {
    AUTH_URL: 'https://authentication.risalabs.ai/api/v1/user-auth/token',
    USERNAME: 'risa_front_end_user',
    PASSWORD: undefined,
    TOKEN_EXPIRATION_SECONDS: 2400,
    TOKEN_REFRESH_BUFFER_SECONDS: 300,
    MAX_RETRIES: 3,
  };
};

class AlgoliaAuthService {
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  /**
   * Get a valid bearer token (from cache or fetch new)
   */
  async getAuthToken(): Promise<string> {
    // Check if cached token is still valid
    if (this.token && !this.isTokenExpired()) {
      return this.token;
    }

    // Fetch new token
    const response = await this.fetchNewToken();

    // Cache token with expiration (refresh 5 minutes early)
    const config = getAlgoliaConfig();
    this.token = response.access_token;
    const cacheDuration = (config.TOKEN_EXPIRATION_SECONDS - config.TOKEN_REFRESH_BUFFER_SECONDS) * 1000;
    this.tokenExpiry = new Date(Date.now() + cacheDuration);

    console.log(`[Algolia Auth] Token obtained, expires at ${this.tokenExpiry.toISOString()}`);
    return this.token;
  }

  /**
   * Fetch a new token from the auth endpoint
   */
  private async fetchNewToken(): Promise<TokenResponse> {
    const config = getAlgoliaConfig();
    const credentials = {
      username: config.USERNAME,
      password: config.PASSWORD,
    };

    if (!credentials.password) {
      throw new Error('ALGOLIA_PASSWORD environment variable is not set');
    }

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= config.MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(config.AUTH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error: any) {
        console.error(`[Algolia Auth] Attempt ${attempt}/${config.MAX_RETRIES} failed:`, error.message);

        if (attempt === config.MAX_RETRIES) {
          throw new Error(`Failed to fetch Algolia auth token after ${config.MAX_RETRIES} attempts: ${error.message}`);
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error('Unexpected error in fetchNewToken');
  }

  /**
   * Check if the cached token has expired
   */
  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) return true;
    return Date.now() >= this.tokenExpiry.getTime();
  }

  /**
   * Force refresh the token
   */
  async refreshToken(): Promise<string> {
    this.token = null;
    this.tokenExpiry = null;
    return this.getAuthToken();
  }
}

// Export singleton instance
export const algoliaAuthService = new AlgoliaAuthService();
