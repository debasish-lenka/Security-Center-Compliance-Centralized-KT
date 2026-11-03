import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectsApi, documentsApi, ktReportsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectWork } from '@/components/ProjectWork';
import { ProjectTeam } from '@/components/ProjectTeam';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { formatDate, getStatusColor, getPriorityColor } from '@/lib/utils';
import { Plus, Edit, Trash2, Eye, Download, ExternalLink, ArrowLeft, Users, Flag, Calendar, DollarSign, FileText, ClipboardList, AlertTriangle, CheckCircle } from 'lucide-react';
import { ProjectStartPanel } from '@/components/ProjectStartPanel';
import { ProjectDeleteDialog } from '@/components/ProjectDeleteDialog';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: projectData, isLoading: projectLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  });

  const { data: documentsData } = useQuery({
    queryKey: ['project-documents', id],
    queryFn: () => documentsApi.list({ projectId: id! }),
    enabled: !!id,
  });

  const { data: reportsData } = useQuery({
    queryKey: ['project-reports', id],
    queryFn: () => ktReportsApi.list({ projectId: id! }),
    enabled: !!id,
  });

  const project = projectData?.data;
  const documents = documentsData?.data?.items || [];
  const reports = reportsData?.data?.items || [];

  const [deleteOpen, setDeleteOpen] = useState(false);
  const { user: me } = useAuth();
  const myMembership = (project?.members ?? []).find((m: any) => m.userId === me?.id);
  const canAskDelete = me?.role === 'SUPER_ADMIN' || me?.role === 'ADMIN' || ['OWNER', 'LEAD'].includes(myMembership?.role);

  if (projectLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-dbi-elevated rounded w-1/4" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-dbi-elevated rounded-lg" />)}
        </div>
        <div className="h-64 bg-dbi-elevated rounded-lg" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="mx-auto h-16 w-16 text-dbi-critical" />
        <h2 className="mt-4 text-2xl font-bold text-dbi-textPrimary">Project Not Found</h2>
        <p className="mt-2 text-dbi-textSecondary">The project you're looking for doesn't exist or has been removed.</p>
        <Button asChild className="mt-4">
          <Link to="/projects"><ArrowLeft className="mr-2 h-4 w-4" />Back to Projects</Link>
        </Button>
      </div>
    );
  }

  const statusBadges: Record<string, string> = {
    NOT_STARTED: 'bg-slate-500/20 text-slate-300',
    ONGOING: 'bg-cyan-500/20 text-cyan-300',
    COMPLETED: 'bg-emerald-500/20 text-emerald-300',
    ON_HOLD: 'bg-amber-500/20 text-amber-300',
    OVERDUE: 'bg-rose-500/20 text-rose-300',
    AT_RISK: 'bg-orange-500/20 text-orange-300',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/projects')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-dbi-textPrimary">{project.name}</h1>
            <p className="text-dbi-textSecondary">{project.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={statusBadges[project.status] || getStatusColor(project.status)} style={{ fontSize: '0.875rem' }}>
            {project.status.replace('_', ' ')}
          </Badge>
          <Badge className={getPriorityColor(project.priority)} style={{ fontSize: '0.875rem' }}>
            {project.priority}
          </Badge>
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/projects/${id}/edit`}>
              <Edit className="h-4 w-4" />
            </Link>
          </Button>
          {canAskDelete && (
            <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)} aria-label="Delete project" className="text-dbi-critical hover:text-dbi-critical">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-dbi-cyan/20 flex items-center justify-center">
                <Users className="h-6 w-6 text-dbi-cyan" />
              </div>
              <div>
                <p className="text-sm text-dbi-textSecondary">Team Members</p>
                <p className="text-2xl font-bold text-dbi-textPrimary">
                  {(project.reviewers?.length || 0) + (project.contributors?.length || 0) + 1}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-dbi-indigo/20 flex items-center justify-center">
                <Flag className="h-6 w-6 text-dbi-indigo" />
              </div>
              <div>
                <p className="text-sm text-dbi-textSecondary">Progress</p>
                <p className="text-2xl font-bold text-dbi-textPrimary">{project.progress}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-dbi-success/20 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-dbi-success" />
              </div>
              <div>
                <p className="text-sm text-dbi-textSecondary">Deadline</p>
                <p className="text-xl font-bold text-dbi-textPrimary">
                  {project.expectedCompletionDate ? formatDate(project.expectedCompletionDate) : 'Not set'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-dbi-warning/20 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-dbi-warning" />
              </div>
              <div>
                <p className="text-sm text-dbi-textSecondary">Budget</p>
                <p className="text-2xl font-bold text-dbi-textPrimary">
                  {project.budget ? `$${project.budget.toLocaleString()}` : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Project Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <p className="text-sm text-dbi-textSecondary">Project ID</p>
              <p className="font-mono text-sm text-dbi-textPrimary">{project.id}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-dbi-textSecondary">Owner</p>
              <p className="text-sm text-dbi-textPrimary">{project.owner?.fullName}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-dbi-textSecondary">Created</p>
              <p className="text-sm text-dbi-textPrimary">{formatDate(project.createdAt)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-dbi-textSecondary">Updated</p>
              <p className="text-sm text-dbi-textPrimary">{formatDate(project.updatedAt)}</p>
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-sm text-dbi-textSecondary">Start Date</p>
              <p className="text-sm text-dbi-textPrimary">{project.startDate ? formatDate(project.startDate) : 'Not set'}</p>
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-sm text-dbi-textSecondary">Completion Date</p>
              <p className="text-sm text-dbi-textPrimary">
                {project.actualCompletionDate ? formatDate(project.actualCompletionDate) : 'In Progress'}
              </p>
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-sm text-dbi-textSecondary">Tags</p>
              <div className="flex flex-wrap gap-1">
                {project.tags?.map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
            </div>
            <div className="space-y-1 md:col-span-4">
              <p className="text-sm text-dbi-textSecondary">Budget Spent</p>
              <p className="text-sm text-dbi-textPrimary">
                {project.spent !== undefined && project.budget
                  ? `$${project.spent.toLocaleString()} (${((project.spent / project.budget) * 100).toFixed(1)}%)`
                  : 'N/A'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="work">Tasks &amp; Milestones</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="reports">KT Reports ({reports.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <ProjectStartPanel projectId={project.id} info={project.startInfo} last={project.lastUpdate} />

          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-dbi-textSecondary whitespace-pre-wrap">{project.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-dbi-textSecondary">Overall Progress</span>
                  <span className="font-medium text-dbi-textPrimary">{project.progress}%</span>
                </div>
                <Progress value={project.progress} className="h-3" />
              </div>
              {project.milestones && project.milestones.length > 0 && (
                <div className="space-y-3">
                  {project.milestones.map((milestone: any, index: number) => (
                    <div key={index} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-dbi-textSecondary">{milestone.name}</span>
                        <span className="font-medium text-dbi-textPrimary">{milestone.progress}%</span>
                      </div>
                      <Progress value={milestone.progress} className="h-2" />
                      <p className="text-xs text-dbi-textSecondary">
                        {milestone.dueDate ? `Due: ${formatDate(milestone.dueDate)}` : 'No due date'}
                        {milestone.completed ? ' • Completed' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="work" className="space-y-4">
          <ProjectWork projectId={id!} />
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          <ProjectTeam projectId={id!} />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <div className="flex items-center justify-between">
            <Card>
              <CardHeader>
                <CardTitle>Project Documents</CardTitle>
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <div className="text-center py-8 text-dbi-textSecondary">
                    <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No documents uploaded yet</p>
                    <Button asChild className="mt-4" variant="outline">
                      <Link to={`/documents?projectId=${id}`}>
                        <Plus className="mr-2 h-4 w-4" />
                        Upload Document
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Uploaded By</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {documents.map((doc: any) => (
                          <TableRow key={doc.id}>
                            <TableCell className="font-medium">{doc.name}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">{doc.type.toUpperCase()}</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-dbi-textSecondary">
                              {(doc.size / 1024).toFixed(1)} KB
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={getStatusColor(doc.status)}>
                                {doc.status.replace('_', ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-dbi-textSecondary">{doc.uploadedBy?.fullName}</TableCell>
                            <TableCell className="text-sm text-dbi-textSecondary">{formatDate(doc.createdAt)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" asChild>
                                  <a href={doc.url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </Button>
                                <Button variant="ghost" size="icon" asChild>
                                  <a href={doc.url} download>
                                    <Download className="h-4 w-4" />
                                  </a>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Knowledge Transfer Reports</CardTitle>
              <Button asChild variant="outline" size="sm">
                <Link to={`/kt-reports/new?projectId=${id}`}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Report
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {reports.length === 0 ? (
                <div className="text-center py-8 text-dbi-textSecondary">
                  <ClipboardList className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>No KT reports submitted yet</p>
                  <Button asChild className="mt-4" variant="outline">
                    <Link to={`/kt-reports/new?projectId=${id}`}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create First Report
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Author</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reports.map((report: any) => (
                        <TableRow key={report.id}>
                          <TableCell>
                            <Link to={`/kt-reports/${report.id}`} className="font-medium text-dbi-textPrimary hover:text-dbi-cyan">
                              {report.title}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">{report.type.replace('_', ' ')}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-dbi-textSecondary">{report.author?.fullName}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={getStatusColor(report.status)}>
                              {report.status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-dbi-textSecondary">{formatDate(report.createdAt)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" asChild>
                              <Link to={`/kt-reports/${report.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 bg-dbi-elevated/50 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-dbi-success mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-dbi-textPrimary">Project created</p>
                    <p className="text-xs text-dbi-textSecondary">{formatDate(project.createdAt)}</p>
                  </div>
                </div>
                {project.milestones && project.milestones.map((m: any, i: number) => m.completed && (
                  <div key={i} className="flex items-start gap-3 p-3 bg-dbi-elevated/50 rounded-lg">
                    <Flag className="h-5 w-5 text-dbi-warning mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-dbi-textPrimary">Milestone completed: {m.name}</p>
                      <p className="text-xs text-dbi-textSecondary">{m.dueDate ? formatDate(m.dueDate) : 'No due date'}</p>
                    </div>
                  </div>
                ))}
                {documents.slice(0, 3).map((doc: any) => (
                  <div key={doc.id} className="flex items-start gap-3 p-3 bg-dbi-elevated/50 rounded-lg">
                    <FileText className="h-5 w-5 text-dbi-indigo mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-dbi-textPrimary">Document uploaded: {doc.name}</p>
                      <p className="text-xs text-dbi-textSecondary">By {doc.uploadedBy?.fullName} • {formatDate(doc.createdAt)}</p>
                    </div>
                  </div>
                ))}
                {reports.slice(0, 3).map((report: any) => (
                  <div key={report.id} className="flex items-start gap-3 p-3 bg-dbi-elevated/50 rounded-lg">
                    <ClipboardList className="h-5 w-5 text-dbi-cyan mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-dbi-textPrimary">KT report submitted: {report.title}</p>
                      <p className="text-xs text-dbi-textSecondary">By {report.author?.fullName} • {formatDate(report.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {project && (
        <ProjectDeleteDialog
          project={{ id: project.id, name: project.name }}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDone={() => navigate('/projects')}
        />
      )}
    </div>
  );
}