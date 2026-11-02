import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ktReportsApi, projectsApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { KTReportForm, emptyKTReport, type KTReportValues } from '@/components/KTReportForm';

export function KTReportCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const presetProject = params.get('projectId') || '';

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ['projects-for-select'],
    queryFn: () => projectsApi.list({ limit: '100' }),
  });
  const projects = projectsData?.data?.items || [];

  const createMutation = useMutation({
    mutationFn: ({ values, status }: { values: KTReportValues; status: 'DRAFT' | 'SUBMITTED' }) =>
      ktReportsApi.create({ ...values, status }),
    onSuccess: (res, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['kt-reports'] });
      toast({ title: status === 'SUBMITTED' ? 'Report submitted' : 'Draft saved' });
      const id = res.data?.data?.id;
      navigate(id ? `/kt-reports/${id}` : '/kt-reports');
    },
    onError: (e: any) => {
      toast({ title: 'Could not save', description: e?.response?.data?.error?.message || 'Please check the form and try again', variant: 'destructive' });
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/kt-reports')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight dbi-gradient-text">New KT Report</h1>
          <p className="text-dbi-textSecondary">Record today's work so the team can pick it up.</p>
        </div>
      </div>

      {/* key: re-create the form once the project list has loaded so the preset project is selected */}
      <KTReportForm
        key={isLoading ? 'loading' : 'ready'}
        initial={emptyKTReport(presetProject)}
        projects={projects}
        saving={createMutation.isPending}
        onSave={(values, status) => createMutation.mutate({ values, status })}
        onCancel={() => navigate('/kt-reports')}
      />
    </div>
  );
}
