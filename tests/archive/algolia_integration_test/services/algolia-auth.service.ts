/**
 * Algolia Authentication Service
 *
 * Handles bearer token fetching, caching, and auto-refresh
 */

import type { TokenResponse } from '../types/algolia.types';
import { ALGOLIA_CONFIG, getTokenCacheDuration } from '../config/algolia.config';
import { createLogger } from '../utils/logger';

const logger = createLogger('Auth');

export class AlgoliaAuthService {
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  /**
   * Get a valid bearer token (from cache or fetch new)
   */
  async getAuthToken(): Promise<string> {
    // Check if cached token is still valid
    if (this.token && !this.isTokenExpired()) {
      logger.info('Using cached token');
      return this.token;
    }

    // Fetch new token
    logger.info('Fetching new bearer token...');
    const response = await this.fetchNewToken();

    // Cache token with expiration
    this.token = response.access_token;
    this.tokenExpiry = new Date(Date.now() + getTokenCacheDuration());

    logger.success(`Token obtained, expires at ${this.tokenExpiry.toISOString()}`);
    return this.token;
  }

  /**
   * Fetch a new token from the auth endpoint
   */
  private async fetchNewToken(): Promise<TokenResponse> {
    const credentials = {
      username: ALGOLIA_CONFIG.USERNAME,
      password: ALGOLIA_CONFIG.PASSWORD,
    };

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= ALGOLIA_CONFIG.MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(ALGOLIA_CONFIG.AUTH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: TokenResponse = await response.json();
        return data;
      } catch (error: any) {
        logger.error(`Attempt ${attempt}/${ALGOLIA_CONFIG.MAX_RETRIES} failed:`, error.message);

        if (attempt === ALGOLIA_CONFIG.MAX_RETRIES) {
          throw new Error(`Failed to fetch auth token after ${ALGOLIA_CONFIG.MAX_RETRIES} attempts: ${error.message}`);
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        logger.info(`Retrying in ${delay}ms...`);
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
   * Force refresh the token (useful for testing)
   */
  async refreshToken(): Promise<string> {
    this.token = null;
    this.tokenExpiry = null;
    return this.getAuthToken();
  }
}

// Export singleton instance
export const algoliaAuthService = new AlgoliaAuthService();
