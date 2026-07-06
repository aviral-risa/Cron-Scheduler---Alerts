/**
 * Algolia Queue Service
 *
 * Handles fetching queue data (facet counts) for team members
 */

import { algoliaAuthService } from './auth.service';

const QUEUE_API_URL = 'https://apis.risalabs.ai/pa-order-creation/medical/utility/algolia-multi-facet-counts';

interface AlgoliaFacetResponse {
  success: boolean;
  facet_results: {
    master_auth_status?: {
      [status: string]: number;
    };
    [key: string]: any;
  };
  total_count?: number;
  error?: string | null;
}

export interface QueueCounts {
  new: number;
  pending: number;
  query: number;
  hold: number;
  authRequired: number;
  totalOpenOrders: number;
}

export interface PersonQueueData {
  personName: string;
  personId: string;
  facilityId: string;
  new: number;
  pending: number;
  query: number;
  hold: number;
  authRequired: number;
  totalOpenOrders: number;
}

/**
 * Fetch queue counts for a specific person
 */
export async function fetchPersonQueueCounts(
  orgId: string,
  assignedToId: string
): Promise<QueueCounts> {
  const token = await algoliaAuthService.getAuthToken();

  const requestBody = {
    org_id: orgId,
    facet_attribute: 'master_auth_status',
    assigned_to: assignedToId,
  };

  try {
    const response = await fetch(QUEUE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: AlgoliaFacetResponse = await response.json();

    if (!data.success) {
      throw new Error(`Algolia API error: ${data.error || JSON.stringify(data)}`);
    }

    // Extract counts from facet_results
    const statusFacets = data.facet_results?.master_auth_status || {};
    const counts: QueueCounts = {
      new: 0,
      pending: 0,
      query: 0,
      hold: 0,
      authRequired: 0,
      totalOpenOrders: 0,
    };

    // Map status keys to our counts
    for (const [status, count] of Object.entries(statusFacets)) {
      const statusLower = status.toLowerCase();

      if (statusLower === 'new') {
        counts.new = count;
      } else if (statusLower === 'pending') {
        counts.pending = count;
      } else if (statusLower === 'query') {
        counts.query = count;
      } else if (statusLower === 'hold') {
        counts.hold = count;
      } else if (statusLower === 'auth required' || statusLower === 'auth_required') {
        counts.authRequired = count;
      }
    }

    // Calculate total open orders (sum of all queue statuses)
    counts.totalOpenOrders = counts.new + counts.pending + counts.query + counts.hold + counts.authRequired;

    return counts;
  } catch (error: any) {
    console.error(`[Queue Service] Error fetching queue counts for ${assignedToId}:`, error.message);
    throw error;
  }
}

/**
 * Fetch queue counts for multiple people in parallel
 */
export async function fetchMultiplePersonQueueCounts(
  orgId: string,
  people: Array<{ name: string; id: string }>
): Promise<PersonQueueData[]> {
  console.log(`[Queue Service] Fetching queue data for ${people.length} people in org ${orgId}...`);

  const results: PersonQueueData[] = [];

  // Fetch in batches of 5 to avoid overwhelming the API
  const batchSize = 5;
  for (let i = 0; i < people.length; i += batchSize) {
    const batch = people.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (person) => {
        try {
          const counts = await fetchPersonQueueCounts(orgId, person.id);
          return {
            personName: person.name,
            personId: person.id,
            facilityId: orgId,
            ...counts,
          };
        } catch (error: any) {
          console.error(`Failed to fetch queue data for ${person.name}:`, error.message);
          // Return zero counts on error
          return {
            personName: person.name,
            personId: person.id,
            facilityId: orgId,
            new: 0,
            pending: 0,
            query: 0,
            hold: 0,
            authRequired: 0,
            totalOpenOrders: 0,
          };
        }
      })
    );

    results.push(...batchResults);

    // Small delay between batches
    if (i + batchSize < people.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(`[Queue Service] Fetched queue data for ${results.length} people`);
  return results;
}
