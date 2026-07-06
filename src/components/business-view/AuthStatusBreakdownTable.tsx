/**
 * Auth Status Breakdown Table Component
 * Shows percentage distribution by authorization status with L7D/L30D averages
 */

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AuthStatusBreakdownSummary } from '@/types/business';
import { formatPercentage } from '@/utils/metrics';

interface AuthStatusBreakdownTableProps {
  data: AuthStatusBreakdownSummary | undefined;
  loading: boolean;
}

function formatDate(dateStr: string): string {
  // Handle L7D Avg and L30D Avg rows
  if (dateStr.startsWith('L')) {
    return dateStr;
  }

  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function AuthStatusBreakdownTable({ data, loading }: AuthStatusBreakdownTableProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.dailyBreakdown.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground py-8">
            No data available for selected date range
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by date descending (most recent first)
  const sortedDaily = [...data.dailyBreakdown].sort(
    (a, b) => b.date.localeCompare(a.date)
  );

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-medium">Date</TableHead>
                <TableHead className="text-right font-medium">Auth by RISA (%)</TableHead>
                <TableHead className="text-right font-medium">No Auth Required (%)</TableHead>
                <TableHead className="text-right font-medium">Auth on File (%)</TableHead>
                <TableHead className="text-right font-medium">Denial by RISA (%)</TableHead>
                <TableHead className="text-right font-medium">Denied After Query (%)</TableHead>
                <TableHead className="text-right font-medium">Existing Denial (%)</TableHead>
                <TableHead className="text-right font-medium">In-Progress (%)</TableHead>
                <TableHead className="text-right font-medium">Rest (%)</TableHead>
                <TableHead className="text-right font-medium">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Daily breakdown rows */}
              {sortedDaily.map((day) => {
                // Check if total percentage is close to 100% (within 0.5%)
                const isValid = Math.abs(day.totalPct - 100) <= 0.5;

                return (
                  <TableRow key={day.date}>
                    <TableCell className="font-medium">{formatDate(day.date)}</TableCell>
                    <TableCell className="text-right">{formatPercentage(day.authByRisaPct)}</TableCell>
                    <TableCell className="text-right">{formatPercentage(day.noAuthRequiredPct)}</TableCell>
                    <TableCell className="text-right">{formatPercentage(day.authOnFilePct)}</TableCell>
                    <TableCell className="text-right">{formatPercentage(day.denialByRisaPct)}</TableCell>
                    <TableCell className="text-right">{formatPercentage(day.deniedAfterQueryPct)}</TableCell>
                    <TableCell className="text-right">{formatPercentage(day.existingDenialPct)}</TableCell>
                    <TableCell className="text-right">{formatPercentage(day.inProgressPct)}</TableCell>
                    <TableCell className="text-right">{formatPercentage(day.restPct)}</TableCell>
                    <TableCell className={`text-right font-semibold ${!isValid ? 'text-red-600' : ''}`}>
                      {day.totalPct.toFixed(1)}%
                      {!isValid && (
                        <span className="ml-1 text-xs">⚠</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* L7D Average row */}
              <TableRow className="bg-primary-50 hover:bg-primary-100 border-t-2">
                <TableCell className="font-bold">{data.l7dAvg.date}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l7dAvg.authByRisaPct)}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l7dAvg.noAuthRequiredPct)}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l7dAvg.authOnFilePct)}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l7dAvg.denialByRisaPct)}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l7dAvg.deniedAfterQueryPct)}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l7dAvg.existingDenialPct)}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l7dAvg.inProgressPct)}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l7dAvg.restPct)}</TableCell>
                <TableCell className="text-right font-bold">
                  {data.l7dAvg.totalPct.toFixed(1)}%
                </TableCell>
              </TableRow>

              {/* L30D Average row */}
              <TableRow className="bg-blue-50 hover:bg-blue-100">
                <TableCell className="font-bold">{data.l30dAvg.date}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l30dAvg.authByRisaPct)}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l30dAvg.noAuthRequiredPct)}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l30dAvg.authOnFilePct)}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l30dAvg.denialByRisaPct)}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l30dAvg.deniedAfterQueryPct)}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l30dAvg.existingDenialPct)}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l30dAvg.inProgressPct)}</TableCell>
                <TableCell className="text-right font-semibold">{formatPercentage(data.l30dAvg.restPct)}</TableCell>
                <TableCell className="text-right font-bold">
                  {data.l30dAvg.totalPct.toFixed(1)}%
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
          <div className="flex items-start gap-4">
            <div>
              <span className="font-medium">In-Progress:</span> Pending + Hold + Query + Auth Required
            </div>
            <div>
              <span className="font-medium">Total:</span> Should be ~100% (⚠ if off by more than 0.5%)
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
