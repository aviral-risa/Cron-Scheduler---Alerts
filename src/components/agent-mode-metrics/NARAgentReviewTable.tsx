import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { NARAgentReviewAnalysis } from '@/types/agentModeMetrics';
import { AGENT_MODE_METRIC_THRESHOLDS } from '@/types/agentModeMetrics';

interface NARAgentReviewTableProps {
  narAgentReview: NARAgentReviewAnalysis | null;
  loading: boolean;
}

export function NARAgentReviewTable({ narAgentReview, loading }: NARAgentReviewTableProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>NAR Agent Mode - Review Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!narAgentReview || narAgentReview.totalNARAgentCompleted === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>NAR Agent Mode - Review Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No NAR Agent Mode orders found for the selected date range
          </div>
        </CardContent>
      </Card>
    );
  }

  // Determine pass rate status
  const getPassRateColor = (passRate: number) => {
    const threshold = AGENT_MODE_METRIC_THRESHOLDS.passRatePct;
    if (passRate >= threshold.good) return 'text-green-600';
    if (passRate >= threshold.warning) return 'text-yellow-600';
    return 'text-red-600';
  };

  const passRateColor = getPassRateColor(narAgentReview.passRatePct);

  return (
    <Card>
      <CardHeader>
        <CardTitle>NAR Agent Mode - Review Analysis</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Orders where auth_status = no_auth_required AND completed by Agent
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Total NAR Agent Completed */}
          <div className="bg-slate-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">
              {narAgentReview.totalNARAgentCompleted.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Total NAR Agent</div>
          </div>

          {/* Review Passed */}
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-700">
              {narAgentReview.reviewPassed.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Passed</div>
          </div>

          {/* Review Rejected */}
          <div className="bg-red-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-700">
              {narAgentReview.reviewRejected.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Rejected</div>
          </div>

          {/* Review Pending */}
          <div className="bg-yellow-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-yellow-700">
              {narAgentReview.reviewPending.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Pending</div>
          </div>

          {/* Review Not Required */}
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-700">
              {narAgentReview.reviewNotRequired.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Not Required</div>
          </div>

          {/* Pass Rate */}
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <div className={`text-2xl font-bold ${passRateColor}`}>
              {narAgentReview.passRatePct.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">Pass Rate</div>
            <div className="text-xs text-muted-foreground">Target: &gt; 95%</div>
          </div>
        </div>

        {/* Visual bar showing pass/reject distribution */}
        <div className="mt-6">
          <div className="text-sm font-medium mb-2">Pass/Reject Distribution</div>
          <div className="h-6 flex rounded-lg overflow-hidden">
            {narAgentReview.reviewPassed > 0 && (
              <div
                className="bg-green-500 flex items-center justify-center text-xs text-white font-medium"
                style={{
                  width: `${
                    (narAgentReview.reviewPassed /
                      (narAgentReview.reviewPassed + narAgentReview.reviewRejected)) *
                    100
                  }%`,
                }}
              >
                {narAgentReview.reviewPassed > 0 && narAgentReview.reviewPassed}
              </div>
            )}
            {narAgentReview.reviewRejected > 0 && (
              <div
                className="bg-red-500 flex items-center justify-center text-xs text-white font-medium"
                style={{
                  width: `${
                    (narAgentReview.reviewRejected /
                      (narAgentReview.reviewPassed + narAgentReview.reviewRejected)) *
                    100
                  }%`,
                }}
              >
                {narAgentReview.reviewRejected > 0 && narAgentReview.reviewRejected}
              </div>
            )}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Passed</span>
            <span>Rejected</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
