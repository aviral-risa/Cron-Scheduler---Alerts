import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { PersonPerformanceSummary } from '@/types/people';
import { formatNumber, formatPercentage } from '@/utils/metrics';

interface PersonMetricsCardsProps {
  summary: PersonPerformanceSummary | null;
  loading: boolean;
}

export function PersonMetricsCards({ summary, loading }: PersonMetricsCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-3 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      {/* Total Orders Assigned */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Orders Assigned
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{formatNumber(summary.totalOrdersAssigned)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Assigned to {summary.personName}
          </p>
        </CardContent>
      </Card>

      {/* Total Orders Completed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Orders Completed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{formatNumber(summary.totalOrdersCompleted)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Completed by {summary.personName}
          </p>
        </CardContent>
      </Card>

      {/* Completion Rate */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Completion Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{formatPercentage(summary.completionRate)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Assigned vs Completed
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
