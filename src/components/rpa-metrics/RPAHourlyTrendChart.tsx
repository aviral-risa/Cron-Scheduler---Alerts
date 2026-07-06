import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { RPAHourlyDataPoint } from '@/types/rpaMetrics';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface RPAHourlyTrendChartProps {
  hourlyData: RPAHourlyDataPoint[];
  loading: boolean;
}

export function RPAHourlyTrendChart({ hourlyData, loading }: RPAHourlyTrendChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Hourly RPA Failure Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (hourlyData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Hourly RPA Failure Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-12">
            No hourly failure data available for the selected date
          </div>
        </CardContent>
      </Card>
    );
  }

  // Format hour for display (e.g., "9 AM", "14 (2 PM)")
  const formattedData = hourlyData.map((point) => {
    const hour12 = point.hour === 0 ? 12 : point.hour > 12 ? point.hour - 12 : point.hour;
    const ampm = point.hour >= 12 ? 'PM' : 'AM';
    return {
      ...point,
      hourLabel: `${point.hour}:00`,
      displayLabel: `${hour12} ${ampm}`,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hourly RPA Failure Distribution</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Identify peak failure hours for root cause analysis (IST timezone)
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={formattedData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="hourLabel"
              tick={{ fontSize: 12 }}
              stroke="#6B7280"
              label={{ value: 'Hour (IST)', position: 'insideBottom', offset: -5 }}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              stroke="#6B7280"
              label={{ value: 'Failure Count', angle: -90, position: 'insideLeft' }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E5E7EB',
                borderRadius: '6px',
              }}
              formatter={(value: number, name: string) => {
                const displayName =
                  name === 'comment_rpa_failures'
                    ? 'Comment RPA Failures'
                    : name === 'document_rpa_failures'
                    ? 'Document RPA Failures'
                    : name;
                return [value, displayName];
              }}
              labelFormatter={(label: string) => {
                const dataPoint = formattedData.find((d) => d.hourLabel === label);
                return dataPoint ? `${dataPoint.displayLabel}` : label;
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="rect"
              formatter={(value: string) => {
                if (value === 'comment_rpa_failures') return 'Comment RPA Failures';
                if (value === 'document_rpa_failures') return 'Document RPA Failures';
                return value;
              }}
            />
            <Bar
              dataKey="comment_rpa_failures"
              name="Comment RPA Failures"
              fill="#EF4444"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="document_rpa_failures"
              name="Document RPA Failures"
              fill="#F97316"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 text-xs text-muted-foreground">
          <p>
            <strong>Usage:</strong> Identify hours with high failure spikes to investigate root causes
            (e.g., system downtime, network issues, specific order types).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
