import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { RPAAggregatedSummary } from '@/types/rpaMetrics';
import { RPA_METRIC_THRESHOLDS } from '@/types/rpaMetrics';

interface RPAOverviewCardsProps {
  summary: RPAAggregatedSummary | null;
  loading: boolean;
}

export function RPAOverviewCards({ summary, loading }: RPAOverviewCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
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

  if (!summary || summary.total_orders_worked === 0) {
    return (
      <div className="text-center text-muted-foreground py-8 bg-card rounded-lg border">
        No RPA metrics data available for the selected date range
      </div>
    );
  }

  // Determine card status based on thresholds
  const getCardClassName = (value: number, threshold: typeof RPA_METRIC_THRESHOLDS.comment_rpa_automation_rate) => {
    if (value >= threshold.good) return 'border-green-500 bg-green-50/50';
    if (value >= threshold.warning) return 'border-yellow-500 bg-yellow-50/50';
    return 'border-red-500 bg-red-50/50';
  };

  const commentStatus = getCardClassName(summary.comment_rpa_automation_rate, RPA_METRIC_THRESHOLDS.comment_rpa_automation_rate);
  const documentStatus = getCardClassName(summary.document_rpa_automation_rate, RPA_METRIC_THRESHOLDS.document_rpa_automation_rate);
  const successStatus = getCardClassName(summary.overall_rpa_success_rate, RPA_METRIC_THRESHOLDS.overall_rpa_success_rate);
  const complianceStatus = getCardClassName(summary.document_compliance_rate, RPA_METRIC_THRESHOLDS.document_compliance_rate);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Card 1: Comment RPA Automation Rate */}
      <Card className={commentStatus}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Comment RPA Automation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">
            {summary.comment_rpa_automation_rate.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {summary.comment_rpa_success + summary.comment_rpa_error} of {summary.total_orders_worked} triggered
          </p>
          <p className="text-xs font-medium mt-2">
            Target: &gt; 80%
          </p>
        </CardContent>
      </Card>

      {/* Card 2: Document RPA Automation Rate */}
      <Card className={documentStatus}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Document RPA Automation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">
            {summary.document_rpa_automation_rate.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {summary.document_rpa_success + summary.document_rpa_error} of {summary.total_orders_worked} triggered
          </p>
          <p className="text-xs font-medium mt-2">
            Target: &gt; 80%
          </p>
        </CardContent>
      </Card>

      {/* Card 3: Overall RPA Success Rate */}
      <Card className={successStatus}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            RPA Success Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">
            {summary.overall_rpa_success_rate.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {summary.comment_rpa_success + summary.document_rpa_success} successes
          </p>
          <p className="text-xs font-medium mt-2">
            Target: &gt; 95%
          </p>
        </CardContent>
      </Card>

      {/* Card 4: Document Compliance Rate */}
      <Card className={complianceStatus}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Document Compliance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">
            {summary.document_compliance_rate.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Auth by RISA orders
          </p>
          <p className="text-xs font-medium mt-2">
            Target: &gt; 95%
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
