import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { NARAgentDailyTrend, NARAgentL7DAverage } from '@/types/agentModeMetrics';

interface NARAgentL7DTrendTableProps {
  narDailyTrend: NARAgentDailyTrend[];
  narL7DAverage: NARAgentL7DAverage | null;
  loading: boolean;
}

export function NARAgentL7DTrendTable({
  narDailyTrend,
  narL7DAverage,
  loading,
}: NARAgentL7DTrendTableProps) {
  const [showPercentage, setShowPercentage] = useState(false);
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>NAR Orders - Last 7 Days Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (narDailyTrend.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>NAR Orders - Daily Trend (Excluding Weekends)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No NAR order data for selected date range
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (dateString: string) => {
    if (dateString === 'L7D Avg') return dateString;
    const date = new Date(dateString);
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${weekday}, ${month} ${day}`;
  };

  const formatValue = (count: number, total: number) => {
    if (showPercentage) {
      const pct = total > 0 ? (count / total) * 100 : 0;
      return `${pct.toFixed(1)}%`;
    }
    return count.toLocaleString();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>NAR Orders - Daily Trend (Excluding Weekends)</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Daily breakdown of NAR order status for selected date range (working days only)
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPercentage(!showPercentage)}
        >
          {showPercentage ? 'Show Counts' : 'Show Percentages'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Yet to Start</TableHead>
                <TableHead className="text-right">Pending (In Progress)</TableHead>
                <TableHead className="text-right">Completed by Human</TableHead>
                <TableHead className="text-right">Completed by Agent</TableHead>
                <TableHead className="text-right">Total NAR Orders</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {narDailyTrend.map((day, idx) => (
                <TableRow key={`${day.date}-${idx}`} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{formatDate(day.date)}</TableCell>
                  <TableCell className="text-right text-gray-600">
                    {formatValue(day.yetToStart, day.totalNAR)}
                  </TableCell>
                  <TableCell className="text-right text-yellow-600">
                    {formatValue(day.pending, day.totalNAR)}
                  </TableCell>
                  <TableCell className="text-right text-purple-600">
                    {formatValue(day.completedByHuman, day.totalNAR)}
                  </TableCell>
                  <TableCell className="text-right text-blue-600 font-semibold">
                    {formatValue(day.completedByAgent, day.totalNAR)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {showPercentage ? '100.0%' : day.totalNAR.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}

              {/* L7D Average row */}
              {narL7DAverage && (
                <TableRow className="bg-primary-50 hover:bg-primary-100 border-t-2">
                  <TableCell className="font-bold">{formatDate(narL7DAverage.date)}</TableCell>
                  <TableCell className="text-right text-gray-700 font-semibold">
                    {formatValue(narL7DAverage.yetToStart, narL7DAverage.totalNAR)}
                  </TableCell>
                  <TableCell className="text-right text-yellow-700 font-semibold">
                    {formatValue(narL7DAverage.pending, narL7DAverage.totalNAR)}
                  </TableCell>
                  <TableCell className="text-right text-purple-700 font-semibold">
                    {formatValue(narL7DAverage.completedByHuman, narL7DAverage.totalNAR)}
                  </TableCell>
                  <TableCell className="text-right text-blue-700 font-semibold">
                    {formatValue(narL7DAverage.completedByAgent, narL7DAverage.totalNAR)}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {showPercentage ? '100.0%' : narL7DAverage.totalNAR.toLocaleString()}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
