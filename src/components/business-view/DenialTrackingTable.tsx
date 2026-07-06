/**
 * Denial Tracking Table Component
 * Tracks denials trending toward zero
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
import type { DenialTrackingSummary } from '@/types/business';
import { formatNumber } from '@/utils/metrics';

interface DenialTrackingTableProps {
  data: DenialTrackingSummary | undefined;
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

export function DenialTrackingTable({ data, loading }: DenialTrackingTableProps) {
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

  // Calculate trend (comparing first vs last in sorted data)
  const getTrendIndicator = () => {
    if (sortedDaily.length < 2) return null;

    const mostRecent = sortedDaily[0].totalDenials;
    const oldest = sortedDaily[sortedDaily.length - 1].totalDenials;

    if (mostRecent < oldest) {
      return { text: 'Trending down', icon: '↓', color: 'text-green-600' };
    } else if (mostRecent > oldest) {
      return { text: 'Trending up', icon: '↑', color: 'text-red-600' };
    } else {
      return { text: 'Stable', icon: '→', color: 'text-gray-600' };
    }
  };

  const trend = getTrendIndicator();

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-medium">Date</TableHead>
                <TableHead className="text-right font-medium">Total Denials</TableHead>
                <TableHead className="text-right font-medium">Denial by RISA</TableHead>
                <TableHead className="text-right font-medium">Denied After Query</TableHead>
                <TableHead className="text-right font-medium">Existing Denial</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedDaily.map((day) => (
                <TableRow key={day.date}>
                  <TableCell className="font-medium">{formatDate(day.date)}</TableCell>
                  <TableCell className="text-right text-base font-semibold">
                    {formatNumber(day.totalDenials)}
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(day.denialByRisa)}</TableCell>
                  <TableCell className="text-right">{formatNumber(day.deniedAfterQuery)}</TableCell>
                  <TableCell className="text-right">{formatNumber(day.existingDenial)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Goal indicator */}
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">
              <span className="font-semibold">Goal:</span> Total Denials trending toward 0
            </div>
            {trend && (
              <div className={`flex items-center gap-1 font-medium ${trend.color}`}>
                <span>{trend.icon}</span>
                <span>{trend.text}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
