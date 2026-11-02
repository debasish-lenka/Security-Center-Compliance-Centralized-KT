import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
} from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';

interface TeamWorkloadChartProps {
  data: Array<{ userName: string; userEmail: string; projectCount: number }>;
}

export function TeamWorkloadChart({ data }: TeamWorkloadChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team Workload</CardTitle>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center">
          <p className="text-dbi-textSecondary">No data available</p>
        </CardContent>
      </Card>
    );
  }

  const colors = [
    'hsl(188, 94%, 66%)',
    'hsl(259, 94%, 66%)',
    'hsl(150, 80%, 55%)',
    'hsl(45, 100%, 72%)',
    'hsl(0, 88%, 68%)',
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team Workload</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer className="h-64">
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" className="stroke-dbi-border" />
            <XAxis type="number" className="text-xs" tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="userName" className="text-xs" tickLine={false} axisLine={false} width={100} />
            <ChartTooltip formatter={(value: number, name: string) => [value.toString(), name]} />
            <Bar dataKey="projectCount" radius={[0, 4, 4, 0]}>
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}