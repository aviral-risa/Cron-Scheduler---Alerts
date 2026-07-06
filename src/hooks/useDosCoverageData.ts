import { useState, useEffect, useCallback } from 'react';
import type { DosCoverageFilters, DosCoverageData } from '../types/dosCoverage';
import { fetchDosCoverage } from '../services/api/dosCoverageApi';

interface UseDosCoverageDataReturn {
  data: DosCoverageData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDosCoverageData(
  filters: DosCoverageFilters
): UseDosCoverageDataReturn {
  const [data, setData] = useState<DosCoverageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await fetchDosCoverage(filters);
      setData(result);
    } catch (err) {
      console.error('[useDosCoverageData] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch DoS coverage data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch };
}
