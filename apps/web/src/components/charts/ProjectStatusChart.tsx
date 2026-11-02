import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartLegend,
} from '@/components/ui/chart';
import { PieChart, Pie, Cell } from 'recharts';

interface ProjectStatusChartProps {
  data: Array<{ status: string; count: number }>;
}

export function ProjectStatusChart({ data }: ProjectStatusChartProps) {
  const colors: Record<string, string> = {
    NOT_STARTED: 'hsl(215, 20%, 65%)',
    ONGOING: 'hsl(188, 94%, 66%)',
    ON_HOLD: 'hsl(45, 100%, 72%)',
    COMPLETED: 'hsl(150, 80%, 55%)',
    OVERDUE: 'hsl(0, 88%, 68%)',
    AT_RISK: 'hsl(25, 100%, 65%)',
  };

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Status Distribution</CardTitle>
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
        <CardTitle className="text-base">Project Status Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer className="h-64">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="count"
              nameKey="status"
              label={({ status, percent }) => `${status.replace('_', ' ')} ${(percent * 100).toFixed(0)}%`}
            >
              {data.map((item, index) => (
                <Cell key={`cell-${index}`} fill={colors[item.status] || 'hsl(215, 20%, 65%)'} />
              ))}
            </Pie>
            <ChartTooltip formatter={(value: number, name: string) => [value.toString(), name]} />
            <ChartLegend />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}