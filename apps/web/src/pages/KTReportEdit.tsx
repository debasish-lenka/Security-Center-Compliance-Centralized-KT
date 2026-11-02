import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ktReportsApi, projectsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const typeOptions = ['SECURITY_ASSESSMENT', 'INCIDENT_REPORT', 'COMPLIANCE_AUDIT', 'VULNERABILITY_SCAN', 'PENETRATION_TEST', 'KT_SESSION', 'PROJECT_HANDOVER', 'BEST_PRACTICES', 'LESSONS_LEARNED', 'OTHER'];
const statusOptions = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED'];

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

export function KTReportEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    title: '',
    type: 'KT_SESSION',
    projectId: '',
    content: '',
    tags: '',
    date: '',
    status: 'DRAFT',
  });

  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ['kt-report', id],
    queryFn: () => ktReportsApi.get(id!),
    enabled: !!id,
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects-for-select'],
    queryFn: () => projectsApi.list({ limit: '100' }),
  });

  const projects = projectsData?.data?.items || [];

  useEffect(() => {
    if (reportData?.data) {
      const r = reportData.data;
      setFormData({
        title: r.title || '',
        type: r.type || 'KT_SESSION',
        projectId: r.project?.id || '',
        content: r.content || '',
        tags: r.tags?.join(', ') || '',
        date: r.date || '',
        status: r.status || 'DRAFT',
      });
    }
  }, [reportData]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => ktReportsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kt-reports'] });
      queryClient.invalidateQueries({ queryKey: ['kt-report', id] });
      toast({ title: 'Success', description: 'KT Report updated successfully' });
      navigate(`/kt-reports/${id}`);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update report', variant: 'destructive' });
    },
  });

  if (reportLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-dbi-elevated rounded w-1/4" />
        <div className="h-64 bg-dbi-elevated rounded-lg" />
      </div>
    );
  }

  const report = reportData?.data;

  if (!report) {
    return (
      <div className="text-center py-12">
        <p className="text-dbi-critical">KT Report Not Found</p>
        <Button asChild className="mt-4">
          <a href="/kt-reports"><ArrowLeft className="mr-2 h-4 w-4" />Back to KT Reports</a>
        </Button>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
    };
    updateMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/kt-reports/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">Edit KT Report</h1>
          <p className="text-dbi-textSecondary">Update report details</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge className={statusBadges[report.status] || 'bg-dbi-muted text-dbi-textSecondary'}>
            {report.status.replace('_', ' ')}
          </Badge>
          <Badge variant="secondary">{typeLabels[report.type] || report.type}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report Information</CardTitle>
          <CardDescription>Update the report details</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter report title"
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="type">Type *</Label>
                <Select value={formData.type} onValueChange={v => setFormData(prev => ({ ...prev, type: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map(t => <SelectItem key={t} value={t}>{typeLabels[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="status">Status *</Label>
                <Select value={formData.status} onValueChange={v => setFormData(prev => ({ ...prev, status: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="projectId">Project</Label>
                <Select value={formData.projectId} onValueChange={v => setFormData(prev => ({ ...prev, projectId: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select project (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {projects.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  required
                  className="mt-1"
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="content">Content *</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={e => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Enter the report content, findings, observations, etc."
                  rows={8}
                  required
                  className="mt-1"
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="tags">Tags (comma separated)</Label>
                <Input
                  id="tags"
                  value={formData.tags}
                  onChange={e => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="security, findings, recommendations, quarterly"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => navigate(`/kt-reports/${id}`)}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}