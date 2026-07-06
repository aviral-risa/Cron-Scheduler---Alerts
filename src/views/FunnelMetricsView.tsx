import { useState } from 'react';
import { subDays } from 'date-fns';
import type { BusinessViewFilters } from '@/types/business';
import { useBusinessData } from '@/hooks/useBusinessData';
import { BusinessViewLayout } from '@/components/business-view/BusinessViewLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPercentage } from '@/utils/metrics';
import { OrdersFunnelTable } from '@/components/business-view/OrdersFunnelTable';
import { OpenOrdersSummaryTable } from '@/components/business-view/OpenOrdersSummaryTable';
import { AuthStatusBreakdownTable } from '@/components/business-view/AuthStatusBreakdownTable';
import { PageIntro } from '@/components/layout/PageIntro';
import { PAGE_INTRODUCTIONS } from '@/config/page-introductions';

export function FunnelMetricsView() {
  const today = new Date().toISOString().split('T')[0];
  const last7Days = subDays(new Date(), 7).toISOString().split('T')[0];

  const [filters, setFilters] = useState<BusinessViewFilters>({
    organizationIds: [],
    dateRange: {
      startDate: last7Days,
      endDate: today,
    },
    includeWeekends: false,
  });

  const { summary, dailyBreakdown, loading, error, refetch } = useBusinessData(filters);

  return (
    <BusinessViewLayout
      header={
        <PageIntro
          title={PAGE_INTRODUCTIONS.funnelMetrics.title}
          description={PAGE_INTRODUCTIONS.funnelMetrics.description}
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

      {/* Funnel Metrics */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Funnel Metrics</h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  % Assigned of Loaded
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {formatPercentage(
                    summary.totalOrdersLoaded > 0
                      ? parseFloat(((summary.totalOrdersAssigned / summary.totalOrdersLoaded) * 100).toFixed(1))
                      : null
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Assigned / Loaded
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  % Worked of Assigned
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {formatPercentage(
                    summary.totalOrdersAssigned > 0
                      ? parseFloat(((summary.totalOrdersWorked / summary.totalOrdersAssigned) * 100).toFixed(1))
                      : null
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Worked / Assigned
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  % Worked of Loaded
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {formatPercentage(
                    summary.totalOrdersLoaded > 0
                      ? parseFloat(((summary.totalOrdersWorked / summary.totalOrdersLoaded) * 100).toFixed(1))
                      : null
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Worked / Loaded
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      {/* Open Orders Summary Section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Open Orders Summary</h2>
        <OpenOrdersSummaryTable
          data={dailyBreakdown
            .filter(day => day.ordersWorked > 0)
            .map(day => {
              const authRequired = day.authRequired || 0;
              const pending = day.pending || 0;
              const hold = day.hold || 0;
              const query = day.query || 0;
              const totalOpenOrders = authRequired + pending + hold + query;

              return {
                date: new Date(day.date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
                totalOpenOrders,
                authRequired,
                pending,
                hold,
                query,
              };
            })}
          loading={loading}
        />
      </div>

      {/* Orders Funnel Section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Orders Funnel</h2>
        <OrdersFunnelTable data={summary?.monitoringTables?.ordersFunnel} loading={loading} />
      </div>

      {/* Auth Status Breakdown Section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Orders Completed - Auth Status</h2>
        <AuthStatusBreakdownTable data={summary?.monitoringTables?.authStatusBreakdown} loading={loading} />
      </div>
    </BusinessViewLayout>
  );
}
