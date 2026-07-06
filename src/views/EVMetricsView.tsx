import { useState } from 'react';
import type { EVMetricsFilters } from '@/types/evMetrics';
import { useEVMetricsData } from '@/hooks/useEVMetricsData';
import { EVMetricsViewLayout } from '@/components/ev-metrics/EVMetricsViewLayout';
import { PageIntro } from '@/components/layout/PageIntro';
import { PAGE_INTRODUCTIONS } from '@/config/page-introductions';
import { EVOverviewCards } from '@/components/ev-metrics/EVOverviewCards';
import { EVTrendChart } from '@/components/ev-metrics/EVTrendChart';
import { EVErrorBreakdownCard } from '@/components/ev-metrics/EVErrorBreakdownCard';
import { EVSuccessRateTable } from '@/components/ev-metrics/EVSuccessRateTable';
import { EVPayerCoverageTable } from '@/components/ev-metrics/EVPayerCoverageTable';
import { EVPayerStatusTable } from '@/components/ev-metrics/EVPayerStatusTable';
import { EVDailySummaryTable } from '@/components/ev-metrics/EVDailySummaryTable';

export function EVMetricsView() {
  // Default: Show data for today's date
  const defaultDate = new Date().toISOString().split('T')[0];

  const [filters, setFilters] = useState<EVMetricsFilters>({
    organizationIds: [], // Empty = all orgs
    dateRange: {
      startDate: defaultDate,
      endDate: defaultDate,
    },
  });

  const {
    summary,
    aggregatedSummary,
    trendData,
    payerBreakdown,
    loading,
    error,
    refreshFromSheets,
    triggerFreshSync,
  } = useEVMetricsData(filters);

  // Handle fresh sync (Algolia → Sheets → UI)
  const handleFreshSync = async () => {
    // Get list of all organization Firebase IDs from ORGANIZATIONS config
    // Import at runtime to avoid circular dependencies
    const { FACILITY_IDS } = await import('../config/organizations');

    // Use actual Firebase facility IDs if no specific ones selected
    const facilityIds =
      filters.organizationIds.length > 0
        ? filters.organizationIds
        : FACILITY_IDS;

    // For simplicity, sync the end date of the range
    // In production, you might want to sync all dates in the range
    const dateToSync = filters.dateRange.endDate;

    await triggerFreshSync(facilityIds, dateToSync);
  };

  return (
    <EVMetricsViewLayout
      header={
        <PageIntro
          title={PAGE_INTRODUCTIONS.evMetrics.title}
          description={PAGE_INTRODUCTIONS.evMetrics.description}
        />
      }
      filters={filters}
      onFiltersChange={setFilters}
      onRefresh={handleFreshSync}
      onRefreshFromSheets={refreshFromSheets}
      refreshing={loading}
    >
      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 font-semibold">Error loading EV metrics</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Overview Cards - Top 3 A0 Metrics */}
      <div className="mb-6">
        <EVOverviewCards summary={aggregatedSummary} loading={loading} />
      </div>

      {/* Trend Chart */}
      <div className="mb-6">
        <EVTrendChart trendData={trendData} loading={loading} />
      </div>

      {/* Error Breakdown */}
      <div className="mb-6">
        <EVErrorBreakdownCard summary={aggregatedSummary} loading={loading} />
      </div>

      {/* EV Success Rate Table - Last 7 Days */}
      <div className="mb-6">
        <EVSuccessRateTable summary={summary} loading={loading} />
      </div>

      {/* Payer Coverage Status Table */}
      <div className="mb-6">
        <EVPayerCoverageTable payerBreakdown={payerBreakdown} loading={loading} />
      </div>

      {/* Payer EV Status Table */}
      <div className="mb-6">
        <EVPayerStatusTable payerBreakdown={payerBreakdown} loading={loading} />
      </div>

      {/* Daily Summary Table */}
      <div className="mb-6">
        <EVDailySummaryTable summary={summary} loading={loading} />
      </div>
    </EVMetricsViewLayout>
  );
}
