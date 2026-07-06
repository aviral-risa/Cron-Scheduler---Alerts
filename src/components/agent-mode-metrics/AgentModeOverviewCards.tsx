import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { InfoIcon } from '@/components/ui/info-icon';
import type { AgentModeOverview, NARAgentReviewAnalysis } from '@/types/agentModeMetrics';
import { AGENT_MODE_METRIC_DEFINITIONS } from '@/config/metric-definitions/agent-mode-metrics';

interface AgentModeOverviewCardsProps {
  overview: AgentModeOverview | null;
  loading: boolean;
  totalNAROrders?: number;  // Total NAR orders (Completed + In Progress only)
  narAgentReview: NARAgentReviewAnalysis | null;  // NAR Agent Review Analysis data
}

export function AgentModeOverviewCards({ overview, loading, totalNAROrders, narAgentReview }: AgentModeOverviewCardsProps) {
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

  if (!overview || overview.totalOrders === 0) {
    return (
      <div className="text-center text-muted-foreground py-8 bg-card rounded-lg border">
        No Agent Mode metrics data available for the selected date range
      </div>
    );
  }

  // Calculate key metrics
  const totalOrdersCompletedAndInProgress = overview.completedByAgent + overview.completedByHuman + overview.inProgress;

  // Option B: Calculate percentages based on Completed + In Progress only (not including yet_to_start)
  const narPercentage = totalNAROrders && totalOrdersCompletedAndInProgress > 0
    ? (totalNAROrders / totalOrdersCompletedAndInProgress) * 100
    : 0;

  const narAgentCompletedCount = narAgentReview?.totalNARAgentCompleted || 0;
  const narAgentCompletedPercentage = totalOrdersCompletedAndInProgress > 0
    ? (narAgentCompletedCount / totalOrdersCompletedAndInProgress) * 100
    : 0;

  const narAgentReviewPassedPercentage = totalOrdersCompletedAndInProgress > 0
    ? (overview.agentReviewPassed / totalOrdersCompletedAndInProgress) * 100
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Orders (Completed + InProgress) */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Orders
              </CardTitle>
              <InfoIcon content="Total orders that are Completed or In Progress. Excludes 'Yet to Start' orders. Breakdown: Completed by Agent + Completed by Human + In Progress." />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{totalOrdersCompletedAndInProgress.toLocaleString()}</div>
          </CardContent>
        </Card>

        {/* Card 2: Total NAR Orders */}
        {totalNAROrders !== undefined && (
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-300">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total NAR Orders
                </CardTitle>
                <InfoIcon content="No Auth Required (NAR) orders that are Completed or In Progress. These orders don't require prior authorization from insurance companies. Percentage shows NAR orders as % of Total Orders." />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-blue-700">
                {totalNAROrders.toLocaleString()}
                <span className="text-2xl ml-2">({narPercentage.toFixed(1)}%)</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Card 3: NAR Orders Completed by Agent */}
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-300">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                NAR Completed by Agent
              </CardTitle>
              <InfoIcon content="NAR orders that were completed by the AI agent, regardless of review status (passed, rejected, or pending). This is a subset of Total NAR Orders. Percentage shows this as % of Total Orders." />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-purple-700">
              {narAgentCompletedCount.toLocaleString()}
              <span className="text-2xl ml-2">({narAgentCompletedPercentage.toFixed(1)}%)</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: NAR Agent Review Passed */}
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-300">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                NAR Agent Review Passed
              </CardTitle>
              <InfoIcon content="NAR orders completed by the AI agent that passed human quality review. These orders required no corrections or rework. This represents the highest quality agent work. Percentage shows this as % of Total Orders." />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-green-700">
              {overview.agentReviewPassed.toLocaleString()}
              <span className="text-2xl ml-2">({narAgentReviewPassedPercentage.toFixed(1)}%)</span>
            </div>
          </CardContent>
        </Card>
    </div>
  );
}
