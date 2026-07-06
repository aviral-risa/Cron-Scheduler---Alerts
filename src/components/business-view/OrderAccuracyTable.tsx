/**
 * Order Accuracy Metrics Table Component
 * Shows authorization rate and approval rate in both daily and weekly views
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { OrderAccuracyMetrics } from '@/types/business';
import { formatPercentage } from '@/utils/metrics';

interface OrderAccuracyTableProps {
  data: OrderAccuracyMetrics | undefined;
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

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  const startFormatted = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const endFormatted = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return `${startFormatted} - ${endFormatted}`;
}

export function OrderAccuracyTable({ data, loading }: OrderAccuracyTableProps) {
  const [view, setView] = useState<'daily' | 'weekly'>('daily');

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || (data.dailyView.length === 0 && data.weeklyView.length === 0)) {
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-normal text-muted-foreground">
            View:
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant={view === 'daily' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setView('daily')}
            >
              Daily
            </Button>
            <Button
              variant={view === 'weekly' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setView('weekly')}
            >
              Weekly
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {view === 'daily' ? (
          /* Daily View */
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-medium">Date</TableHead>
                  <TableHead className="text-right font-medium">Authorization Rate %</TableHead>
                  <TableHead className="text-right font-medium">Approval Rate %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...data.dailyView]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((day) => (
                    <TableRow key={day.date}>
                      <TableCell className="font-medium">{formatDate(day.date)}</TableCell>
                      <TableCell className="text-right text-base font-semibold">
                        {formatPercentage(day.authorizationRate)}
                      </TableCell>
                      <TableCell className="text-right text-base font-semibold">
                        {formatPercentage(day.approvalRate)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          /* Weekly View */
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-medium">Week</TableHead>
                  <TableHead className="font-medium">Date Range</TableHead>
                  <TableHead className="text-right font-medium">Authorization Rate %</TableHead>
                  <TableHead className="text-right font-medium">Approval Rate %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.weeklyView.map((week) => (
                  <TableRow key={week.weekLabel}>
                    <TableCell className="font-semibold">{week.weekLabel}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateRange(week.weekStartDate, week.weekEndDate)}
                    </TableCell>
                    <TableCell className="text-right text-base font-semibold">
                      {formatPercentage(week.authorizationRate)}
                    </TableCell>
                    <TableCell className="text-right text-base font-semibold">
                      {formatPercentage(week.approvalRate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
          <div className="space-y-1">
            <div>
              <span className="font-medium">Authorization Rate:</span> (Auth by RISA + NAR + Auth on File) / Total Orders × 100
            </div>
            <div>
              <span className="font-medium">Approval Rate:</span> Auth by RISA / (Auth by RISA + Denial by RISA) × 100
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
