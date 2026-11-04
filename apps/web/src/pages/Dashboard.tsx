import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api';
import { MetricCard } from '@/components/charts/MetricCard';
import { ProjectStatusChart } from '@/components/charts/ProjectStatusChart';
import { TeamWorkloadChart } from '@/components/charts/TeamWorkloadChart';
import { KTSubmissionChart } from '@/components/charts/KTSubmissionChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, getStatusColor, getPriorityColor, formatDateTimeIST } from '@/lib/utils';
import {
  FolderKanban,
  Shield,
  ClipboardList,
  FileText,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';

const metricIcons = {
  totalProjects: <FolderKanban className="h-6 w-6" />,
  ongoingProjects: <Shield className="h-6 w-6" />,
  completedProjects: <CheckCircle className="h-6 w-6" />,
  notStartedProjects: <Clock className="h-6 w-6" />,
  onHoldProjects: <AlertTriangle className="h-6 w-6" />,
  overdueProjects: <XCircle className="h-6 w-6" />,
  atRiskProjects: <AlertTriangle className="h-6 w-6" />,
  activeMembers: <Users className="h-6 w-6" />,
  pendingKTReports: <ClipboardList className="h-6 w-6" />,
  totalDocuments: <FileText className="h-6 w-6" />,
};

export function Dashboard() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: () => dashboardApi.getMetrics(),
  });

  const { data: projectsData } = useQuery({
    queryKey: ['dashboard-projects'],
    queryFn: () => dashboardApi.getProjects({ limit: '10' }),
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-24 bg-dbi-surface rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-80 bg-dbi-surface rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const m = metrics?.data?.metrics;
  const charts = metrics?.data?.charts;
  const alerts = metrics?.data?.alerts;
  const recentActivity = metrics?.data?.recentActivity;
  const projects = projectsData?.data?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight dbi-gradient-text">Security Center Dashboard</h1>
          <p className="text-dbi-textSecondary">Centralized Security Operations Overview</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          title="Total Projects"
          value={m?.totalProjects || 0}
          icon={metricIcons.totalProjects}
          accentColor="cyan"
          onClick={() => {}}
        />
        <MetricCard
          title="Ongoing"
          value={m?.ongoingProjects || 0}
          icon={metricIcons.ongoingProjects}
          accentColor="cyan"
          trend={{ value: 12, label: 'vs last month' }}
        />
        <MetricCard
          title="Completed"
          value={m?.completedProjects || 0}
          icon={metricIcons.completedProjects}
          accentColor="emerald"
          trend={{ value: 8, label: 'vs last month' }}
        />
        <MetricCard
          title="Overdue"
          value={m?.overdueProjects || 0}
          icon={metricIcons.overdueProjects}
          accentColor="rose"
          trend={{ value: -3, label: 'vs last month' }}
        />
        <MetricCard
          title="At Risk"
          value={m?.atRiskProjects || 0}
          icon={metricIcons.atRiskProjects}
          accentColor="amber"
          trend={{ value: 2, label: 'vs last month' }}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Not Started"
          value={m?.notStartedProjects || 0}
          icon={metricIcons.notStartedProjects}
          accentColor="slate"
        />
        <MetricCard
          title="On Hold"
          value={m?.onHoldProjects || 0}
          icon={metricIcons.onHoldProjects}
          accentColor="amber"
        />
        <MetricCard
          title="Active Members"
          value={m?.activeMembers || 0}
          icon={metricIcons.activeMembers}
          accentColor="indigo"
        />
        <MetricCard
          title="Pending KT Reports"
          value={m?.pendingKTReports || 0}
          icon={metricIcons.pendingKTReports}
          accentColor="amber"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectStatusChart data={charts?.statusDistribution || []} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team Workload</CardTitle>
          </CardHeader>
          <CardContent>
            <TeamWorkloadChart data={charts?.teamWorkload || []} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">KT Submission Rate (30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <KTSubmissionChart data={charts?.ktSubmissionRates || []} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Completion Trends</CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center text-dbi-textSecondary">
            <p>Completion trends chart placeholder</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Upcoming Deadlines</CardTitle>
            <Link to="/projects" className="text-sm text-dbi-cyan hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts?.upcomingDeadlines?.length > 0 ? (
              alerts.upcomingDeadlines.slice(0, 5).map((project: any) => (
                <Link key={project.id} to={`/projects/${project.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-dbi-elevated transition-colors">
                  <div>
                    <p className="font-medium text-dbi-textPrimary">{project.name}</p>
                    <p className="text-sm text-dbi-textSecondary">
                      Due: {formatDate(project.expectedCompletionDate)}
                    </p>
                  </div>
                  <Badge className={getPriorityColor(project.priority)}>{project.priority}</Badge>
                </Link>
              ))
            ) : (
              <p className="text-dbi-textSecondary text-center py-4">No upcoming deadlines</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Overdue Projects</CardTitle>
            <Link to="/projects" className="text-sm text-dbi-cyan hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts?.overdueProjects?.length > 0 ? (
              alerts.overdueProjects.slice(0, 5).map((project: any) => (
                <Link key={project.id} to={`/projects/${project.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-dbi-elevated transition-colors">
                  <div>
                    <p className="font-medium text-dbi-textPrimary">{project.name}</p>
                    <p className="text-sm text-dbi-textSecondary">
                      Overdue since: {formatDate(project.expectedCompletionDate)}
                    </p>
                  </div>
                  <Badge className={getPriorityColor(project.priority)}>{project.priority}</Badge>
                </Link>
              ))
            ) : (
              <p className="text-dbi-textSecondary text-center py-4">No overdue projects</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <Link to="/audit-logs" className="text-sm text-dbi-cyan hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivity?.length > 0 ? (
              recentActivity.slice(0, 5).map((activity: any) => (
                <div key={activity.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-dbi-elevated transition-colors">
                  <div className="p-2 rounded-lg bg-dbi-cyan/10">
                    <ArrowRight className="h-4 w-4 text-dbi-cyan" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dbi-textPrimary">{activity.action} {activity.resourceType}</p>
                    <p className="text-xs text-dbi-textSecondary">{activity.actor?.fullName || 'System'} • {formatDateTimeIST(activity.createdAt)}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-dbi-textSecondary text-center py-4">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Projects</CardTitle>
          <Link to="/projects" className="text-sm text-dbi-cyan hover:underline">View all</Link>
        </CardHeader>
        <CardContent>
          {projects.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dbi-border">
                    {['Project', 'Owner', 'Status', 'Priority', 'Progress', 'Deadline', 'Actions'].map((header) => (
                      <th key={header} className="text-left p-3 text-xs font-semibold text-dbi-textSecondary uppercase tracking-wider">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dbi-border">
                  {projects.slice(0, 10).map((project: any) => (
                    <tr key={project.id} className="hover:bg-dbi-elevated/50">
                      <td className="p-3">
                        <Link to={`/projects/${project.id}`} className="font-medium text-dbi-textPrimary hover:text-dbi-cyan">
                          {project.name}
                        </Link>
                      </td>
                      <td className="p-3 text-sm text-dbi-textSecondary">{project.owner?.fullName}</td>
                      <td className="p-3">
                        <Badge className={getStatusColor(project.status)}>{project.status.replace('_', ' ')}</Badge>
                      </td>
                      <td className="p-3">
                        <Badge className={getPriorityColor(project.priority)}>{project.priority}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="w-24">
                          <div className="h-2 bg-dbi-border rounded-full overflow-hidden">
                            <div
                              className="h-full bg-dbi-cyan transition-all"
                              style={{ width: `${project.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-dbi-textSecondary">{project.progress}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-dbi-textSecondary">
                        {project.expectedCompletionDate ? formatDate(project.expectedCompletionDate) : 'Not set'}
                      </td>
                      <td className="p-3">
                        <Link to={`/projects/${project.id}`} className="text-dbi-cyan hover:underline text-sm">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderKanban className="mx-auto h-12 w-12 text-dbi-textSecondary" />
              <p className="mt-2 text-dbi-textSecondary">No projects found</p>
              <Link to="/projects" className="mt-4 inline-block text-dbi-cyan hover:underline">
                Create your first project
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}