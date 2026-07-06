import { useState, useMemo } from 'react';
import { subDays } from 'date-fns';
import type { BusinessViewFilters } from '@/types/business';
import { useBusinessData } from '@/hooks/useBusinessData';
import { BusinessViewLayout } from '@/components/business-view/BusinessViewLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, formatPercentage } from '@/utils/metrics';
import { BusinessTrendChart } from '@/components/business-view/BusinessTrendChart';
import { DenialTrackingTable } from '@/components/business-view/DenialTrackingTable';
import { OrderAccuracyTable } from '@/components/business-view/OrderAccuracyTable';
import { DailyPerformanceTable } from '@/components/business-view/DailyPerformanceTable';
import { ApprovalRateTrendingTable } from '@/components/business-view/ApprovalRateTrendingTable';
import { DosCoverageTable } from '@/components/business-view/DosCoverageTable';
import { PageIntro } from '@/components/layout/PageIntro';
import { InfoIcon } from '@/components/ui/info-icon';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BUSINESS_METRIC_DEFINITIONS } from '@/config/metric-definitions/business-metrics';
import { PAGE_INTRODUCTIONS } from '@/config/page-introductions';
import { useDosCoverageData } from '@/hooks/useDosCoverageData';

export function BusinessView() {
  // Default: Last 7 days, All Organizations, Exclude weekends
  const today = new Date().toISOString().split('T')[0];
  const last7Days = subDays(new Date(), 7).toISOString().split('T')[0];

  const [filters, setFilters] = useState<BusinessViewFilters>({
    organizationIds: [], // Empty = all orgs
    dateRange: {
      startDate: last7Days,
      endDate: today,
    },
    includeWeekends: false,
  });

  const { summary, dailyBreakdown, orgBreakdown, loading, error, refetch } = useBusinessData(filters);

  const dosCoverageFilters = useMemo(() => ({
    dateRange: filters.dateRange,
    organizationIds: filters.organizationIds,
  }), [filters.dateRange, filters.organizationIds]);

  const { data: dosCoverageData, loading: dosCoverageLoading } = useDosCoverageData(dosCoverageFilters);


  return (
    <TooltipProvider>
      <BusinessViewLayout
        header={
          <PageIntro
            title={PAGE_INTRODUCTIONS.businessView.title}
            description={PAGE_INTRODUCTIONS.businessView.description}
          />
        }
        filters={filters}
        onFiltersChange={setFilters}
        onRefresh={refetch}
        refreshing={loading}
      >
        {/* Error State */}
        {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 font-semibold">Error loading business data</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* North Star Metric - OPD */}
      {!loading && summary && dailyBreakdown && (
        <Card className="mb-6 border-2 border-primary bg-gradient-to-br from-primary/5 to-primary/10">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-2xl font-bold text-primary">OPD - Orders Per Person Per Day</CardTitle>
                  <InfoIcon content={BUSINESS_METRIC_DEFINITIONS.opd.description} size="md" />
                </div>
                <p className="text-sm text-muted-foreground mt-1">Quarter 1 2026 goal of 105</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <div>
                <div className="text-6xl font-bold text-primary">
                  {(() => {
                    // Calculate average OPD from working days only
                    const workingDays = dailyBreakdown.filter(d => d.isWorkingDay && d.ordersWorked > 0);
                    if (workingDays.length === 0) return '0';
                    const totalOPD = workingDays.reduce((sum, d) => sum + (d.ordersPerPerson || 0), 0);
                    const avgOPD = totalOPD / workingDays.length;
                    return avgOPD.toFixed(1);
                  })()}
                </div>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-4 ml-8">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Billable Orders</p>
                  <p className="text-2xl font-semibold">{formatNumber(summary.totalOrdersWorked)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Active Users</p>
                  <p className="text-2xl font-semibold">
                    {(() => {
                      const workingDays = dailyBreakdown.filter(d => d.isWorkingDay && d.ordersWorked > 0);
                      if (workingDays.length === 0) return '0';
                      const avgProviders = workingDays.reduce((sum, d) => sum + d.activeProviderCount, 0) / workingDays.length;
                      return Math.round(avgProviders);
                    })()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Working Days</p>
                  <p className="text-2xl font-semibold">{summary.workingDaysCount}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quality Metrics */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Quality Metrics</h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-primary bg-primary/5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Approval Rate
                  </CardTitle>
                  <InfoIcon content={BUSINESS_METRIC_DEFINITIONS.approvalRate.description} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatPercentage(summary.approvalRate)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Auth / (Auth + Denial) by Risa
                </p>
              </CardContent>
            </Card>

            <Card className="border-primary bg-primary/5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Authorization Rate
                  </CardTitle>
                  <InfoIcon content={BUSINESS_METRIC_DEFINITIONS.authorizationRate.description} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {summary.authorizationRate != null ? `${summary.authorizationRate.toFixed(2)}%` : 'N/A'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Authorized / (Authorized + Denied)
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      {/* Daily Performance Table Section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Daily Orders Billed</h2>
        <DailyPerformanceTable
          data={dailyBreakdown
            .filter(day => day.ordersWorked > 0)
            .map(day => {
              const authByRisa = day.authByRisa || 0;
              const authOnFile = day.authOnFile || 0;
              const noAuthRequired = day.noAuthRequired || 0;
              const narAofRest = authOnFile + noAuthRequired + (day.ordersWorked - authByRisa - authOnFile - noAuthRequired);

              return {
                date: new Date(day.date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
                ordersWorked: day.ordersWorked,
                authByRisa,
                narAofRest,
                activeTeamMembers: day.activeProviderCount,
                orderPerPerson: day.ordersPerPerson
              };
            })}
          l7dAvg={(() => {
            // Calculate L7D average from the last 7 working days with actual data
            const daysWithData = dailyBreakdown.filter(day => day.ordersWorked > 0);
            const last7Days = daysWithData.slice(-7);
            if (last7Days.length === 0) return undefined;

            const count = last7Days.length;
            const totalOrdersWorked = last7Days.reduce((sum, day) => sum + day.ordersWorked, 0);
            const totalAuthByRisa = last7Days.reduce((sum, day) => sum + (day.authByRisa || 0), 0);
            const totalNarAofRest = last7Days.reduce((sum, day) => {
              const authByRisa = day.authByRisa || 0;
              const authOnFile = day.authOnFile || 0;
              const noAuthRequired = day.noAuthRequired || 0;
              return sum + authOnFile + noAuthRequired + (day.ordersWorked - authByRisa - authOnFile - noAuthRequired);
            }, 0);
            const totalActiveTeamMembers = last7Days.reduce((sum, day) => sum + day.activeProviderCount, 0);
            const totalOrderPerPerson = last7Days.reduce((sum, day) => sum + (day.ordersPerPerson || 0), 0);

            return {
              date: 'L7D Avg',
              ordersWorked: Math.round(totalOrdersWorked / count),
              authByRisa: Math.round(totalAuthByRisa / count),
              narAofRest: Math.round(totalNarAofRest / count),
              activeTeamMembers: Math.round(totalActiveTeamMembers / count),
              orderPerPerson: totalOrderPerPerson / count
            };
          })()}
          loading={loading}
        />
      </div>

      {/* Approval Rate Trending Table Section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Approval Rate</h2>
        <ApprovalRateTrendingTable
          data={dailyBreakdown
            ?.filter(day => day.ordersWorked > 0)
            .map(day => {
              const authByRisa = day.authByRisa || 0;
              const denialByRisa = day.denialByRisa || 0;
              const denialAfterQuery = day.denialAfterQuery || 0;
              const totalAuthInitiated = authByRisa + denialByRisa + denialAfterQuery;
              const paApprovalRate = authByRisa + denialByRisa > 0
                ? parseFloat(((authByRisa / (authByRisa + denialByRisa)) * 100).toFixed(1))
                : null;
              const overallApprovalRate = totalAuthInitiated > 0
                ? parseFloat(((authByRisa / totalAuthInitiated) * 100).toFixed(1))
                : null;

              return {
                date: new Date(day.date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
                totalAuthInitiated,
                authByRisa,
                denialByRisa,
                denialAfterQuery,
                paApprovalRate,
                overallApprovalRate,
              };
            })}
          l7dAvg={(() => {
            if (!dailyBreakdown) return undefined;
            const daysWithData = dailyBreakdown.filter(day => day.ordersWorked > 0);
            const last7Days = daysWithData.slice(-7);
            if (last7Days.length === 0) return undefined;

            const count = last7Days.length;
            const totalAuthByRisa = last7Days.reduce((sum, day) => sum + (day.authByRisa || 0), 0);
            const totalDenialByRisa = last7Days.reduce((sum, day) => sum + (day.denialByRisa || 0), 0);
            const totalDenialAfterQuery = last7Days.reduce((sum, day) => sum + (day.denialAfterQuery || 0), 0);
            const avgAuthByRisa = Math.round(totalAuthByRisa / count);
            const avgDenialByRisa = Math.round(totalDenialByRisa / count);
            const avgDenialAfterQuery = Math.round(totalDenialAfterQuery / count);
            const avgTotalAuthInitiated = avgAuthByRisa + avgDenialByRisa + avgDenialAfterQuery;
            const paApprovalRate = totalAuthByRisa + totalDenialByRisa > 0
              ? parseFloat(((totalAuthByRisa / (totalAuthByRisa + totalDenialByRisa)) * 100).toFixed(1))
              : null;
            const totalInitiated = totalAuthByRisa + totalDenialByRisa + totalDenialAfterQuery;
            const overallApprovalRate = totalInitiated > 0
              ? parseFloat(((totalAuthByRisa / totalInitiated) * 100).toFixed(1))
              : null;

            return {
              date: 'L7D Avg',
              totalAuthInitiated: avgTotalAuthInitiated,
              authByRisa: avgAuthByRisa,
              denialByRisa: avgDenialByRisa,
              denialAfterQuery: avgDenialAfterQuery,
              paApprovalRate,
              overallApprovalRate,
            };
          })()}
          loading={loading}
        />
      </div>

      {/* DoS Coverage Section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">DoS Coverage</h2>
        <DosCoverageTable
          data={dosCoverageData?.rows}
          loading={dosCoverageLoading}
        />
      </div>

      {/* Daily Trends Section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Daily Trends</h2>
        <BusinessTrendChart dailyBreakdown={dailyBreakdown} loading={loading} />
      </div>

      {/* Denial Tracking Section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Denial Tracking</h2>
        <DenialTrackingTable data={summary?.monitoringTables?.denialTracking} loading={loading} />
      </div>

      {/* Order Accuracy Section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Order Accuracy Metrics</h2>
        <OrderAccuracyTable data={summary?.monitoringTables?.orderAccuracy} loading={loading} />
      </div>
      </BusinessViewLayout>
    </TooltipProvider>
  );
}
