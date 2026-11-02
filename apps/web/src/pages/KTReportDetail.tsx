import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ktReportsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import { ArrowLeft, Edit, Trash2, FileText, Calendar, User, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const typeLabels: Record<string, string> = {
  SECURITY_ASSESSMENT: 'Security Assessment',
  INCIDENT_REPORT: 'Incident Report',
  COMPLIANCE_AUDIT: 'Compliance Audit',
  VULNERABILITY_SCAN: 'Vulnerability Scan',
  PENETRATION_TEST: 'Penetration Test',
  KT_SESSION: 'KT Session',
  PROJECT_HANDOVER: 'Project Handover',
  BEST_PRACTICES: 'Best Practices',
  LESSONS_LEARNED: 'Lessons Learned',
  OTHER: 'Other',
};

const statusBadges: Record<string, string> = {
  DRAFT: 'bg-slate-500/20 text-slate-300',
  SUBMITTED: 'bg-cyan-500/20 text-cyan-300',
  UNDER_REVIEW: 'bg-amber-500/20 text-amber-300',
  APPROVED: 'bg-emerald-500/20 text-emerald-300',
  REJECTED: 'bg-rose-500/20 text-rose-300',
  PUBLISHED: 'bg-indigo-500/20 text-indigo-300',
  ARCHIVED: 'bg-neutral-500/20 text-neutral-300',
};

export function KTReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['kt-report', id],
    queryFn: () => ktReportsApi.get(id!),
    enabled: !!id,
  });

  const deleteMutation = async () => {
    if (!confirm('Are you sure you want to delete this KT report? This action cannot be undone.')) return;
    try {
      await ktReportsApi.delete(id!);
      toast({ title: 'Report deleted', description: 'The KT report has been deleted successfully' });
      navigate('/kt-reports');
    } catch {
      toast({ title: 'Error', description: 'Failed to delete report', variant: 'destructive' });
    }
  };

  const report = data?.data;

  if (isLoading) {
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

  if (error || !report) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="mx-auto h-16 w-16 text-dbi-critical" />
        <h2 className="mt-4 text-2xl font-bold text-dbi-textPrimary">KT Report Not Found</h2>
        <p className="mt-2 text-dbi-textSecondary">The report you're looking for doesn't exist or has been removed.</p>
        <Button asChild className="mt-4">
          <Link to="/kt-reports"><ArrowLeft className="mr-2 h-4 w-4" />Back to KT Reports</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/kt-reports')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-dbi-textPrimary">{report.title}</h1>
            <p className="text-dbi-textSecondary">{typeLabels[report.type] || report.type}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={statusBadges[report.status] || 'bg-dbi-muted text-dbi-textSecondary'}>
            {report.status.replace('_', ' ')}
          </Badge>
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/kt-reports/${id}/edit`}>
              <Edit className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={deleteMutation} className="text-dbi-critical hover:text-dbi-critical">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-dbi-cyan/20 flex items-center justify-center">
                <FileText className="h-6 w-6 text-dbi-cyan" />
              </div>
              <div>
                <p className="text-sm text-dbi-textSecondary">Type</p>
                <p className="text-xl font-bold text-dbi-textPrimary">{typeLabels[report.type] || report.type}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-dbi-indigo/20 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-dbi-indigo" />
              </div>
              <div>
                <p className="text-sm text-dbi-textSecondary">Date</p>
                <p className="text-xl font-bold text-dbi-textPrimary">{formatDate(report.date)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-dbi-success/20 flex items-center justify-center">
                <User className="h-6 w-6 text-dbi-success" />
              </div>
              <div>
                <p className="text-sm text-dbi-textSecondary">Author</p>
                <p className="text-xl font-bold text-dbi-textPrimary">{report.author?.fullName || 'Unknown'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-dbi-warning/20 flex items-center justify-center">
                <Clock className="h-6 w-6 text-dbi-warning" />
              </div>
              <div>
                <p className="text-sm text-dbi-textSecondary">Reviewed</p>
                <p className="text-xl font-bold text-dbi-textPrimary">
                  {report.reviewedAt ? formatDate(report.reviewedAt) : 'Pending'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Content</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-invert max-w-none whitespace-pre-wrap text-dbi-textSecondary">
                {report.content}
              </div>
            </CardContent>
          </Card>

          {report.tags && report.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {report.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Project</CardTitle>
            </CardHeader>
            <CardContent>
              {report.project ? (
                <div className="space-y-3">
                  <Link to={`/projects/${report.project.id}`} className="font-medium text-dbi-cyan hover:underline">
                    {report.project.name}
                  </Link>
                  <p className="text-sm text-dbi-textSecondary">{report.project.description}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{report.project.status.replace('_', ' ')}</Badge>
                    <Badge variant="secondary">{report.project.priority}</Badge>
                  </div>
                  <p className="text-xs text-dbi-textMuted">Progress: {report.project.progress}%</p>
                </div>
              ) : (
                <p className="text-dbi-textSecondary">No associated project</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Report ID</p>
                <p className="font-mono text-sm text-dbi-textPrimary">{report.id}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Created</p>
                <p className="text-sm text-dbi-textPrimary">{formatDate(report.createdAt)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Updated</p>
                <p className="text-sm text-dbi-textPrimary">{formatDate(report.updatedAt)}</p>
              </div>
              {report.reviewedBy && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-dbi-textSecondary">Reviewed By</p>
                  <p className="text-sm text-dbi-textPrimary">{report.reviewedBy}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {report.status === 'SUBMITTED' || report.status === 'UNDER_REVIEW' ? (
            <Card className="border-dbi-warning">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-dbi-warning" />
                  Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button onClick={() => {
                  ktReportsApi.approve(id!, 'APPROVE');
                  toast({ title: 'Approved', description: 'Report has been approved' });
                  window.location.reload();
                }} className="w-full">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve
                </Button>
                <Button variant="outline" onClick={() => {
                  ktReportsApi.approve(id!, 'REJECT');
                  toast({ title: 'Rejected', description: 'Report has been rejected' });
                  window.location.reload();
                }} className="w-full">
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}