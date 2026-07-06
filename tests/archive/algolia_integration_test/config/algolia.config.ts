/**
 * Algolia API Configuration
 */

export const ALGOLIA_CONFIG = {
  AUTH_URL: process.env.ALGOLIA_AUTH_URL || 'https://authentication.risalabs.ai/api/v1/user-auth/token',
  SEARCH_URL: process.env.ALGOLIA_SEARCH_URL || 'https://apis.risalabs.ai/pa-order-creation/medical/utility/algolia-search',
  USERNAME: process.env.ALGOLIA_USERNAME || 'risa_front_end_user',
  PASSWORD: process.env.ALGOLIA_PASSWORD || 'e4Itc/E[df~z',

  // Token expiration: 2400 seconds (40 minutes)
  // We refresh 5 minutes early to be safe
  TOKEN_EXPIRATION_SECONDS: 2400,
  TOKEN_REFRESH_BUFFER_SECONDS: 300,

  // Request defaults
  DEFAULT_HITS_PER_PAGE: 2000,
  MAX_RETRIES: 3,
  TIMEOUT_MS: 30000, // 30 seconds
};

/**
 * Calculate effective token cache duration
 */
export function getTokenCacheDuration(): number {
  return (ALGOLIA_CONFIG.TOKEN_EXPIRATION_SECONDS - ALGOLIA_CONFIG.TOKEN_REFRESH_BUFFER_SECONDS) * 1000;
}
