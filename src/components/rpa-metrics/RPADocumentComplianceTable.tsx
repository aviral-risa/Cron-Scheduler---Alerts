import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { RPADailySummary } from '@/types/rpaMetrics';

interface RPADocumentComplianceTableProps {
  summaries: RPADailySummary[];
  loading: boolean;
}

export function RPADocumentComplianceTable({ summaries, loading }: RPADocumentComplianceTableProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Document Upload Compliance (Auth by RISA)</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (summaries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Document Upload Compliance (Auth by RISA)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No document compliance data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Filter to only show rows with auth_by_risa orders
  const relevantData = summaries.filter((summary) => summary.auth_by_risa_count > 0);

  if (relevantData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Document Upload Compliance (Auth by RISA)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No 'Auth by RISA' orders found in the selected date range
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by compliance rate (ascending) to highlight non-compliant dates first
  const sortedData = [...relevantData].sort((a, b) => {
    const complianceA = a.pct_document_compliance || 0;
    const complianceB = b.pct_document_compliance || 0;
    return complianceA - complianceB;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Document Upload Compliance (Auth by RISA)</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Track document upload for orders authorized by RISA (Target: 100% compliance)
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Auth by RISA Count</TableHead>
                <TableHead className="text-right">Documents Uploaded</TableHead>
                <TableHead className="text-right">Documents Missing</TableHead>
                <TableHead className="text-right">Compliance %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((summary, idx) => {
                const complianceRate = summary.pct_document_compliance || 0;
                const isFullCompliance = complianceRate >= 100;
                const isPartialCompliance = complianceRate >= 90 && complianceRate < 100;
                const isNonCompliant = complianceRate < 90;

                let rowClass = '';
                let complianceTextClass = 'font-semibold';

                if (isFullCompliance) {
                  complianceTextClass = 'font-semibold text-green-600';
                } else if (isPartialCompliance) {
                  rowClass = 'bg-yellow-50 hover:bg-yellow-100';
                  complianceTextClass = 'font-semibold text-yellow-700';
                } else if (isNonCompliant) {
                  rowClass = 'bg-red-50 hover:bg-red-100';
                  complianceTextClass = 'font-semibold text-red-600';
                }

                return (
                  <TableRow key={`${summary.facility_id}-${summary.date}-${idx}`} className={rowClass}>
                    <TableCell className="font-medium">{summary.date}</TableCell>
                    <TableCell className="text-right">{summary.auth_by_risa_count}</TableCell>
                    <TableCell className="text-right text-green-600 font-semibold">
                      {summary.auth_by_risa_doc_uploaded}
                    </TableCell>
                    <TableCell className="text-right text-red-600 font-semibold">
                      {summary.auth_by_risa_doc_missing}
                    </TableCell>
                    <TableCell className={`text-right ${complianceTextClass}`}>
                      {complianceRate.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-50 border border-green-200 rounded"></div>
            <span>Full compliance (100%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-50 border border-yellow-200 rounded"></div>
            <span>Partial compliance (90-99%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-50 border border-red-200 rounded"></div>
            <span>Non-compliant (&lt; 90%)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
