import { useState } from 'react';
import { ORGANIZATIONS, getOrganizationById } from '../config/organizations';
import { useDashboardData } from '../hooks/useDashboardData';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { MetricsOverview } from '../components/dashboard/MetricsOverview';
import { WorkRateChart } from '../components/dashboard/WorkRateChart';
import { ProviderPerformanceTable } from '../components/dashboard/ProviderPerformanceTable';
import { PageIntro } from '@/components/layout/PageIntro';
import { PAGE_INTRODUCTIONS } from '@/config/page-introductions';

export function DailyView() {
  const [selectedOrgId, setSelectedOrgId] = useState(ORGANIZATIONS[0].id);

  // Get today's date as default (YYYY-MM-DD)
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);

  // Get facility ID for selected org
  const selectedOrg = getOrganizationById(selectedOrgId);
  const facilityId = selectedOrg?.facilityId || '';

  // Fetch dashboard data for selected date
  const {
    latestMetrics,
    hourlyMetrics,
    personMetrics,
    loading,
    error,
    refetch,
  } = useDashboardData(facilityId, selectedDate);

  return (
    <DashboardLayout
      header={
        <PageIntro
          title={PAGE_INTRODUCTIONS.dailyView.title}
          description={PAGE_INTRODUCTIONS.dailyView.description}
        />
      }
      selectedOrgId={selectedOrgId}
      onOrgChange={setSelectedOrgId}
      selectedDate={selectedDate}
      onDateChange={setSelectedDate}
      onRefresh={refetch}
      refreshing={loading}
      facilityId={facilityId}
    >
      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 font-semibold">
            Error loading dashboard data
          </p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Metrics Overview */}
      <div className="mb-6">
        <MetricsOverview metrics={latestMetrics} loading={loading} />
      </div>

      {/* Line Chart */}
      <div className="mb-6">
        <WorkRateChart hourlyMetrics={hourlyMetrics} loading={loading} />
      </div>

      {/* Provider Performance Table */}
      <div className="mb-6">
        <ProviderPerformanceTable
          personMetrics={personMetrics}
          loading={loading}
        />
      </div>
    </DashboardLayout>
  );
}
