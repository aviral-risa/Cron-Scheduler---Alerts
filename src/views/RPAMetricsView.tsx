import { useState } from 'react';
import type { RPAMetricsFilters } from '@/types/rpaMetrics';
import { useRPAMetricsData } from '@/hooks/useRPAMetricsData';
import { RPAMetricsViewLayout } from '@/components/rpa-metrics/RPAMetricsViewLayout';
import { RPAOverviewCards } from '@/components/rpa-metrics/RPAOverviewCards';
import { RPATrendChart } from '@/components/rpa-metrics/RPATrendChart';
import { RPAUserBreakdownTable } from '@/components/rpa-metrics/RPAUserBreakdownTable';
import { RPAStatusBreakdownTable } from '@/components/rpa-metrics/RPAStatusBreakdownTable';
import { RPADocumentComplianceTable } from '@/components/rpa-metrics/RPADocumentComplianceTable';
import { RPAHourlyTrendChart } from '@/components/rpa-metrics/RPAHourlyTrendChart';

export function RPAMetricsView() {
  // Default: Show data for today's date
  const defaultDate = new Date().toISOString().split('T')[0];

  const [filters, setFilters] = useState<RPAMetricsFilters>({
    organizationIds: [], // Empty = all orgs
    dateRange: {
      startDate: defaultDate,
      endDate: defaultDate,
    },
  });

  const {
    summaries,
    aggregatedSummary,
    trendData,
    userBreakdown,
    hourlyData,
    loading,
    error,
    triggerFreshSync,
    refetch,
  } = useRPAMetricsData(filters);

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
    <RPAMetricsViewLayout
      filters={filters}
      onFiltersChange={setFilters}
      onRefresh={handleFreshSync}
      onRefreshFromSheets={refetch}
      refreshing={loading}
    >
      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 font-semibold">Error loading RPA metrics</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Overview Cards */}
      <div className="mb-6">
        <RPAOverviewCards summary={aggregatedSummary} loading={loading} />
      </div>

      {/* Trend Chart */}
      <div className="mb-6">
        <RPATrendChart trendData={trendData} loading={loading} />
      </div>

      {/* User Breakdown Table */}
      <div className="mb-6">
        <RPAUserBreakdownTable userBreakdown={userBreakdown} loading={loading} />
      </div>

      {/* Status Breakdown Table */}
      <div className="mb-6">
        <RPAStatusBreakdownTable summaries={summaries} loading={loading} />
      </div>

      {/* Document Compliance Table */}
      <div className="mb-6">
        <RPADocumentComplianceTable summaries={summaries} loading={loading} />
      </div>

      {/* Hourly Trend Chart (for spike detection) */}
      <div className="mb-6">
        <RPAHourlyTrendChart hourlyData={hourlyData} loading={loading} />
      </div>
    </RPAMetricsViewLayout>
  );
}
