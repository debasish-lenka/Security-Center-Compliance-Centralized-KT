import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Filter, Calendar, AlertTriangle, Clock, FileText, CheckCircle, ChevronRight, Shield, Activity, FolderKanban } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate, formatDateTimeIST } from '@/lib/utils';
import { assignmentsApi, projectsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { TaskDialog } from '@/components/TaskDialog';
import { DeleteApprovalsPanel } from '@/components/DeleteApprovalsPanel';
import { ProjectDeleteApprovals } from '@/components/ProjectDeleteApprovals';
import { ProjectStartPanel } from '@/components/ProjectStartPanel';
import { PriorityLegend } from '@/components/PriorityLegend';
import { priorityRank, priorityStyle } from '@/lib/priority-style';

export function Assignments() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [taskOpen, setTaskOpen] = useState(false);
  const { data: projectsData } = useQuery({
    queryKey: ['projects-for-task'],
    queryFn: () => projectsApi.list({ limit: '100' }),
  });
  const { data: myProjectsData } = useQuery({
    queryKey: ['assignments-projects'],
    queryFn: () => assignmentsApi.getMyProjects(),
  });

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['assignments-tasks'],
    queryFn: () => assignmentsApi.getMyTasks(),
  });

  const { data: ktReportsData } = useQuery({
    queryKey: ['assignments-kt-reports'],
    queryFn: () => assignmentsApi.getMyKTReports(),
  });

  const { data: docReviewsData } = useQuery({
    queryKey: ['assignments-doc-reviews'],
    queryFn: () => assignmentsApi.getMyDocumentReviews(),
  });

  const { data: complianceActionsData } = useQuery({
    queryKey: ['assignments-compliance-actions'],
    queryFn: () => assignmentsApi.getMyComplianceActions(),
  });

  const { data: activityData } = useQuery({
    queryKey: ['assignments-activity'],
    queryFn: () => assignmentsApi.getPersonalActivity({ limit: '10' }),
  });

  const tasks = tasksData?.data?.items || [];
  // the ones I still have to start first, then the most severe
  const myProjects: any[] = [...(myProjectsData?.data?.items || [])].sort((a: any, b: any) => Number(b.mustStart) - Number(a.mustStart) || priorityRank(a.priority) - priorityRank(b.priority));
  const toStart = myProjects.filter((p) => p.mustStart).length;

  const getPriorityBadgeVariant = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return 'destructive';
      case 'HIGH': return 'default';
      case 'MEDIUM': return 'secondary';
      case 'LOW': return 'outline';
      default: return 'secondary';
    }
  };
  const ktReports = ktReportsData?.data?.items || [];
  const docReviews = docReviewsData?.data?.items || [];
  const complianceActions = complianceActionsData?.data?.items || [];
  const activity = activityData?.data?.items || [];

  // Calculate stats
  const tasksAssigned = tasks.length;
  const dueThisWeek = tasks.filter((t: any) => {
    const due = new Date(t.dueDate);
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return due >= now && due <= weekFromNow && t.status !== 'DONE';
  }).length;
  const blockers = tasks.filter((t: any) => t.blockedBy).length;
  const ktReportsDue = ktReports.filter((r: any) => r.status !== 'APPROVED' && r.status !== 'SUBMITTED').length;

  const taskColumns = [
    { title: 'To Do', status: 'TODO' as const, color: 'bg-dbi-muted', icon: FileText },
    { title: 'In Progress', status: 'IN_PROGRESS' as const, color: 'bg-dbi-cyan/20', icon: FileText },
    { title: 'Blocked', status: 'BLOCKED' as const, color: 'bg-dbi-critical/20', icon: AlertTriangle },
    { title: 'Done', status: 'DONE' as const, color: 'bg-dbi-emerald/20', icon: CheckCircle },
  ];

  if (tasksLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-dbi-surface rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="h-80 bg-dbi-surface rounded-lg" />
          <div className="h-80 bg-dbi-surface rounded-lg" />
          <div className="h-80 bg-dbi-surface rounded-lg" />
          <div className="h-80 bg-dbi-surface rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight dbi-gradient-text">My Assignments</h1>
          <p className="text-dbi-textSecondary">Your tasks, KT reports, and action items</p>
        </div>
        <Button onClick={() => setTaskOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Task
        </Button>
        <TaskDialog
          open={taskOpen}
          onOpenChange={setTaskOpen}
          projects={projectsData?.data?.items ?? []}
          defaultAssigneeId={user?.id}
          onCreated={() => queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('assignments') })}
        />
      </div>

      <DeleteApprovalsPanel />
      <ProjectDeleteApprovals />

      {/* The projects I am on: the ones I still have to start come first */}
      {myProjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderKanban className="h-5 w-5 text-dbi-cyan" /> My Projects ({myProjects.length})
              {toStart > 0 && <Badge className="bg-dbi-amber/15 text-dbi-amber">{toStart} to start</Badge>}
            </CardTitle>
            <PriorityLegend />
          </CardHeader>
          <CardContent className="space-y-3">
            {myProjects.map((p: any) => (
              <div key={p.id} className={`space-y-2 rounded-lg p-3 ${priorityStyle(p.priority).card}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link to={`/projects/${p.id}`} className="font-medium text-dbi-textPrimary hover:text-dbi-cyan">{p.name}</Link>
                  <div className="flex items-center gap-2">
                    <Badge className={priorityStyle(p.priority).badge}>{p.priority}</Badge>
                    <Badge variant="secondary">{p.role}</Badge>
                    <Badge variant="outline">{String(p.status).replace(/_/g, ' ')}</Badge>
                    <span className="w-10 text-right text-xs font-medium text-dbi-textPrimary">{p.progress ?? 0}%</span>
                  </div>
                </div>
                <ProjectStartPanel projectId={p.id} info={p.startInfo} last={p.lastUpdate} compact={!p.mustStart} chips={!p.mustStart && p.role !== 'Contributor' && p.role !== 'Reviewer'} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}


      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dbi-textSecondary">Tasks Assigned</p>
                <p className="text-3xl font-bold text-dbi-textPrimary">{tasksAssigned}</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-dbi-cyan/20 flex items-center justify-center">
                <FileText className="h-6 w-6 text-dbi-cyan" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dbi-textSecondary">Due This Week</p>
                <p className="text-3xl font-bold text-dbi-textPrimary">{dueThisWeek}</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-dbi-amber/20 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-dbi-amber" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dbi-textSecondary">Blockers</p>
                <p className="text-3xl font-bold text-dbi-critical">{blockers}</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-dbi-critical/20 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-dbi-critical" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dbi-textSecondary">KT Reports Due</p>
                <p className="text-3xl font-bold text-dbi-textPrimary">{ktReportsDue}</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-dbi-emerald/20 flex items-center justify-center">
                <Clock className="h-6 w-6 text-dbi-emerald" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task Board */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Task Board</CardTitle>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input placeholder="Filter tasks..." className="min-w-0 flex-1 bg-dbi-elevated border-dbi-border sm:w-64 sm:flex-none" />
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {taskColumns.map((column) => (
              <div key={column.title} className="bg-dbi-elevated/50 rounded-lg p-4 min-h-[400px]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${column.color}`}>
                      <column.icon className="h-4 w-4 text-dbi-textSecondary" />
                    </div>
                    <h3 className="font-medium text-dbi-textPrimary">{column.title}</h3>
                  </div>
                  <Badge variant="secondary">
                    {tasks.filter((t: any) => t.status === column.status).length}
                  </Badge>
                </div>
                <div className="space-y-2 min-h-[300px]">
                  {tasks.filter((t: any) => t.status === column.status).map((task: any) => (
                    <div
                      key={task.id}
                      className="p-3 bg-dbi-background border border-dbi-border rounded-lg hover:border-dbi-cyan/30 transition-colors cursor-pointer"
                    >
                      <p className="font-medium text-dbi-textPrimary truncate">{task.title}</p>
                      <p className="text-xs text-dbi-textSecondary mt-1 truncate">{task.projectName}</p>
                      <div className="flex items-center justify-between mt-2">
                        <Badge variant={getPriorityBadgeVariant(task.priority)} className="text-xs">
                          {task.priority}
                        </Badge>
                        <span className="text-xs text-dbi-textMuted">
                          Due: {formatDate(task.dueDate)}
                        </span>
                      </div>
                      {task.blockedBy && (
                        <div className="mt-2 p-2 bg-dbi-critical/10 border border-dbi-critical/20 rounded text-xs text-dbi-critical">
                          Blocked: {task.blockedBy}
                        </div>
                      )}
                    </div>
                  ))}
                  {tasks.filter((t: any) => t.status === column.status).length === 0 && (
                    <div className="text-center py-8 text-dbi-textMuted text-sm">
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Due This Week & KT Reports Due */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-dbi-amber" />
              Due This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tasks
                .filter((t: any) => {
                  const due = new Date(t.dueDate);
                  const now = new Date();
                  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                  return due >= now && due <= weekFromNow && t.status !== 'DONE';
                })
                .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                .slice(0, 10)
                .map((task: any) => (
                  <div key={task.id} className="flex items-center justify-between p-3 bg-dbi-elevated/50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-dbi-textPrimary truncate">{task.title}</p>
                      <p className="text-sm text-dbi-textSecondary">{task.projectName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={getPriorityBadgeVariant(task.priority)}>
                        {task.priority}
                      </Badge>
                      <span className="text-sm text-dbi-textSecondary whitespace-nowrap">
                        {formatDate(task.dueDate)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-dbi-textMuted" />
                    </div>
                  </div>
                ))}
              {tasks.filter((t: any) => {
                const due = new Date(t.dueDate);
                const now = new Date();
                const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                return due >= now && due <= weekFromNow && t.status !== 'DONE';
              }).length === 0 && (
                <p className="text-dbi-textSecondary text-center py-4">No tasks due this week</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-dbi-emerald" />
              KT Reports Due
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ktReports
                .filter((r: any) => r.status !== 'APPROVED' && r.status !== 'SUBMITTED')
                .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                .map((report: any) => (
                  <div key={report.id} className="flex items-center justify-between p-3 bg-dbi-elevated/50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-dbi-textPrimary truncate">{report.title}</p>
                      <p className="text-sm text-dbi-textSecondary">{report.projectName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{report.status}</Badge>
                      <span className="text-sm text-dbi-textSecondary whitespace-nowrap">{formatDate(report.dueDate)}</span>
                      <ChevronRight className="h-4 w-4 text-dbi-textMuted" />
                    </div>
                  </div>
                ))}
              {ktReports.filter((r: any) => r.status !== 'APPROVED' && r.status !== 'SUBMITTED').length === 0 && (
                <p className="text-dbi-textSecondary text-center py-4">No KT reports due</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Document Reviews & Compliance Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-dbi-indigo" />
              Document Reviews
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {docReviews.slice(0, 5).map((review: any) => (
                <div key={review.id} className="flex items-center justify-between p-3 bg-dbi-elevated/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dbi-textPrimary truncate">{review.name}</p>
                    <p className="text-sm text-dbi-textSecondary">{review.projectName} • Requested by {review.requestedBy}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={review.status === 'IN_REVIEW' ? 'default' : 'outline'}>{review.status}</Badge>
                    <span className="text-sm text-dbi-textSecondary whitespace-nowrap">Due: {formatDate(review.dueDate)}</span>
                    <ChevronRight className="h-4 w-4 text-dbi-textMuted" />
                  </div>
                </div>
              ))}
              {docReviews.length === 0 && (
                <p className="text-dbi-textSecondary text-center py-4">No document reviews</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-dbi-emerald" />
              Compliance Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {complianceActions.slice(0, 5).map((action: any) => (
                <div key={action.id} className="flex items-center justify-between p-3 bg-dbi-elevated/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dbi-textPrimary truncate">{action.controlName}</p>
                    <p className="text-sm text-dbi-textSecondary">{action.framework} • {action.action}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={action.status === 'IN_PROGRESS' ? 'default' : action.status === 'PENDING' ? 'outline' : 'secondary'}>{action.status}</Badge>
                    <span className="text-sm text-dbi-textSecondary whitespace-nowrap">Due: {formatDate(action.dueDate)}</span>
                    <ChevronRight className="h-4 w-4 text-dbi-textMuted" />
                  </div>
                </div>
              ))}
              {complianceActions.length === 0 && (
                <p className="text-dbi-textSecondary text-center py-4">No compliance actions</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Blockers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-dbi-critical" />
            Blockers & Dependencies
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tasks.filter((t: any) => t.blockedBy).map((task: any) => (
              <div key={task.id} className="p-4 bg-dbi-critical/10 border border-dbi-critical/20 rounded-lg">
                <p className="font-medium text-dbi-textPrimary">{task.title}</p>
                <p className="text-sm text-dbi-textSecondary mt-1">{task.blockedBy}</p>
                <p className="text-xs text-dbi-textMuted mt-2">Project: {task.projectName} • Due: {formatDate(task.dueDate)}</p>
              </div>
            ))}
            {tasks.filter((t: any) => t.blockedBy).length === 0 && (
              <div className="text-center py-8">
                <CheckCircle className="mx-auto h-12 w-12 text-dbi-emerald mb-2" />
                <p className="text-dbi-textSecondary">No blockers - great job!</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Personal Activity Timeline */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-dbi-cyan" />
            Personal Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {activity.slice(0, 10).map((item: any, index: number) => (
              <div key={item.id} className="flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <div className="h-2 w-2 rounded-full bg-dbi-cyan mt-2" />
                  {index < activity.length - 1 && (
                    <div className="absolute left-0.5 top-4 bottom-0 w-0.5 bg-dbi-border" />
                  )}
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <p className="font-medium text-dbi-textPrimary">{item.action} {item.resourceType}: {item.resourceName}</p>
                  <p className="text-sm text-dbi-textSecondary">{item.projectName} • {formatDateTimeIST(item.timestamp)}</p>
                </div>
              </div>
            ))}
            {activity.length === 0 && (
              <p className="text-dbi-textSecondary text-center py-4">No recent activity</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}