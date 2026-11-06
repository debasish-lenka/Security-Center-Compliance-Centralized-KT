import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ProjectStartPanel } from '@/components/ProjectStartPanel';
import { PriorityLegend } from '@/components/PriorityLegend';
import { priorityRank, priorityStyle } from '@/lib/priority-style';
import { executiveDashboardApi } from '@/lib/api';
import { MetricCard } from '@/components/charts/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DeleteApprovalsPanel } from '@/components/DeleteApprovalsPanel';
import { ProjectDeleteApprovals } from '@/components/ProjectDeleteApprovals';
import { Progress } from '@/components/ui/progress';
import { formatDate, getPriorityColor, formatDateTimeIST } from '@/lib/utils';
import {
  Shield,
  AlertTriangle,
  Users,
  DollarSign,
  FileText,
  Clock,
  BarChart2,
  Target,
  Activity,
  Flag,
  Eye,
  ChevronRight,
} from 'lucide-react';

const metricIcons = {
  organizationHealth: <Target className="h-6 w-6" />,
  totalProjects: <BarChart2 className="h-6 w-6" />,
  complianceScore: <Shield className="h-6 w-6" />,
  openRisks: <AlertTriangle className="h-6 w-6" />,
  pendingKTReports: <FileText className="h-6 w-6" />,
  teamUtilization: <Users className="h-6 w-6" />,
  budgetUtilization: <DollarSign className="h-6 w-6" />,
  avgProjectHealth: <Activity className="h-6 w-6" />,
};

