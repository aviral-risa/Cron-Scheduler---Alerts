import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AllOrdersDailyTrend, NARAgentDailyTrend, NARAgentReviewDaily } from '@/types/agentModeMetrics';

interface DailyOrdersReviewTableProps {
  allOrdersDailyTrend: AllOrdersDailyTrend[];
  narDailyTrend: NARAgentDailyTrend[];
  narReviewDaily: NARAgentReviewDaily[];
  loading: boolean;
}

export function DailyOrdersReviewTable({
  allOrdersDailyTrend,
  narDailyTrend,
  narReviewDaily,
  loading,
}: DailyOrdersReviewTableProps) {
  const [showPercentages, setShowPercentages] = useState(false);
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Daily Orders & Review Status Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (allOrdersDailyTrend.length === 0 || narDailyTrend.length === 0 || narReviewDaily.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Daily Orders & Review Status Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No daily order data available for the selected date range
          </div>
        </CardContent>
      </Card>
    );
  }

  // Merge daily trend and review data by date
  const combinedData = allOrdersDailyTrend.map((allOrders) => {
    const narTrend = narDailyTrend.find((r) => r.date === allOrders.date) || {
      totalNAR: 0,
    };

    const review = narReviewDaily.find((r) => r.date === allOrders.date) || {
      reviewPassed: 0,
      totalNARAgentCompleted: 0,
    };

    // Use pre-calculated totalOrders from backend (Completed + In Progress)
    return {
      date: allOrders.date,
      totalOrders: allOrders.totalOrders,
      totalNAROrders: narTrend.totalNAR,
      narCompletedByAgent: review.totalNARAgentCompleted,
      reviewPassed: review.reviewPassed,
    };
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${weekday}, ${month} ${day}`;
  };

  // Calculate L7D averages
  const l7dCount = combinedData.length;
  const l7dAverage = l7dCount > 0 ? {
    totalOrders: Math.round(combinedData.reduce((sum, day) => sum + day.totalOrders, 0) / l7dCount),
    totalNAROrders: Math.round(combinedData.reduce((sum, day) => sum + day.totalNAROrders, 0) / l7dCount),
    narCompletedByAgent: Math.round(combinedData.reduce((sum, day) => sum + day.narCompletedByAgent, 0) / l7dCount),
    reviewPassed: Math.round(combinedData.reduce((sum, day) => sum + day.reviewPassed, 0) / l7dCount),
  } : {
    totalOrders: 0,
    totalNAROrders: 0,
    narCompletedByAgent: 0,
    reviewPassed: 0,
  };

  const formatValue = (value: number, total: number) => {
    if (showPercentages && total > 0) {
      const percentage = ((value / total) * 100).toFixed(1);
      return `${percentage}%`;
    }
    return value.toLocaleString();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Daily Orders & Review Status Tracking</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Track daily NAR order completion and review status
            </p>
          </div>
          <button
            onClick={() => setShowPercentages(!showPercentages)}
            className="px-3 py-1 text-sm border rounded-md hover:bg-muted transition-colors"
          >
            {showPercentages ? 'Show Numbers' : 'Show %'}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total Orders</TableHead>
                <TableHead className="text-right">Total NAR Orders</TableHead>
                <TableHead className="text-right">NAR Completed by Agent</TableHead>
                <TableHead className="text-right">Review Pass</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {combinedData.map((day, idx) => (
                <TableRow key={`${day.date}-${idx}`}>
                  <TableCell className="font-medium">{formatDate(day.date)}</TableCell>
                  <TableCell className="text-right">
                    {day.totalOrders.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatValue(day.totalNAROrders, day.totalOrders)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatValue(day.narCompletedByAgent, day.totalOrders)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatValue(day.reviewPassed, day.totalOrders)}
                  </TableCell>
                </TableRow>
              ))}

              {/* L7D Average row */}
              <TableRow className="border-t-2 font-bold">
                <TableCell className="font-bold">L7D AVG</TableCell>
                <TableCell className="text-right">
                  {l7dAverage.totalOrders.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {formatValue(l7dAverage.totalNAROrders, l7dAverage.totalOrders)}
                </TableCell>
                <TableCell className="text-right">
                  {formatValue(l7dAverage.narCompletedByAgent, l7dAverage.totalOrders)}
                </TableCell>
                <TableCell className="text-right">
                  {formatValue(l7dAverage.reviewPassed, l7dAverage.totalOrders)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
