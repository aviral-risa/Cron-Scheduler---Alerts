/**
 * Organization Breakdown Table Component
 * Organization-level breakdown with productivity metrics and performance indicators
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
import type { OrgBusinessMetrics } from '@/types/business';
import { formatNumber, formatPercentage } from '@/utils/metrics';

interface OrgBreakdownTableProps {
  orgBreakdown: OrgBusinessMetrics[];
  loading: boolean;
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

export function OrgBreakdownTable({ orgBreakdown, loading }: OrgBreakdownTableProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (orgBreakdown.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground py-8">
            No organization data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-medium">Organization</TableHead>
                <TableHead className="text-right font-medium">Orders Worked</TableHead>
                <TableHead className="text-right font-medium">Orders Loaded</TableHead>
                <TableHead className="text-right font-medium">7-Day Avg</TableHead>
                <TableHead className="text-right font-medium">Variance</TableHead>
                <TableHead className="text-right font-medium">Variance %</TableHead>
                <TableHead className="text-right font-medium">Active People</TableHead>
                <TableHead className="text-right font-medium">Orders/Person</TableHead>
                <TableHead className="text-right font-medium">Approval Rate</TableHead>
                <TableHead className="text-right font-medium">Auth Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgBreakdown.map((org) => (
                <TableRow
                  key={org.facilityId}
                  className={getRowClassName(org.performanceStatus)}
                >
                  <TableCell className="font-medium">{org.orgName}</TableCell>
                  <TableCell className="text-right text-base font-semibold">
                    {formatNumber(org.totalOrdersWorked)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(org.totalOrdersLoaded)}
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(org.sevenDayAvg)}</TableCell>
                  <TableCell className="text-right">
                    {formatVariance(org.varianceFromAvg)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatVariancePercentage(org.variancePercentage)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(org.activeProviderCount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {org.ordersPerPerson !== null ? org.ordersPerPerson.toFixed(1) : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right">{formatPercentage(org.approvalRate)}</TableCell>
                  <TableCell className="text-right">
                    {formatPercentage(org.authorizationRate)}
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