export function ExecutiveDashboard() {
  const { data: metricsData, isLoading } = useQuery({
    queryKey: ['executive-dashboard-metrics'],
    queryFn: async () => {
      const response = await executiveDashboardApi.getMetrics();
      return response.data;
    },
  });

  const { user: me } = useAuth(); // hooks stay above every early return
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 bg-dbi-surface rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-80 bg-dbi-surface rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
          <div className="h-80 bg-dbi-surface rounded-lg" />
          <div className="h-80 bg-dbi-surface rounded-lg" />
        </div>
      </div>
    );
  }

  const m = metricsData?.data?.metrics;
  const charts = metricsData?.data?.charts;
  const alerts = metricsData?.data?.alerts;
  const upcomingDeadlines = metricsData?.data?.upcomingDeadlines;
  const myProjects: any[] = metricsData?.data?.myProjects ?? [];
  const isManagerView = me?.role === 'MANAGER';
  const recentActivity = metricsData?.data?.recentActivity;

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-dbi-emerald';
    if (score >= 60) return 'text-dbi-amber';
    return 'text-dbi-critical';
  };

  const getHealthBg = (score: number) => {
    if (score >= 80) return 'bg-dbi-emerald/10';
    if (score >= 60) return 'bg-dbi-amber/10';
    return 'bg-dbi-critical/10';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight dbi-gradient-text">Executive Dashboard</h1>
          <p className="text-dbi-textSecondary">Organization Security Posture & Leadership Overview</p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${getHealthBg(m?.organizationHealthScore || 0)} ${getHealthColor(m?.organizationHealthScore || 0)}`}>
            <span className="flex items-center gap-1">
              <span className="relative h-2 w-2 rounded-full bg-current" />
              Health Score: {m?.organizationHealthScore || 0}%
            </span>
          </div>
        </div>
      </div>

      <DeleteApprovalsPanel />
      <ProjectDeleteApprovals />

      {/* KPI Row - Executive Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Organization Health"
          onClick={() => navigate('/reports')}
          value={`${m?.organizationHealthScore || 0}%`}
          icon={metricIcons.organizationHealth}
          accentColor="cyan"
        />
        <MetricCard
          title="Compliance Score"
          onClick={() => navigate('/compliance')}
          value={`${m?.complianceScore || 0}%`}
          icon={metricIcons.complianceScore}
          accentColor="emerald"
        />
        <MetricCard
          title="Open Risks"
          onClick={() => navigate('/compliance')}
          value={m?.openRisks || 0}
          icon={metricIcons.openRisks}
          accentColor="rose"
        />
        <MetricCard
          title="Team Utilization"
          onClick={() => navigate('/reports')}
          value={`${m?.teamUtilization || 0}%`}
          icon={metricIcons.teamUtilization}
          accentColor="indigo"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Active Projects"
          onClick={() => navigate('/projects')}
          value={m?.activeProjects || 0}
          icon={metricIcons.totalProjects}
          accentColor="cyan"
        />
        <MetricCard
          title="Pending KT Reports"
          onClick={() => navigate('/kt-reports')}
          value={m?.pendingKTReports || 0}
          icon={metricIcons.pendingKTReports}
          accentColor="amber"
        />
        <MetricCard
          title="Overdue Projects"
          onClick={() => navigate('/projects')}
          value={m?.overdueProjects || 0}
          icon={metricIcons.openRisks}
          accentColor="red"
        />
        <MetricCard
          title="Avg Project Health"
          onClick={() => navigate('/reports')}
          value={`${m?.avgProjectHealth || 0}%`}
          icon={metricIcons.avgProjectHealth}
          accentColor="emerald"
        />
      </div>

      {/* Risk Heatmap & Compliance Posture */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-dbi-critical" />
              <Link to="/compliance" className="hover:text-dbi-cyan">Risk Heatmap by Category</Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {charts?.riskHeatmap?.map((risk: any) => (
                <div key={risk.category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-dbi-textPrimary">{risk.category}</span>
                    <span className="text-dbi-textSecondary">
                      {risk.critical + risk.high + risk.medium + risk.low} total
                    </span>
                  </div>
                  <div className="h-2 bg-dbi-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-dbi-critical transition-all"
                      style={{ width: `${((risk.critical || 0) / (risk.critical + risk.high + risk.medium + risk.low || 1)) * 100}%` }}
                    />
                    <div
                      className="h-full bg-dbi-amber transition-all"
                      style={{ width: `${((risk.high || 0) / (risk.critical + risk.high + risk.medium + risk.low || 1)) * 100}%` }}
                    />
                    <div
                      className="h-full bg-dbi-amber/70 transition-all"
                      style={{ width: `${((risk.medium || 0) / (risk.critical + risk.high + risk.medium + risk.low || 1)) * 100}%` }}
                    />
                    <div
                      className="h-full bg-dbi-emerald transition-all"
                      style={{ width: `${((risk.low || 0) / (risk.critical + risk.high + risk.medium + risk.low || 1)) * 100}%` }}
                    />
                  </div>
                  <div className="flex gap-4 text-xs text-dbi-textSecondary">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-dbi-critical" /> {risk.critical} Critical</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-dbi-amber" /> {risk.high} High</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-dbi-amber/70" /> {risk.medium} Medium</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-dbi-emerald" /> {risk.low} Low</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5 text-dbi-emerald" />
              <Link to="/compliance" className="hover:text-dbi-cyan">Compliance Posture</Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {charts?.compliancePosture?.map((comp: any) => (
                <div key={comp.framework} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-dbi-textPrimary">{comp.framework}</span>
                    <Badge variant="outline" className="text-xs">{comp.trend}</Badge>
                  </div>
                  <div className="h-2 bg-dbi-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-dbi-emerald transition-all"
                      style={{ width: `${(comp.compliant / (comp.compliant + comp.partial + comp.nonCompliant || 1)) * 100}%` }}
                    />
                    <div
                      className="h-full bg-dbi-amber transition-all"
                      style={{ width: `${(comp.partial / (comp.compliant + comp.partial + comp.nonCompliant || 1)) * 100}%` }}
                    />
                    <div
                      className="h-full bg-dbi-critical transition-all"
                      style={{ width: `${(comp.nonCompliant / (comp.compliant + comp.partial + comp.nonCompliant || 1)) * 100}%` }}
                    />
                  </div>
                  <div className="flex gap-4 text-xs text-dbi-textSecondary">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-dbi-emerald" /> {comp.compliant} Compliant</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-dbi-amber" /> {comp.partial} Partial</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-dbi-critical" /> {comp.nonCompliant} Non-Compliant</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Health Trend & Resource Allocation */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-5 w-5 text-dbi-cyan" />
              Organization Health Trend (6 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end gap-3 px-2 pb-2">
              {charts?.healthTrend?.map((point: any) => (
                <div key={point.month} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-dbi-cyan rounded-t transition-all hover:bg-dbi-cyan/80"
                    style={{ height: `${(point.score / 100) * 200}px`, minHeight: '20px' }}
                    title={`${point.month}: ${point.score}%`}
                  />
                  <span className="text-xs text-dbi-textSecondary mt-2">{point.month}</span>
                  <span className="text-xs font-medium text-dbi-textPrimary">{point.score}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-dbi-indigo" />
              Resource Allocation (FTEs)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {charts?.resourceAllocation?.map((res: any) => (
                <div key={res.projectId ?? res.project} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    {res.projectId
                      ? <Link to={`/projects/${res.projectId}`} className="font-medium text-dbi-textPrimary truncate pr-2 hover:text-dbi-cyan">{res.project}</Link>
                      : <span className="font-medium text-dbi-textPrimary truncate pr-2">{res.project}</span>}
                    <span className="text-dbi-textSecondary">{res.utilized}/{res.allocated} FTEs</span>
                  </div>
                  <Progress value={(res.utilized / (res.allocated || 1)) * 100} className="h-2" />
                  <div className="flex justify-between text-xs text-dbi-textSecondary">
                    <span>Team: {res.teamSize}</span>
                    <span>{Math.round((res.utilized / (res.allocated || 1)) * 100)}% utilized</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Executive Alerts */}
      <div className="grid gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Flag className="h-5 w-5 text-dbi-amber" />
              Executive Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts?.slice(0, 5).map((alert: any) => (
              <Link key={alert.id} to={alert.projectId ? `/projects/${alert.projectId}` : alert.id === 'controls-overdue' ? '/compliance' : '/projects'} className={`block p-3 rounded-lg border-l-4 transition hover:brightness-110 ${alert.type === 'CRITICAL' ? 'bg-dbi-critical/10 border-dbi-critical' : alert.type === 'WARNING' ? 'bg-dbi-amber/10 border-dbi-amber' : 'bg-dbi-cyan/10 border-dbi-cyan'}`}>
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 p-1.5 rounded ${alert.type === 'CRITICAL' ? 'bg-dbi-critical/20 text-dbi-critical' : alert.type === 'WARNING' ? 'bg-dbi-amber/20 text-dbi-amber' : 'bg-dbi-cyan/20 text-dbi-cyan'}`}>
                    {alert.type === 'CRITICAL' && <AlertTriangle className="h-4 w-4" />}
                    {alert.type === 'WARNING' && <Flag className="h-4 w-4" />}
                    {alert.type === 'INFO' && <Eye className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dbi-textPrimary">{alert.title}</p>
                    <p className="text-sm text-dbi-textSecondary mt-0.5">{alert.message}</p>
                    {alert.projectId && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-dbi-elevated rounded text-dbi-cyan">
                        Project: {upcomingDeadlines?.find((d: any) => d.id === alert.projectId)?.name || alert.projectId}
                      </span>
                    )}
                    <p className="text-xs text-dbi-textMuted mt-1">{formatDateTimeIST(alert.timestamp)}</p>
                  </div>
                </div>
              </Link>
            ))}
            {(!alerts || alerts.length === 0) && (
              <p className="text-dbi-textSecondary text-center py-4">No executive alerts</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Projects in scope: for a manager these are the projects they were added to */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-dbi-cyan" />
            {isManagerView ? 'My Projects' : 'Projects'}
          </CardTitle>
          <PriorityLegend />
          <Link to="/projects" className="text-sm text-dbi-cyan hover:underline">View all</Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {myProjects.length === 0 && <p className="py-3 text-center text-sm text-dbi-textSecondary">No projects yet</p>}
          {[...myProjects].sort((x: any, y: any) => priorityRank(x.priority) - priorityRank(y.priority)).map((project: any) => {
            const sty = priorityStyle(project.priority);
            return (
              <div
                key={project.id}
                className={`cursor-pointer rounded-lg p-3 transition hover:brightness-110 ${sty.card}`}
                onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button,input,select,textarea,[role=button]')) navigate(`/projects/${project.id}`); }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/projects/${project.id}`} className="block truncate font-medium text-dbi-textPrimary hover:text-dbi-cyan">{project.name}</Link>
                    <p className="text-xs text-dbi-textSecondary">{String(project.status).replace(/_/g, ' ')}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge className={sty.badge}>{project.priority}</Badge>
                    <span className="w-10 text-right text-xs font-medium text-dbi-textPrimary">{project.progress ?? 0}%</span>
                  </div>
                </div>
                <div className="mt-2"><ProjectStartPanel projectId={project.id} info={project.startInfo} last={project.lastUpdate} chips /></div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Upcoming Deadlines & Recent Activity */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5 text-dbi-cyan" />
              Upcoming Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingDeadlines?.slice(0, 5).map((project: any) => (
              <Link key={project.id} to={`/projects/${project.id}`} className="block p-3 rounded-lg border border-dbi-border hover:bg-dbi-elevated/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-dbi-textPrimary">{project.name}</p>
                    <p className="text-sm text-dbi-textSecondary">Due: {formatDate(project.expectedCompletionDate)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getPriorityColor(project.priority)}>{project.priority}</Badge>
                    <div className={`w-2 h-2 rounded-full ${getHealthColor(project.health || 0).replace('text', 'bg')}`} />
                  </div>
                </div>
                <Progress value={project.health || 0} className="h-1.5 mt-2" />
              </Link>
            ))}
            {(!upcomingDeadlines || upcomingDeadlines.length === 0) && (
              <p className="text-dbi-textSecondary text-center py-4">No upcoming deadlines</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-5 w-5 text-dbi-cyan" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivity?.slice(0, 5).map((activity: any) => {
              const body = (
                <>
                  <div className="p-2 rounded-lg bg-dbi-cyan/10">
                    <ChevronRight className="h-4 w-4 text-dbi-cyan" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dbi-textPrimary truncate">{activity.action} {activity.resourceType}{activity.itemName ? `: ${activity.itemName}` : ''}</p>
                    <p className="text-xs text-dbi-textSecondary truncate">{activity.actor?.fullName}{activity.projectName ? ` • ${activity.projectName}` : ''} • {formatDateTimeIST(activity.timestamp)}</p>
                  </div>
                </>
              );
              const cls = 'flex items-center gap-3 p-3 rounded-lg hover:bg-dbi-elevated/50 transition-colors';
              return activity.link
                ? <Link key={activity.id} to={activity.link} className={cls}>{body}</Link>
                : <div key={activity.id} className={cls}>{body}</div>;
            })}
            {(!recentActivity || recentActivity.length === 0) && (
              <p className="text-dbi-textSecondary text-center py-4">No recent activity</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-dbi-emerald" />
              Project Health Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingDeadlines?.slice(0, 6).map((project: any) => (
                <Link key={project.id} to={`/projects/${project.id}`} className="block space-y-1 rounded hover:bg-dbi-elevated/50">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-dbi-textPrimary truncate pr-2">{project.name}</span>
                    <Badge className={getPriorityColor(project.priority)}>{project.priority}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={project.health || 0} className="flex-1 h-2" />
                    <span className="text-xs font-medium text-dbi-textPrimary w-10 text-right">{project.health || 0}%</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}