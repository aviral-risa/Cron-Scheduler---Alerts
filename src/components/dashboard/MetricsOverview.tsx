import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { OrgMetrics } from '@/types/orders';
import { calcWorkedOfAssigned, calcWorkedOfLoaded, formatPercentage, formatNumber } from '@/utils/metrics';
import { format } from 'date-fns';

interface MetricsOverviewProps {
  metrics: OrgMetrics | null;
  loading: boolean;
}

export function MetricsOverview({ metrics, loading }: MetricsOverviewProps) {
  if (loading) {
    return (
      <div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
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
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center text-muted-foreground py-8 bg-card rounded-lg border border-border">
        No metrics available for the selected organization and date.
      </div>
    );
  }

  const workedOfAssigned = calcWorkedOfAssigned(
    metrics.orders_worked,
    metrics.orders_assigned
  );
  const workedOfLoaded = calcWorkedOfLoaded(
    metrics.orders_worked,
    metrics.orders_loaded_today
  );

  const metricsCards = [
    {
      title: 'Orders Loaded',
      value: formatNumber(metrics.orders_loaded_today),
      subtitle: 'Total orders created today',
      highlight: false,
    },
    {
      title: 'Orders Assigned',
      value: formatNumber(metrics.orders_assigned),
      subtitle: 'Assigned to team members',
      highlight: false,
    },
    {
      title: 'Orders Worked',
      value: formatNumber(metrics.orders_worked),
      subtitle: 'Currently being processed',
      highlight: false,
    },
    {
      title: '% Worked of Assigned',
      value: formatPercentage(workedOfAssigned),
      subtitle: 'Work completion rate',
      highlight: true,
    },
    {
      title: '% Worked of Loaded',
      value: formatPercentage(workedOfLoaded),
      subtitle: 'Overall processing rate',
      highlight: true,
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {metricsCards.map((card, index) => (
          <Card
            key={index}
            className={card.highlight ? 'border-primary bg-primary/5' : ''}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {card.subtitle}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Snapshot and Created Date Info */}
      <div className="mt-3 flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          <span className="font-medium">Orders Created:</span>{' '}
          {format(new Date(metrics.created_at_date), 'PPP')}
        </div>
        <div className="text-muted-foreground">
          <span className="font-medium">Data Snapshot:</span>{' '}
          {format(new Date(metrics.snapshot_timestamp), 'PPpp')}
        </div>
      </div>
    </div>
  );
}
