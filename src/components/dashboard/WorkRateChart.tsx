import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { OrgMetrics } from '@/types/orders';
import { prepareChartData } from '@/utils/chartHelpers';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface WorkRateChartProps {
  hourlyMetrics: OrgMetrics[];
  loading: boolean;
}

export function WorkRateChart({ hourlyMetrics, loading }: WorkRateChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Work Rate Trend (24 Hours)</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = prepareChartData(hourlyMetrics);

  // Calculate width based on number of data points to enable horizontal scrolling
  // Minimum 80px per data point for readability, minimum 100% width
  const minWidthPerPoint = 80;
  const calculatedWidth = Math.max(chartData.length * minWidthPerPoint, 800);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Work Rate Trend (All Syncs)</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Hourly percentage of orders worked vs assigned and loaded (scroll horizontally to see all data)
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div style={{ width: calculatedWidth, minWidth: '100%' }}>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F3E5B8" />
                <XAxis
                  dataKey="displayLabel"
                  tick={{ fill: '#78716C', fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: '#78716C', fontSize: 12 }}
                  label={{
                    value: 'Percentage (%)',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fill: '#78716C' },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #F3E5B8',
                    borderRadius: '0.375rem',
                  }}
                  formatter={(value: unknown) => {
                    if (value === null || value === undefined) return 'No data';
                    return `${value}%`;
                  }}
                  labelFormatter={(label: string) => `Time: ${label}`}
                />
                <Legend
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="line"
                />
                <Line
                  type="monotone"
                  dataKey="workedOfAssigned"
                  name="% Worked of Assigned"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  dot={{ fill: '#F59E0B', r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="workedOfLoaded"
                  name="% Worked of Loaded"
                  stroke="#DC2626"
                  strokeWidth={2}
                  dot={{ fill: '#DC2626', r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
