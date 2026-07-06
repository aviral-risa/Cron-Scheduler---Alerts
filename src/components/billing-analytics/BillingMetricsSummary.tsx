import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { BillingMetrics } from '@/types/billingAnalytics';

interface BillingMetricsSummaryProps {
  metrics: BillingMetrics | null;
  loading: boolean;
}

export function BillingMetricsSummary({ metrics, loading }: BillingMetricsSummaryProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  const cards = [
    {
      title: 'Total Billable',
      value: metrics.totalBillable.toLocaleString(),
      subtitle: 'After dedup & exclusion',
      accent: false,
    },
    {
      title: 'First Approval Rate',
      value: `${metrics.firstApprovalRate}%`,
      subtitle: `${metrics.firstApprovalCount.toLocaleString()} approved`,
      accent: true,
    },
    {
      title: 'Queries Raised',
      value: metrics.queryRaisedCount.toLocaleString(),
      subtitle: `${metrics.queryRaisedPct}% of billable`,
      accent: false,
    },
    {
      title: 'Denials',
      value: metrics.denialCount.toLocaleString(),
      subtitle: `${metrics.denialPct}% of billable`,
      accent: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => (
        <Card
          key={card.title}
          className={card.accent ? 'border-primary bg-primary/5' : ''}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
