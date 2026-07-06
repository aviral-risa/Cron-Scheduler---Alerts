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
import type { EVPayerBreakdown } from '@/types/evMetrics';
import { useState } from 'react';

interface EVPayerBreakdownTableProps {
  payerBreakdown: EVPayerBreakdown[];
  loading: boolean;
}

export function EVPayerBreakdownTable({ payerBreakdown, loading }: EVPayerBreakdownTableProps) {
  const [sortField, setSortField] = useState<keyof EVPayerBreakdown>('total_orders');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payer Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (payerBreakdown.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payer Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-12">
            No payer data available for the selected date range
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort data
  const sortedData = [...payerBreakdown].sort((a, b) => {
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

  const handleSort = (field: keyof EVPayerBreakdown) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payer Breakdown</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          EV metrics by insurance payer
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('payer_name')}
                >
                  Payer Name {sortField === 'payer_name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('total_orders')}
                >
                  Total Orders {sortField === 'total_orders' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('pct_active')}
                >
                  Active % {sortField === 'pct_active' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('pct_inactive')}
                >
                  Inactive % {sortField === 'pct_inactive' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('pct_completed')}
                >
                  Completed % {sortField === 'pct_completed' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('pct_error')}
                >
                  Error % {sortField === 'pct_error' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((payer, index) => (
                <TableRow key={`${payer.payer_name}-${index}`}>
                  <TableCell className="font-medium">{payer.payer_name}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {payer.total_orders}
                  </TableCell>
                  <TableCell className="text-right">
                    {payer.pct_active.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right">
                    {payer.pct_inactive.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        payer.pct_completed >= 95
                          ? 'text-green-600 font-semibold'
                          : payer.pct_completed >= 90
                            ? 'text-yellow-600'
                            : 'text-red-600 font-semibold'
                      }
                    >
                      {payer.pct_completed.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        payer.pct_error <= 5
                          ? 'text-green-600'
                          : payer.pct_error <= 10
                            ? 'text-yellow-600'
                            : 'text-red-600 font-semibold'
                      }
                    >
                      {payer.pct_error.toFixed(1)}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
