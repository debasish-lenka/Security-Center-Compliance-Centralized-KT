import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ktReportsApi, projectsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const typeOptions = ['SECURITY_ASSESSMENT', 'INCIDENT_REPORT', 'COMPLIANCE_AUDIT', 'VULNERABILITY_SCAN', 'PENETRATION_TEST', 'KT_SESSION', 'PROJECT_HANDOVER', 'BEST_PRACTICES', 'LESSONS_LEARNED', 'OTHER'];

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

export function KTReportCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const projectId = searchParams.get('projectId');

  const [formData, setFormData] = useState({
    title: '',
    type: 'KT_SESSION',
    projectId: projectId || '',
    content: '',
    tags: '',
    date: new Date().toISOString().split('T')[0],
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects-for-select'],
    queryFn: () => projectsApi.list({ limit: '100' }),
  });

  const projects = projectsData?.data?.items || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => ktReportsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kt-reports'] });
      toast({ title: 'Success', description: 'KT Report created successfully' });
      navigate('/kt-reports');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create report', variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (projectId) {
      setFormData(prev => ({ ...prev, projectId }));
    }
  }, [projectId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
    };
    createMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/kt-reports')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">New KT Report</h1>
          <p className="text-dbi-textSecondary">Create a new Knowledge Transfer report</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report Information</CardTitle>
          <CardDescription>Fill in the details to create a new KT report</CardDescription>
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
              <Button type="button" variant="outline" onClick={() => navigate('/kt-reports')}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {createMutation.isPending ? 'Creating...' : 'Create Report'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}