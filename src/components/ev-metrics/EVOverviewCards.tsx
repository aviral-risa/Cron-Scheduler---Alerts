import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { EVAggregatedSummary } from '@/types/evMetrics';
import { getMetricStatus } from '@/utils/metrics/evMetrics';

interface EVOverviewCardsProps {
  summary: EVAggregatedSummary | null;
  loading: boolean;
}

export function EVOverviewCards({ summary, loading }: EVOverviewCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-20 mb-2" />
              <Skeleton className="h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!summary || summary.total_orders === 0) {
    return (
      <div className="text-center text-muted-foreground py-8 bg-card rounded-lg border">
        No EV metrics data available for the selected date range
      </div>
    );
  }

  // Get status for each metric
  const successStatus = getMetricStatus('ev_success_rate', summary.ev_success_rate);
  const activeStatus = getMetricStatus('active_coverage_rate', summary.active_coverage_rate);
  const errorStatus = getMetricStatus('error_rate', summary.error_rate);

  // Card border colors based on status
  const getCardClassName = (status: 'good' | 'warning' | 'critical') => {
    if (status === 'good') return 'border-green-500 bg-green-50/50';
    if (status === 'warning') return 'border-yellow-500 bg-yellow-50/50';
    return 'border-red-500 bg-red-50/50';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Card 1: EV Success Rate */}
      <Card className={getCardClassName(successStatus)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            EV Success Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">
            {summary.ev_success_rate.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {summary.ev_completed} of {summary.total_orders} completed
          </p>
          <p className="text-xs font-medium mt-2">
            Target: {'>'} 95%
          </p>
        </CardContent>
      </Card>

      {/* Card 2: Active Coverage Rate */}
      <Card className={getCardClassName(activeStatus)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Active Coverage Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">
            {summary.active_coverage_rate.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {summary.orders_active} of {summary.total_orders} active
          </p>
          <p className="text-xs font-medium mt-2">
            Target: {'>'} 80%
          </p>
        </CardContent>
      </Card>

      {/* Card 3: Error Rate */}
      <Card className={getCardClassName(errorStatus)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Error Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">
            {summary.error_rate.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {summary.ev_error_total} of {summary.total_orders} errors
          </p>
          <p className="text-xs font-medium mt-2">
            Target: {'<'} 5%
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
