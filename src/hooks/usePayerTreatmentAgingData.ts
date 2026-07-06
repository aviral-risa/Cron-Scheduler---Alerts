import { useState, useEffect, useCallback } from 'react';
import type { PayerTreatmentAgingFilters, PayerTreatmentAgingData } from '../types/payerTreatmentAging';
import { fetchPayerTreatmentAging } from '../services/api/payerTreatmentAgingApi';
import { FEATURE_FLAGS } from '../config/features';

interface UsePayerTreatmentAgingDataReturn {
  data: PayerTreatmentAgingData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePayerTreatmentAgingData(
  filters: PayerTreatmentAgingFilters
): UsePayerTreatmentAgingDataReturn {
  const [data, setData] = useState<PayerTreatmentAgingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!FEATURE_FLAGS.ENABLE_PAYER_TREATMENT_AGING) return;

    try {
      setLoading(true);
      setError(null);

      const result = await fetchPayerTreatmentAging(filters);
      setData(result);
    } catch (err) {
      console.error('[usePayerTreatmentAgingData] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch payer treatment aging data');
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
