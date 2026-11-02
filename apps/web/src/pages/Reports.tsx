import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { projectsApi, ktReportsApi, documentsApi, complianceApi, dashboardApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, FileText, FolderOpen, ShieldCheck, TrendingUp, Users, AlertTriangle } from 'lucide-react';
import { formatDate } from '@/lib/utils';

const timeRangeOptions = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: '1y', label: 'Last Year' },
];

export function Reports() {
  const [timeRange, setTimeRange] = useState('30d');

  const { data: metricsData } = useQuery({
    queryKey: ['dashboard-metrics', timeRange],
    queryFn: () => dashboardApi.getMetrics({ timeRange }),
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects-for-reports', timeRange],
    queryFn: () => projectsApi.list({ limit: '100' }),
  });

  const { data: ktReportsData } = useQuery({
    queryKey: ['kt-reports-for-reports', timeRange],
    queryFn: () => ktReportsApi.list({ limit: '100' }),
  });

  const { data: documentsData } = useQuery({
    queryKey: ['documents-for-reports', timeRange],
    queryFn: () => documentsApi.list({ limit: '100' }),
  });

  const { data: complianceData } = useQuery({
    queryKey: ['compliance-for-reports', timeRange],
    queryFn: () => complianceApi.list({ limit: '100' }),
  });

  const metrics = metricsData?.data?.metrics || {};
  const projects = projectsData?.data?.items || [];
  const ktReports = ktReportsData?.data?.items || [];
  const documents = documentsData?.data?.items || [];
  const controls = complianceData?.data?.items || [];

  const projectStatusCounts = projects.reduce((acc: Record<string, number>, p: any) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const ktReportStatusCounts = ktReports.reduce((acc: Record<string, number>, r: any) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const complianceStatusCounts = controls.reduce((acc: Record<string, number>, c: any) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const documentTypeCounts = documents.reduce((acc: Record<string, number>, d: any) => {
    acc[d.type] = (acc[d.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const getStatusColor = (status: string) => {
    if (['COMPLETED', 'VERIFIED', 'APPROVED', 'IMPLEMENTED'].includes(status)) return 'bg-dbi-success/20 text-dbi-success';
    if (['ONGOING', 'SUBMITTED', 'UNDER_REVIEW', 'PARTIALLY_IMPLEMENTED'].includes(status)) return 'bg-dbi-warning/20 text-dbi-warning';
    if (['OVERDUE', 'AT_RISK', 'REJECTED', 'NOT_IMPLEMENTED'].includes(status)) return 'bg-dbi-critical/20 text-dbi-critical';
    return 'bg-dbi-textSecondary/20 text-dbi-textSecondary';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">Reports & Analytics</h1>
          <p className="text-dbi-textSecondary">Comprehensive security operations analytics and reporting</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Time Range" />
          </SelectTrigger>
          <SelectContent>
            {timeRangeOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-dbi-textSecondary">Total Projects</CardTitle>
            <TrendingUp className="h-4 w-4 text-dbi-cyan" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-dbi-textPrimary">{projects.length}</div>
            <p className="text-xs text-dbi-textSecondary">Active: {projectStatusCounts.ONGOING || 0} | Completed: {projectStatusCounts.COMPLETED || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-dbi-textSecondary">KT Reports</CardTitle>
            <FileText className="h-4 w-4 text-dbi-indigo" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-dbi-textPrimary">{ktReports.length}</div>
            <p className="text-xs text-dbi-textSecondary">Submitted: {ktReportStatusCounts.SUBMITTED || 0} | Approved: {ktReportStatusCounts.APPROVED || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-dbi-textSecondary">Documents</CardTitle>
            <FolderOpen className="h-4 w-4 text-dbi-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-dbi-textPrimary">{documents.length}</div>
            <p className="text-xs text-dbi-textSecondary">Types: {Object.keys(documentTypeCounts).length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-dbi-textSecondary">Compliance Score</CardTitle>
            <ShieldCheck className="h-4 w-4 text-dbi-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-dbi-textPrimary">{metrics.complianceScore || 87}%</div>
            <p className="text-xs text-dbi-textSecondary">Verified: {complianceStatusCounts.VERIFIED || 0} | Pending: {complianceStatusCounts.NOT_IMPLEMENTED || 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Project Status Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(projectStatusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-dbi-textPrimary capitalize">{status.replace('_', ' ')}</span>
                <Badge className={getStatusColor(status)}>{count as number}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> KT Report Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(ktReportStatusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-dbi-textPrimary capitalize">{status.replace('_', ' ')}</span>
                <Badge className={getStatusColor(status)}>{count as number}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Compliance Controls Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(complianceStatusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-dbi-textPrimary capitalize">{status.replace('_', ' ')}</span>
                <Badge className={getStatusColor(status)}>{count as number}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Recent Project Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Deadline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.slice(0, 10).map((project: any) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">{project.name}</TableCell>
                    <TableCell><Badge className={getStatusColor(project.status)}>{project.status.replace('_', ' ')}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{project.priority}</Badge></TableCell>
                    <TableCell>
                      <div className="w-32">
                        <div className="h-2 bg-dbi-border rounded-full overflow-hidden">
                          <div className="h-full bg-dbi-cyan" style={{ width: `${project.progress}%` }} />
                        </div>
                        <span className="text-xs text-dbi-textSecondary">{project.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{project.owner?.fullName}</TableCell>
                    <TableCell>{project.expectedCompletionDate ? formatDate(project.expectedCompletionDate) : 'Not set'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Risk & Compliance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 bg-dbi-critical/10 rounded-lg border border-dbi-critical/20">
              <div className="text-3xl font-bold text-dbi-critical">{projects.filter((p: any) => p.status === 'AT_RISK' || p.status === 'OVERDUE').length}</div>
              <div className="text-sm text-dbi-textSecondary">Projects at Risk / Overdue</div>
            </div>
            <div className="p-4 bg-dbi-warning/10 rounded-lg border border-dbi-warning/20">
              <div className="text-3xl font-bold text-dbi-warning">{controls.filter((c: any) => c.status === 'NOT_IMPLEMENTED' || c.status === 'PARTIALLY_IMPLEMENTED').length}</div>
              <div className="text-sm text-dbi-textSecondary">Controls Needing Attention</div>
            </div>
            <div className="p-4 bg-dbi-success/10 rounded-lg border border-dbi-success/20">
              <div className="text-3xl font-bold text-dbi-success">{controls.filter((c: any) => c.status === 'VERIFIED' || c.status === 'IMPLEMENTED').length}</div>
              <div className="text-sm text-dbi-textSecondary">Controls Verified / Implemented</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}