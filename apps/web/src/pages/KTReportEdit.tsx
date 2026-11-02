import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ktReportsApi, projectsApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { KTReportForm, type KTReportValues } from '@/components/KTReportForm';

export function KTReportEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: report, isLoading } = useQuery({
    queryKey: ['kt-report', id],
    queryFn: async () => (await ktReportsApi.get(id!)).data?.data,
  });
  const { data: projectsData } = useQuery({
    queryKey: ['projects-for-select'],
    queryFn: () => projectsApi.list({ limit: '100' }),
  });
  const projects = projectsData?.data?.items || [];

  const updateMutation = useMutation({
    mutationFn: ({ values, status }: { values: KTReportValues; status: 'DRAFT' | 'SUBMITTED' }) =>
      ktReportsApi.update(id!, {
        workCompleted: values.workCompleted,
        detailedWork: values.detailedWork,
        completedTasks: values.completedTasks,
        pendingTasks: values.pendingTasks,
        challenges: values.challenges,
        nextDayPlan: values.nextDayPlan,
        status,
      }),
    onSuccess: (_res, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['kt-reports'] });
      queryClient.invalidateQueries({ queryKey: ['kt-report', id] });
      toast({ title: status === 'SUBMITTED' ? 'Report submitted' : 'Draft saved' });
      navigate(`/kt-reports/${id}`);
    },
    onError: (e: any) => {
      toast({ title: 'Could not save', description: e?.response?.data?.error?.message || 'Please try again', variant: 'destructive' });
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-dbi-cyan" /></div>;
  }
  if (!report) {
    return <p className="text-dbi-textSecondary">This report was not found, or you do not have access to it.</p>;
  }

  const initial: KTReportValues = {
    projectId: report.projectId,
    reportDate: String(report.reportDate).slice(0, 10),
    workCompleted: report.workCompleted ?? '',
    detailedWork: report.detailedWork ?? '',
    completedTasks: report.completedTasks ?? '',
    pendingTasks: report.pendingTasks ?? '',
    challenges: report.challenges ?? '',
    nextDayPlan: report.nextDayPlan ?? '',
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/kt-reports/${id}`)} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight dbi-gradient-text">Edit KT Report</h1>
          <p className="text-dbi-textSecondary">{report.title}</p>
        </div>
      </div>
      <KTReportForm
        initial={initial}
        projects={projects.length ? projects : report.project ? [report.project] : []}
        lockProject
        lockDate
        saving={updateMutation.isPending}
        onSave={(values, status) => updateMutation.mutate({ values, status })}
        onCancel={() => navigate(`/kt-reports/${id}`)}
      />
    </div>
  );
}
