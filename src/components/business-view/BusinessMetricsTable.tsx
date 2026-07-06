/**
 * Business Metrics Table Component
 * Comprehensive daily breakdown table with productivity metrics and color-coded performance
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
import type { DailyBusinessMetrics } from '@/types/business';
import { formatNumber } from '@/utils/metrics';

interface BusinessMetricsTableProps {
  dailyBreakdown: DailyBusinessMetrics[];
  loading: boolean;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function getRowClassName(status: 'above' | 'normal' | 'below'): string {
  switch (status) {
    case 'above':
      return 'bg-green-50 hover:bg-green-100';
    case 'below':
      return 'bg-red-50 hover:bg-red-100';
    case 'normal':
      return 'bg-gray-50 hover:bg-gray-100';
  }
}

function formatVariance(variance: number | null): string {
  if (variance === null) return 'N/A';
  const sign = variance > 0 ? '+' : '';
  return `${sign}${formatNumber(variance)}`;
}

function formatVariancePercentage(variance: number | null): string {
  if (variance === null) return 'N/A';
  const sign = variance > 0 ? '+' : '';
  return `${sign}${variance.toFixed(1)}%`;
}

export function BusinessMetricsTable({ dailyBreakdown, loading }: BusinessMetricsTableProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (dailyBreakdown.length === 0) {
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
  const sortedData = [...dailyBreakdown].sort(
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
                <TableHead className="text-right font-medium">Orders Worked</TableHead>
                <TableHead className="text-right font-medium">Orders Loaded</TableHead>
                <TableHead className="text-right font-medium">7-Day Avg</TableHead>
                <TableHead className="text-right font-medium">Variance</TableHead>
                <TableHead className="text-right font-medium">Variance %</TableHead>
                <TableHead className="text-right font-medium">Active People</TableHead>
                <TableHead className="text-right font-medium">Orders/Person</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((day) => (
                <TableRow
                  key={day.date}
                  className={getRowClassName(day.performanceStatus)}
                >
                  <TableCell className="font-medium">{formatDate(day.date)}</TableCell>
                  <TableCell className="text-right text-base font-semibold">
                    {formatNumber(day.ordersWorked)}
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(day.ordersLoaded)}</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(day.sevenDayRollingAvg)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatVariance(day.varianceFromAvg)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatVariancePercentage(day.variancePercentage)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(day.activeProviderCount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {day.ordersPerPerson !== null
                      ? day.ordersPerPerson.toFixed(1)
                      : 'N/A'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t flex items-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-50 border border-green-200 rounded" />
            <span>Above avg (&gt;+5%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-50 border border-gray-200 rounded" />
            <span>Normal (±5%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-50 border border-red-200 rounded" />
            <span>Below avg (&lt;-5%)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
