import { useState, useEffect } from 'react';
import { subDays } from 'date-fns';
import type { BillingAnalyticsFilters } from '@/types/billingAnalytics';
import { useBillingAnalyticsData } from '@/hooks/useBillingAnalyticsData';
import { BillingAnalyticsLayout } from '@/components/billing-analytics/BillingAnalyticsLayout';
import { BillingMetricsSummary } from '@/components/billing-analytics/BillingMetricsSummary';
import { BillingDataTable } from '@/components/billing-analytics/BillingDataTable';
import { PageIntro } from '@/components/layout/PageIntro';

export function BillingAnalyticsView() {
  const today = new Date().toISOString().split('T')[0];
  const last7Days = subDays(new Date(), 7).toISOString().split('T')[0];

  const [filters, setFilters] = useState<BillingAnalyticsFilters>({
    facilityId: '',
    dateRange: { startDate: last7Days, endDate: today },
  });

  const { rows, metrics, clients, totalRawCount, dataset, loading, error, refetch } =
    useBillingAnalyticsData(filters);

  // Auto-select first client once loaded
  useEffect(() => {
    if (clients.length > 0 && !filters.facilityId) {
      setFilters((prev) => ({ ...prev, facilityId: clients[0].facilityId }));
    }
  }, [clients, filters.facilityId]);

  return (
    <BillingAnalyticsLayout
      header={
        <PageIntro
          title="Billing Analytics"
          description="View billing-ready PA worklist data from BigQuery. Select a client and date range to see deduplicated, filtered billing data with approval metrics."
        />
      }
      filters={filters}
      clients={clients}
      onFiltersChange={setFilters}
      onRefresh={refetch}
      refreshing={loading}
      activeDataset={dataset}
    >
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 font-semibold">Error loading billing data</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {!loading && totalRawCount > 0 && (
        <p className="text-xs text-muted-foreground mb-4">
          {totalRawCount.toLocaleString()} raw rows &rarr; {rows.length.toLocaleString()} billable
          (after dedup + status exclusion)
        </p>
      )}

      <BillingMetricsSummary metrics={metrics} loading={loading} />
      <BillingDataTable data={rows} loading={loading} />
    </BillingAnalyticsLayout>
  );
}
