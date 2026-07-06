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
import type { NAROrdersByPlan } from '@/types/agentModeMetrics';

interface NAROrdersByPlanTableProps {
  narOrdersByPlan: NAROrdersByPlan[];
  loading: boolean;
}

export function NAROrdersByPlanTable({ narOrdersByPlan, loading }: NAROrdersByPlanTableProps) {
  const [sortField, setSortField] = useState<keyof NAROrdersByPlan>('total');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showPercentage, setShowPercentage] = useState(false);
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>NAR Orders - Medical Order Status by Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (narOrdersByPlan.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>NAR Orders - Medical Order Status by Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No NAR orders found for the selected date range
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort handler
  const handleSort = (field: keyof NAROrdersByPlan) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Sort data
  const sortedData = [...narOrdersByPlan].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return 0;
  });

  // Format value helper
  const formatValue = (count: number, total: number) => {
    if (showPercentage) {
      const pct = total > 0 ? (count / total) * 100 : 0;
      return `${pct.toFixed(1)}%`;
    }
    return count.toLocaleString();
  };

  // Calculate totals for footer (exclude Yet to Start from total)
  const totals = narOrdersByPlan.reduce(
    (acc, plan) => ({
      completedByAgent: acc.completedByAgent + plan.completedByAgent,
      completedByHuman: acc.completedByHuman + plan.completedByHuman,
      inProgress: acc.inProgress + plan.inProgress,
      yetToStart: acc.yetToStart + plan.yetToStart,
      total: acc.total + plan.completedByAgent + plan.completedByHuman + plan.inProgress,
    }),
    { completedByAgent: 0, completedByHuman: 0, inProgress: 0, yetToStart: 0, total: 0 }
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>NAR Orders - Medical Order Status by Plan</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Breakdown by primary_payer_name for orders where auth_status = no_auth_required
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
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('planName')}
                >
                  Plan Name {sortField === 'planName' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 text-right"
                  onClick={() => handleSort('completedByAgent')}
                >
                  Completed by Agent {sortField === 'completedByAgent' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 text-right"
                  onClick={() => handleSort('completedByHuman')}
                >
                  Completed by Human {sortField === 'completedByHuman' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 text-right"
                  onClick={() => handleSort('inProgress')}
                >
                  In Progress {sortField === 'inProgress' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 text-right"
                  onClick={() => handleSort('yetToStart')}
                >
                  Yet to Start {sortField === 'yetToStart' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 text-right"
                  onClick={() => handleSort('total')}
                >
                  Total {sortField === 'total' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((plan, idx) => {
                const totalExcludingYetToStart = plan.completedByAgent + plan.completedByHuman + plan.inProgress;
                return (
                  <TableRow key={`${plan.planName}-${idx}`}>
                    <TableCell className="font-medium max-w-[250px] truncate" title={plan.planName}>
                      {plan.planName}
                    </TableCell>
                    <TableCell className="text-right text-blue-600 font-semibold">
                      {formatValue(plan.completedByAgent, totalExcludingYetToStart)}
                    </TableCell>
                    <TableCell className="text-right text-purple-600 font-semibold">
                      {formatValue(plan.completedByHuman, totalExcludingYetToStart)}
                    </TableCell>
                    <TableCell className="text-right text-yellow-600">
                      {formatValue(plan.inProgress, totalExcludingYetToStart)}
                    </TableCell>
                    <TableCell className="text-right text-gray-600">
                      {formatValue(plan.yetToStart, totalExcludingYetToStart)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {totalExcludingYetToStart.toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Totals row */}
              <TableRow className="bg-slate-100 font-bold">
                <TableCell>TOTAL</TableCell>
                <TableCell className="text-right text-blue-700">
                  {formatValue(totals.completedByAgent, totals.total)}
                </TableCell>
                <TableCell className="text-right text-purple-700">
                  {formatValue(totals.completedByHuman, totals.total)}
                </TableCell>
                <TableCell className="text-right text-yellow-700">
                  {formatValue(totals.inProgress, totals.total)}
                </TableCell>
                <TableCell className="text-right text-gray-700">
                  {formatValue(totals.yetToStart, totals.total)}
                </TableCell>
                <TableCell className="text-right">{totals.total.toLocaleString()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
