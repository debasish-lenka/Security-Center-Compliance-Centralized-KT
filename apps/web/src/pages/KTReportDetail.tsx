import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Edit, Loader2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ktReportsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { formatDate, getStatusColor } from '@/lib/utils';

const SECTIONS: [string, string][] = [
  ['workCompleted', 'Work completed'],
  ['detailedWork', 'Detailed work'],
  ['completedTasks', 'Completed tasks'],
  ['pendingTasks', 'Pending tasks'],
  ['challenges', 'Challenges / blockers'],
  ['nextDayPlan', "Next day's plan"],
];

export function KTReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: report, isLoading } = useQuery({
    queryKey: ['kt-report', id],
    queryFn: async () => (await ktReportsApi.get(id!)).data?.data,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['kt-reports'] });
    queryClient.invalidateQueries({ queryKey: ['kt-report', id] });
  };
  const fail = (e: any) =>
    toast({ title: 'Error', description: e?.response?.data?.error?.message || 'Something went wrong', variant: 'destructive' });

  const reviewMutation = useMutation({
    mutationFn: async (action: 'APPROVE' | 'REJECT') => { await ktReportsApi.approve(id!, action); },
    onSuccess: (_r, action) => { refresh(); toast({ title: action === 'APPROVE' ? 'Report approved' : 'Report rejected' }); },
    onError: fail,
  });
  const deleteMutation = useMutation({
    mutationFn: async () => { await ktReportsApi.delete(id!); },
    onSuccess: () => { refresh(); toast({ title: 'Report deleted' }); navigate('/kt-reports'); },
    onError: fail,
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-dbi-cyan" /></div>;
  }
  if (!report) {
    return <p className="text-dbi-textSecondary">This report was not found, or you do not have access to it.</p>;
  }

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const isAuthor = report.userId === user?.id;
  const canEdit = isAdmin || (isAuthor && ['DRAFT', 'REJECTED'].includes(report.status));
  const canDelete = isAdmin || (isAuthor && report.status === 'DRAFT');
  const canReview = isAdmin && report.status === 'SUBMITTED';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/kt-reports')} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight dbi-gradient-text">{report.title}</h1>
            <p className="text-dbi-textSecondary">
              {report.project ? <Link className="text-dbi-cyan hover:underline" to={`/projects/${report.project.id}`}>{report.project.name}</Link> : 'Project'}
              {' · '}{report.author?.fullName ?? 'Unknown'}
            </p>
          </div>
        </div>
        <Badge className={getStatusColor(report.status)}>{String(report.status).replace(/_/g, ' ')}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Button variant="outline" asChild>
            <Link to={`/kt-reports/${id}/edit`}><Edit className="mr-2 h-4 w-4" /> Edit</Link>
          </Button>
        )}
        {canReview && (
          <>
            <Button onClick={() => reviewMutation.mutate('APPROVE')} disabled={reviewMutation.isPending}>
              <Check className="mr-2 h-4 w-4" /> Approve
            </Button>
            <Button variant="outline" onClick={() => reviewMutation.mutate('REJECT')} disabled={reviewMutation.isPending}>
              <X className="mr-2 h-4 w-4" /> Reject
            </Button>
          </>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            className="text-dbi-critical hover:text-dbi-critical"
            onClick={() => { if (confirm('Delete this report?')) deleteMutation.mutate(); }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="grid gap-4 p-5 text-sm sm:grid-cols-3">
          <div><p className="text-dbi-textSecondary">Report date</p><p className="font-medium text-dbi-textPrimary">{formatDate(report.reportDate)}</p></div>
          <div><p className="text-dbi-textSecondary">Submitted</p><p className="font-medium text-dbi-textPrimary">{report.submittedAt ? formatDate(report.submittedAt) : 'Not yet'}</p></div>
          <div>
            <p className="text-dbi-textSecondary">Reviewed</p>
            <p className="font-medium text-dbi-textPrimary">
              {report.approvedAt ? `${formatDate(report.approvedAt)}${report.approver?.fullName ? ` by ${report.approver.fullName}` : ''}` : 'Not yet'}
            </p>
          </div>
        </CardContent>
      </Card>

      {SECTIONS.map(([key, label]) =>
        report[key] ? (
          <Card key={key}>
            <CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader>
            <CardContent><p className="whitespace-pre-wrap text-sm text-dbi-textPrimary">{report[key]}</p></CardContent>
          </Card>
        ) : null
      )}
    </div>
  );
}
