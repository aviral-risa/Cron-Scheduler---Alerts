/**
 * Algolia Data Fetching Service
 *
 * Handles fetching order data from Algolia API with pagination and retry logic
 */

import type { AlgoliaOrder, AlgoliaSearchResponse, AlgoliaSearchRequest } from '../types/algolia.types';
import { ALGOLIA_CONFIG } from '../config/algolia.config';
import { algoliaAuthService } from './algolia-auth.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('Fetch');

export class AlgoliaFetchService {
  /**
   * Fetch all orders for a specific facility and date
   */
  async fetchOrdersByDate(
    facilityId: string,
    date: string // Format: "YYYY-MM-DD"
  ): Promise<AlgoliaOrder[]> {
    logger.info(`Fetching orders for facility ${facilityId} on ${date}...`);

    const allOrders: AlgoliaOrder[] = [];
    const token = await algoliaAuthService.getAuthToken();

    // Fetch first page to determine total pages
    const firstPage = await this.fetchPage(token, facilityId, 0, ALGOLIA_CONFIG.DEFAULT_HITS_PER_PAGE, date, date);
    allOrders.push(...firstPage.hits);

    logger.info(`Page 0: ${firstPage.hits.length} orders, ${firstPage.nb_pages} total pages`);

    // Fetch remaining pages if needed
    if (firstPage.nb_pages > 1) {
      logger.info(`Fetching ${firstPage.nb_pages - 1} additional pages...`);

      const remainingPages = Array.from({ length: firstPage.nb_pages - 1 }, (_, i) => i + 1);

      // Fetch pages in batches of 5 to avoid rate limiting
      const batchSize = 5;
      for (let i = 0; i < remainingPages.length; i += batchSize) {
        const batch = remainingPages.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map((page) => this.fetchPage(token, facilityId, page, ALGOLIA_CONFIG.DEFAULT_HITS_PER_PAGE, date, date))
        );

        batchResults.forEach((result, idx) => {
          allOrders.push(...result.hits);
          logger.info(`Page ${batch[idx]}: ${result.hits.length} orders`);
        });
      }
    }

    logger.success(`Total orders fetched: ${allOrders.length}`);
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
    const requestBody: AlgoliaSearchRequest = {
      org_id: orgId,
      hits_per_page: hitsPerPage,
      page,
      created_at_start: startDate,
      created_at_end: endDate,
    };

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= ALGOLIA_CONFIG.MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ALGOLIA_CONFIG.TIMEOUT_MS);

        const response = await fetch(ALGOLIA_CONFIG.SEARCH_URL, {
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
        if (attempt < ALGOLIA_CONFIG.MAX_RETRIES) {
          logger.warn(`Page ${page} attempt ${attempt}/${ALGOLIA_CONFIG.MAX_RETRIES} failed: ${error.message}`);

          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.pow(2, attempt) * 1000;
          logger.info(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          logger.error(`Page ${page} failed after ${ALGOLIA_CONFIG.MAX_RETRIES} attempts:`, error.message);
          throw new Error(`Failed to fetch page ${page}: ${error.message}`);
        }
      }
    }

    throw new Error('Unexpected error in fetchPage');
  }

  /**
   * Fetch orders for a date range (multiple days)
   */
  async fetchOrdersByDateRange(
    facilityId: string,
    startDate: string,
    endDate: string
  ): Promise<AlgoliaOrder[]> {
    logger.info(`Fetching orders for facility ${facilityId} from ${startDate} to ${endDate}...`);

    const token = await algoliaAuthService.getAuthToken();
    const allOrders: AlgoliaOrder[] = [];

    // Fetch first page to determine total pages
    const firstPage = await this.fetchPage(token, facilityId, 0, ALGOLIA_CONFIG.DEFAULT_HITS_PER_PAGE, startDate, endDate);
    allOrders.push(...firstPage.hits);

    logger.info(`Page 0: ${firstPage.hits.length} orders, ${firstPage.nb_pages} total pages`);

    // Fetch remaining pages if needed
    if (firstPage.nb_pages > 1) {
      const remainingPages = Array.from({ length: firstPage.nb_pages - 1 }, (_, i) => i + 1);

      // Fetch in batches
      const batchSize = 5;
      for (let i = 0; i < remainingPages.length; i += batchSize) {
        const batch = remainingPages.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map((page) => this.fetchPage(token, facilityId, page, ALGOLIA_CONFIG.DEFAULT_HITS_PER_PAGE, startDate, endDate))
        );

        batchResults.forEach((result, idx) => {
          allOrders.push(...result.hits);
          logger.info(`Page ${batch[idx]}: ${result.hits.length} orders`);
        });
      }
    }

    logger.success(`Total orders fetched: ${allOrders.length}`);
    return allOrders;
  }
}

// Export singleton instance
export const algoliaFetchService = new AlgoliaFetchService();
