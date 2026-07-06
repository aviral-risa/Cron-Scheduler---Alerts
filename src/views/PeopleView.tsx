import { useState } from 'react';
import { subDays } from 'date-fns';
import type { PeopleViewFilters } from '@/types/people';
import { PeopleViewLayout } from '@/components/people-view/PeopleViewLayout';
import { PersonMetricsCards } from '@/components/people-view/PersonMetricsCards';
import { PersonPerformanceTable } from '@/components/people-view/PersonPerformanceTable';
import { usePeopleData } from '@/hooks/usePeopleData';

export function PeopleView() {
  const today = new Date().toISOString().split('T')[0];
  const last7Days = subDays(new Date(), 7).toISOString().split('T')[0];

  const [filters, setFilters] = useState<PeopleViewFilters>({
    personId: null,
    dateRange: {
      startDate: last7Days,
      endDate: today,
    },
    includeWeekends: false,
  });

  // Use real data hook
  const { summary, dailyBreakdown, loading, error, refetch } = usePeopleData(filters);

  return (
    <PeopleViewLayout
      filters={filters}
      onFiltersChange={setFilters}
      onRefresh={refetch}
      refreshing={loading}
    >
      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 font-semibold">Error loading person data</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Empty State - No Person Selected */}
      {!filters.personId && (
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-xl font-semibold mb-2">No Person Selected</h3>
          <p className="text-muted-foreground mb-6">
            Please select a team member from the dropdown above to view their performance report card.
          </p>
        </div>
      )}

      {/* Show data when person is selected */}
      {filters.personId && (
        <>
          {/* Metrics Cards */}
          <PersonMetricsCards summary={summary} loading={loading} />

          {/* Daily Performance Table */}
          <PersonPerformanceTable
            personName={summary?.personName || ''}
            dailyBreakdown={dailyBreakdown}
            loading={loading}
          />
        </>
      )}
    </PeopleViewLayout>
  );
}
