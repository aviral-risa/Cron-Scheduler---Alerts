import { useState } from 'react';
import type { AgentModeMetricsFilters } from '@/types/agentModeMetrics';
import { useAgentModeMetricsData } from '@/hooks/useAgentModeMetricsData';
import { AgentModeMetricsViewLayout } from '@/components/agent-mode-metrics/AgentModeMetricsViewLayout';
import { AgentModeOverviewCards } from '@/components/agent-mode-metrics/AgentModeOverviewCards';
import { DailyOrdersReviewTable } from '@/components/agent-mode-metrics/DailyOrdersReviewTable';
import { NARAgentReviewTable } from '@/components/agent-mode-metrics/NARAgentReviewTable';
import { NAROrdersByPlanTable } from '@/components/agent-mode-metrics/NAROrdersByPlanTable';
import { NARAgentL7DTrendTable } from '@/components/agent-mode-metrics/NARAgentL7DTrendTable';
import { NARAgentReviewL7DTable } from '@/components/agent-mode-metrics/NARAgentReviewL7DTable';
import { PageIntro } from '@/components/layout/PageIntro';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PAGE_INTRODUCTIONS } from '@/config/page-introductions';

export function AgentModeMetricsView() {
  // Default: Last 7 days excluding today
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  const [filters, setFilters] = useState<AgentModeMetricsFilters>({
    organizationIds: ['HhwIHO4npKhrxyylkC33'], // Default to NYCBS
    dateRange: {
      startDate: sevenDaysAgo.toISOString().split('T')[0],
      endDate: yesterday.toISOString().split('T')[0],
    },
  });

  const {
    overview,
    narAgentReview,
    narOrdersByPlan,
    allOrdersDailyTrend,
    narDailyTrend,
    narL7DAverage,
    narReviewDaily,
    narReviewL7DAverage,
    loading,
    error,
    refetch
  } = useAgentModeMetricsData(filters);

  // Calculate total NAR orders (Completed + In Progress only, excluding Yet to Start)
  // This matches the Total Orders calculation which also only counts Completed + In Progress
  const totalNAROrders = narOrdersByPlan.reduce((sum, plan) =>
    sum + plan.completedByAgent + plan.completedByHuman + plan.inProgress, 0
  );

  return (
    <TooltipProvider>
      <AgentModeMetricsViewLayout
        header={
          <PageIntro
            title={PAGE_INTRODUCTIONS.agentModeMetrics.title}
            description={PAGE_INTRODUCTIONS.agentModeMetrics.description}
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
          <p className="text-red-800 font-semibold">Error loading NAR Agent Mode metrics</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Section 1: Order Completion Overview */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Order Completion Overview</h2>
        <AgentModeOverviewCards
          overview={overview}
          totalNAROrders={totalNAROrders}
          narAgentReview={narAgentReview}
          loading={loading}
        />
      </div>

      {/* Section 2: Daily Orders & Review Status Tracking */}
      <div className="mb-6">
        <DailyOrdersReviewTable
          allOrdersDailyTrend={allOrdersDailyTrend}
          narDailyTrend={narDailyTrend}
          narReviewDaily={narReviewDaily}
          loading={loading}
        />
      </div>

      {/* Section 3: NAR Orders - Last 7 Days Trend */}
      <div className="mb-6">
        <NARAgentL7DTrendTable
          narDailyTrend={narDailyTrend}
          narL7DAverage={narL7DAverage}
          loading={loading}
        />
      </div>

      {/* Section 4: NAR Agent Review - Last 7 Days */}
      <div className="mb-6">
        <NARAgentReviewL7DTable
          narReviewDaily={narReviewDaily}
          narReviewL7DAverage={narReviewL7DAverage}
          loading={loading}
        />
      </div>

      {/* Section 5: NAR Agent Mode - Review Analysis */}
      <div className="mb-6">
        <NARAgentReviewTable narAgentReview={narAgentReview} loading={loading} />
      </div>

      {/* Section 6: NAR Orders by Plan */}
      <div className="mb-6">
        <NAROrdersByPlanTable narOrdersByPlan={narOrdersByPlan} loading={loading} />
      </div>
      </AgentModeMetricsViewLayout>
    </TooltipProvider>
  );
}
