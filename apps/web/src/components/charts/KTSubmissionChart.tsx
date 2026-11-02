import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
} from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

interface KTSubmissionChartProps {
  data: Array<{ date: string; count: number }>;
}

export function KTSubmissionChart({ data }: KTSubmissionChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">KT Submission Rate (30 Days)</CardTitle>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center">
          <p className="text-dbi-textSecondary">No data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">KT Submission Rate (30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer className="h-64">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-dbi-border" />
            <XAxis dataKey="date" className="text-xs" tickLine={false} axisLine={false} />
            <YAxis className="text-xs" tickLine={false} axisLine={false} />
            <ChartTooltip formatter={(value: number, name: string) => [value.toString(), name]} />
            <Line
              type="monotone"
              dataKey="count"
              stroke="hsl(188, 94%, 66%)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}