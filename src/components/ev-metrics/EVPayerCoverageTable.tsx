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
import type { EVPayerBreakdown } from '@/types/evMetrics';
import { useState } from 'react';

interface EVPayerCoverageTableProps {
  payerBreakdown: EVPayerBreakdown[];
  loading: boolean;
}

export function EVPayerCoverageTable({ payerBreakdown, loading }: EVPayerCoverageTableProps) {
  const [sortField, setSortField] = useState<keyof EVPayerBreakdown>('total_orders');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showPercentage, setShowPercentage] = useState(true);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Coverage Status by Payer</CardTitle>
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
          <CardTitle>Coverage Status by Payer</CardTitle>
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

  const formatValue = (count: number, percentage: number) => {
    return showPercentage ? `${percentage.toFixed(1)}%` : count.toString();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Coverage Status by Payer</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Insurance verification coverage breakdown (Active + Inactive + Unknown = 100%)
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPercentage(!showPercentage)}
        >
          Show {showPercentage ? 'Counts' : 'Percentages'}
        </Button>
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
                  onClick={() => handleSort('orders_active')}
                >
                  Active {sortField === 'orders_active' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('orders_inactive')}
                >
                  Inactive {sortField === 'orders_inactive' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('orders_unknown')}
                >
                  Unknown {sortField === 'orders_unknown' && (sortDirection === 'asc' ? '↑' : '↓')}
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
                    <span className={payer.pct_active >= 80 ? 'text-green-600 font-semibold' : payer.pct_active >= 70 ? 'text-yellow-600' : 'text-red-600'}>
                      {formatValue(payer.orders_active, payer.pct_active)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={payer.pct_inactive > 10 ? 'text-red-600' : 'text-gray-600'}>
                      {formatValue(payer.orders_inactive, payer.pct_inactive)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={payer.pct_unknown > 10 ? 'text-yellow-600' : 'text-gray-600'}>
                      {formatValue(payer.orders_unknown, payer.pct_unknown)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
          <p className="font-semibold mb-2">Coverage Status:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><span className="text-green-600 font-semibold">Active</span>: Patient has active insurance coverage (Target: ≥80%)</li>
            <li><span className="text-gray-600">Inactive</span>: Patient's insurance is inactive</li>
            <li><span className="text-gray-600">Unknown</span>: Coverage status could not be determined</li>
          </ul>
          <p className="mt-2 italic">Note: Active + Inactive + Unknown = 100% for each payer</p>
        </div>
      </CardContent>
    </Card>
  );
}
