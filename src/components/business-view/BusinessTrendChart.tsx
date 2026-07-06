/**
 * Business Trend Chart Component
 * Line chart showing daily order trends with 7-day rolling average
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DailyBusinessMetrics } from '@/types/business';
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

interface BusinessTrendChartProps {
  dailyBreakdown: DailyBusinessMetrics[];
  loading: boolean;
}

interface ChartDataPoint {
  date: string;
  displayLabel: string;
  ordersWorked: number;
  rollingAvg: number;
  variance: number | null;
}

function prepareChartData(dailyBreakdown: DailyBusinessMetrics[]): ChartDataPoint[] {
  return dailyBreakdown.map((day) => {
    // Format date as "Jan 3"
    const dateObj = new Date(day.date + 'T00:00:00');
    const displayLabel = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    return {
      date: day.date,
      displayLabel,
      ordersWorked: day.ordersWorked,
      rollingAvg: day.sevenDayRollingAvg,
      variance: day.varianceFromAvg,
    };
  });
}

export function BusinessTrendChart({ dailyBreakdown, loading }: BusinessTrendChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Daily Order Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (dailyBreakdown.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Daily Order Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-12">
            No data available for selected date range
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = prepareChartData(dailyBreakdown);

  // Calculate width based on number of data points for horizontal scrolling
  const minWidthPerPoint = 80;
  const calculatedWidth = Math.max(chartData.length * minWidthPerPoint, 800);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Order Trends</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Orders worked per day with 7-day rolling average
          {chartData.length > 10 && ' (scroll horizontally to see all data)'}
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div style={{ width: calculatedWidth, minWidth: '100%' }}>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  dataKey="displayLabel"
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  label={{
                    value: 'Orders',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fill: '#64748B' },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '0.375rem',
                  }}
                  formatter={(value: unknown, name?: string) => {
                    if (value === null || value === undefined) return ['No data', name || ''];
                    const numValue = typeof value === 'number' ? value : 0;
                    return [numValue.toLocaleString(), name || ''];
                  }}
                  labelFormatter={(label: string) => `Date: ${label}`}
                />
                <Legend
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="line"
                />
                <Line
                  type="monotone"
                  dataKey="ordersWorked"
                  name="Orders Worked"
                  stroke="#6366F1"
                  strokeWidth={2}
                  dot={{ fill: '#6366F1', r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="rollingAvg"
                  name="7-Day Rolling Avg"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: '#3B82F6', r: 4 }}
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
