import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { EVAggregatedSummary } from '@/types/evMetrics';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface EVErrorBreakdownCardProps {
  summary: EVAggregatedSummary | null;
  loading: boolean;
}

export function EVErrorBreakdownCard({ summary, loading }: EVErrorBreakdownCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!summary || summary.ev_error_total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-12">
            {summary ? 'No errors detected - excellent!' : 'No data available'}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data
  const chartData = summary.error_breakdown.map((error) => ({
    name: error.error_type,
    count: error.count,
    percentage: error.percentage,
  }));

  // Colors for different error types
  const colors = ['#EF4444', '#F59E0B', '#F97316', '#8B5CF6', '#6B7280'];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Error Breakdown</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Distribution of EV service errors by type
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12 }}
              stroke="#6B7280"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              stroke="#6B7280"
              label={{ value: 'Count', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E5E7EB',
                borderRadius: '6px',
              }}
              formatter={(value: number, name: string, props: any) => [
                `${value} errors (${props.payload.percentage.toFixed(1)}%)`,
                'Count',
              ]}
            />
            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Error Summary */}
        <div className="mt-4 pt-4 border-t">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {summary.error_breakdown.map((error, index) => (
              <div key={error.error_type} className="text-center">
                <div
                  className="w-4 h-4 rounded-full mx-auto mb-1"
                  style={{ backgroundColor: colors[index % colors.length] }}
                />
                <p className="text-xs font-medium">{error.error_type}</p>
                <p className="text-lg font-bold">{error.count}</p>
                <p className="text-xs text-muted-foreground">
                  {error.percentage.toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
