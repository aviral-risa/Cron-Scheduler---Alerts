import { useState, useEffect, useCallback } from 'react';
import type { PersonQueueData } from '@/services/algolia/queue.service';
import type { PersonQueueSnapshot } from '@/types/queue';
import { fetchQueueSnapshotsFromSheets, refreshQueueFromAlgolia } from '@/services/queueApi';

interface UseQueueDataReturn {
  queueData: PersonQueueData[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refreshFromSheets: () => Promise<void>;
  freshSync: () => Promise<void>;
}

/**
 * Hook to fetch and manage queue data for team members in their assigned organizations
 * Default behavior: Load from Google Sheets (cached data)
 * Fresh Sync: Call backend to fetch from Algolia and store to sheets
 */
export function useQueueData(): UseQueueDataReturn {
  const [queueData, setQueueData] = useState<PersonQueueData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  /**
   * Load queue data from Google Sheets (cached data)
   */
  const loadFromSheets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Loading queue data from Google Sheets...');

      // Fetch latest snapshots from sheets
      const { snapshots, lastUpdated: timestamp } = await fetchQueueSnapshotsFromSheets();

      // Convert snapshots to PersonQueueData format
      const queueDataArray = snapshots.map(convertSnapshotToQueueData);

      console.log(`Loaded ${queueDataArray.length} queue entries from sheets`);

      setQueueData(queueDataArray);
      setLastUpdated(timestamp);
    } catch (err: any) {
      console.error('Error loading queue data from sheets:', err);
      setError(err.message || 'Failed to load queue data from sheets');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fresh Sync: Call backend to fetch from Algolia and store to sheets
   */
  const freshSync = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Triggering fresh sync via backend API...');
      
      // Call backend API to fetch from Algolia and store to sheets
      const result = await refreshQueueFromAlgolia();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to sync queue data');
      }
      
      console.log(`Fresh sync complete: ${result.recordsSynced} records synced`);

      // Reload from sheets to display the fresh data
      await loadFromSheets();
    } catch (err: any) {
      console.error('Error during fresh sync:', err);
      setError(err.message || 'Failed to sync queue data');
      setLoading(false);
    }
  }, [loadFromSheets]);

  /**
   * Refresh data from sheets (reload cached data)
   */
  const refreshFromSheets = useCallback(async () => {
    await loadFromSheets();
  }, [loadFromSheets]);

  // Initial load: fetch from Google Sheets by default
  useEffect(() => {
    loadFromSheets();
  }, [loadFromSheets]);

  return {
    queueData,
    loading,
    error,
    lastUpdated,
    refreshFromSheets,
    freshSync,
  };
}

/**
 * Convert PersonQueueSnapshot (from sheets) to PersonQueueData (UI format)
 */
function convertSnapshotToQueueData(snapshot: PersonQueueSnapshot): PersonQueueData {
  return {
    personName: snapshot.person_name,
    personId: snapshot.person_id,
    facilityId: snapshot.facility_id,
    new: snapshot.new,
    pending: snapshot.pending,
    query: snapshot.query,
    hold: snapshot.hold,
    authRequired: snapshot.auth_required,
    totalOpenOrders: snapshot.total_open_orders,
  };
}
