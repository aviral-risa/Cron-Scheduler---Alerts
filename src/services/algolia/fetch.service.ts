/**
 * Algolia Data Fetching Service (Production)
 *
 * Handles fetching order data from Algolia API with pagination and retry logic
 */

import { algoliaAuthService } from './auth.service';

interface AlgoliaOrder {
  objectID: string;
  id: string;
  order_id: string;
  org_id: string;
  assigned_to_name: string;
  master_auth_status: string;
  created_at_iso: string;
  assigned_at_iso?: string | null;
  date_of_work_iso?: string | null;
  [key: string]: any;
}

interface AlgoliaSearchResponse {
  success: boolean;
  hits: AlgoliaOrder[];
  nb_hits: number;
  nb_pages: number;
  page: number;
  hits_per_page: number;
  error?: string | null;
}

// Config getter supporting both browser and Node.js
function getAlgoliaConfig() {
  // Browser environment (Vite) - must use direct property access
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return {
      SEARCH_URL: import.meta.env.VITE_ALGOLIA_SEARCH_URL || 'https://apis.risalabs.ai/pa-order-creation/medical/utility/algolia-search',
      DEFAULT_HITS_PER_PAGE: 2000,
      MAX_RETRIES: 3,
      TIMEOUT_MS: parseInt(import.meta.env.VITE_ALGOLIA_TIMEOUT || '30000', 10),
    };
  }

  // Node.js environment (backend)
  if (typeof process !== 'undefined' && process.env) {
    return {
      SEARCH_URL: process.env.VITE_ALGOLIA_SEARCH_URL || process.env.ALGOLIA_SEARCH_URL || 'https://apis.risalabs.ai/pa-order-creation/medical/utility/algolia-search',
      DEFAULT_HITS_PER_PAGE: 2000,
      MAX_RETRIES: 3,
      TIMEOUT_MS: parseInt(process.env.VITE_ALGOLIA_TIMEOUT || process.env.ALGOLIA_TIMEOUT || '30000', 10),
    };
  }

  // Fallback
  return {
    SEARCH_URL: 'https://apis.risalabs.ai/pa-order-creation/medical/utility/algolia-search',
    DEFAULT_HITS_PER_PAGE: 2000,
    MAX_RETRIES: 3,
    TIMEOUT_MS: 30000,
  };
}

class AlgoliaFetchService {
  /**
   * Fetch all orders for a specific facility and date
   */
  async fetchOrdersByDate(facilityId: string, date: string): Promise<AlgoliaOrder[]> {
    console.log(`[Algolia] Fetching orders for ${facilityId} on ${date}...`);

    const allOrders: AlgoliaOrder[] = [];
    const token = await algoliaAuthService.getAuthToken();
    const config = getAlgoliaConfig();

    // Fetch first page to determine total pages
    const firstPage = await this.fetchPage(token, facilityId, 0, config.DEFAULT_HITS_PER_PAGE, date, date);
    allOrders.push(...firstPage.hits);

    console.log(`[Algolia] Page 0: ${firstPage.hits.length} orders, ${firstPage.nb_pages} total pages`);

    // Fetch remaining pages if needed
    if (firstPage.nb_pages > 1) {
      const remainingPages = Array.from({ length: firstPage.nb_pages - 1 }, (_, i) => i + 1);

      // Fetch pages in batches of 5 to avoid rate limiting
      const batchSize = 5;
      for (let i = 0; i < remainingPages.length; i += batchSize) {
        const batch = remainingPages.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map((page) => this.fetchPage(token, facilityId, page, config.DEFAULT_HITS_PER_PAGE, date, date))
        );

        batchResults.forEach((result, idx) => {
          allOrders.push(...result.hits);
          console.log(`[Algolia] Page ${batch[idx]}: ${result.hits.length} orders`);
        });
      }
    }

    console.log(`[Algolia] Total orders fetched: ${allOrders.length}`);
    return allOrders;
  }

  /**
   * Fetch all orders for a specific facility and date range
   */
  async fetchOrdersByDateRange(facilityId: string, startDate: string, endDate: string): Promise<AlgoliaOrder[]> {
    console.log(`[Algolia] Fetching orders for ${facilityId} from ${startDate} to ${endDate}...`);

    const allOrders: AlgoliaOrder[] = [];
    const token = await algoliaAuthService.getAuthToken();
    const config = getAlgoliaConfig();

    // Fetch first page to determine total pages
    const firstPage = await this.fetchPage(token, facilityId, 0, config.DEFAULT_HITS_PER_PAGE, startDate, endDate);
    allOrders.push(...firstPage.hits);

    console.log(`[Algolia] Page 0: ${firstPage.hits.length} orders, ${firstPage.nb_pages} total pages`);

    // Fetch remaining pages if needed
    if (firstPage.nb_pages > 1) {
      const remainingPages = Array.from({ length: firstPage.nb_pages - 1 }, (_, i) => i + 1);

      // Fetch pages in batches of 5 to avoid rate limiting
      const batchSize = 5;
      for (let i = 0; i < remainingPages.length; i += batchSize) {
        const batch = remainingPages.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map((page) => this.fetchPage(token, facilityId, page, config.DEFAULT_HITS_PER_PAGE, startDate, endDate))
        );

        batchResults.forEach((result, idx) => {
          allOrders.push(...result.hits);
          console.log(`[Algolia] Page ${batch[idx]}: ${result.hits.length} orders`);
        });
      }
    }

    console.log(`[Algolia] Total orders fetched: ${allOrders.length}`);
    return allOrders;
  }

  /**
   * Fetch a single page from Algolia API
   */
  private async fetchPage(
    token: string,
    orgId: string,
    page: number,
    hitsPerPage: number,
    startDate: string,
    endDate: string
  ): Promise<AlgoliaSearchResponse> {
    const config = getAlgoliaConfig();
    const requestBody = {
      org_id: orgId,
      hits_per_page: hitsPerPage,
      page,
      created_at_start: startDate,
      created_at_end: endDate,
    };

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= config.MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.TIMEOUT_MS);

        const response = await fetch(config.SEARCH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: AlgoliaSearchResponse = await response.json();

        if (!data.success) {
          throw new Error(`Algolia API error: ${data.error || JSON.stringify(data)}`);
        }

        return data;
      } catch (error: any) {
        if (attempt < config.MAX_RETRIES) {
          console.warn(`[Algolia] Page ${page} attempt ${attempt}/${config.MAX_RETRIES} failed: ${error.message}`);

          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.error(`[Algolia] Page ${page} failed after ${config.MAX_RETRIES} attempts:`, error.message);
          throw new Error(`Failed to fetch page ${page}: ${error.message}`);
        }
      }
    }

    throw new Error('Unexpected error in fetchPage');
  }
}

// Export singleton instance
export const algoliaFetchService = new AlgoliaFetchService();
export type { AlgoliaOrder };
