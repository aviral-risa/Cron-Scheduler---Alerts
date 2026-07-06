import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import type { PersonQueueData } from '@/services/algolia/queue.service';
import { ORGANIZATIONS } from '@/config/organizations';

interface PersonQueueTableProps {
  data?: PersonQueueData[];
  loading?: boolean;
}

export function PersonQueueTable({ data, loading }: PersonQueueTableProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            No queue data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatNumber = (value: number) => value.toLocaleString();

  // Sort by total open orders descending
  const sortedData = [...data].sort((a, b) => b.totalOpenOrders - a.totalOpenOrders);

  return (
    <Card className="border border-border">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="font-semibold text-foreground">Name</TableHead>
                <TableHead className="font-semibold text-foreground">Organization</TableHead>
                <TableHead className="font-semibold text-foreground text-center">New</TableHead>
                <TableHead className="font-semibold text-foreground text-center">Pending</TableHead>
                <TableHead className="font-semibold text-foreground text-center">Query</TableHead>
                <TableHead className="font-semibold text-foreground text-center">Hold</TableHead>
                <TableHead className="font-semibold text-foreground text-center">Auth Required</TableHead>
                <TableHead className="font-semibold text-foreground text-center bg-primary/10">Total Open Orders</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row, index) => {
                const org = ORGANIZATIONS.find(o => o.facilityId === row.facilityId);
                const orgName = org?.name || row.facilityId;
                return (
                  <TableRow key={`${row.personId}-${row.facilityId}-${index}`} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{row.personName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{orgName}</TableCell>
                    <TableCell className="text-center">{formatNumber(row.new)}</TableCell>
                    <TableCell className="text-center">{formatNumber(row.pending)}</TableCell>
                    <TableCell className="text-center">{formatNumber(row.query)}</TableCell>
                    <TableCell className="text-center">{formatNumber(row.hold)}</TableCell>
                    <TableCell className="text-center">{formatNumber(row.authRequired)}</TableCell>
                    <TableCell className="text-center font-bold bg-primary/5">{formatNumber(row.totalOpenOrders)}</TableCell>
                  </TableRow>
                );
              })}

              {/* Total Row */}
              <TableRow className="bg-yellow-100 hover:bg-yellow-200 border-t-2">
                <TableCell className="font-bold" colSpan={2}>Total</TableCell>
                <TableCell className="font-bold text-center">
                  {formatNumber(sortedData.reduce((sum, row) => sum + row.new, 0))}
                </TableCell>
                <TableCell className="font-bold text-center">
                  {formatNumber(sortedData.reduce((sum, row) => sum + row.pending, 0))}
                </TableCell>
                <TableCell className="font-bold text-center">
                  {formatNumber(sortedData.reduce((sum, row) => sum + row.query, 0))}
                </TableCell>
                <TableCell className="font-bold text-center">
                  {formatNumber(sortedData.reduce((sum, row) => sum + row.hold, 0))}
                </TableCell>
                <TableCell className="font-bold text-center">
                  {formatNumber(sortedData.reduce((sum, row) => sum + row.authRequired, 0))}
                </TableCell>
                <TableCell className="font-bold text-center bg-primary/10">
                  {formatNumber(sortedData.reduce((sum, row) => sum + row.totalOpenOrders, 0))}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
