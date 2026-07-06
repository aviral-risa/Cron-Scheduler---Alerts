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
import type { NARAgentReviewDaily, NARAgentReviewL7DAverage } from '@/types/agentModeMetrics';

interface NARAgentReviewL7DTableProps {
  narReviewDaily: NARAgentReviewDaily[];
  narReviewL7DAverage: NARAgentReviewL7DAverage | null;
  loading: boolean;
}

export function NARAgentReviewL7DTable({
  narReviewDaily,
  narReviewL7DAverage,
  loading,
}: NARAgentReviewL7DTableProps) {
  const [showPercentage, setShowPercentage] = useState(false);
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>NAR Agent Review - Last 7 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (narReviewDaily.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>NAR Agent Review - Daily Breakdown (Excluding Weekends)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No NAR agent review data for selected date range
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

  const getPassRateColor = (passRate: number) => {
    if (passRate >= 95) return 'text-green-600 font-semibold';
    if (passRate >= 85) return 'text-yellow-600';
    return 'text-red-600 font-semibold';
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
          <CardTitle>NAR Agent Review - Daily Breakdown (Excluding Weekends)</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Daily review status for NAR orders completed by agent (working days only)
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
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Passed</TableHead>
                <TableHead className="text-right">Rejected</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Not Required</TableHead>
                <TableHead className="text-right">Pass Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {narReviewDaily.map((day, idx) => (
                <TableRow key={`${day.date}-${idx}`} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{formatDate(day.date)}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {showPercentage ? '100.0%' : day.totalNARAgentCompleted.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-green-600 font-semibold">
                    {formatValue(day.reviewPassed, day.totalNARAgentCompleted)}
                  </TableCell>
                  <TableCell className="text-right text-red-600 font-semibold">
                    {formatValue(day.reviewRejected, day.totalNARAgentCompleted)}
                  </TableCell>
                  <TableCell className="text-right text-yellow-600">
                    {formatValue(day.reviewPending, day.totalNARAgentCompleted)}
                  </TableCell>
                  <TableCell className="text-right text-gray-600">
                    {formatValue(day.reviewNotRequired, day.totalNARAgentCompleted)}
                  </TableCell>
                  <TableCell className={`text-right ${getPassRateColor(day.passRatePct)}`}>
                    {day.passRatePct.toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}

              {/* L7D Average row */}
              {narReviewL7DAverage && (
                <TableRow className="bg-primary-50 hover:bg-primary-100 border-t-2">
                  <TableCell className="font-bold">{formatDate(narReviewL7DAverage.date)}</TableCell>
                  <TableCell className="text-right font-bold">
                    {showPercentage ? '100.0%' : narReviewL7DAverage.totalNARAgentCompleted.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-green-700 font-semibold">
                    {formatValue(narReviewL7DAverage.reviewPassed, narReviewL7DAverage.totalNARAgentCompleted)}
                  </TableCell>
                  <TableCell className="text-right text-red-700 font-semibold">
                    {formatValue(narReviewL7DAverage.reviewRejected, narReviewL7DAverage.totalNARAgentCompleted)}
                  </TableCell>
                  <TableCell className="text-right text-yellow-700 font-semibold">
                    {formatValue(narReviewL7DAverage.reviewPending, narReviewL7DAverage.totalNARAgentCompleted)}
                  </TableCell>
                  <TableCell className="text-right text-gray-700 font-semibold">
                    {formatValue(narReviewL7DAverage.reviewNotRequired, narReviewL7DAverage.totalNARAgentCompleted)}
                  </TableCell>
                  <TableCell className={`text-right font-bold ${getPassRateColor(narReviewL7DAverage.passRatePct)}`}>
                    {narReviewL7DAverage.passRatePct.toFixed(1)}%
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
