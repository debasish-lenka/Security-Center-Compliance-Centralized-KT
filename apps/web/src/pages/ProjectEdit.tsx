import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, usersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, X, AlertTriangle } from 'lucide-react';
import { getStatusColor, getPriorityColor } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

const statusOptions = ['NOT_STARTED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'OVERDUE', 'AT_RISK'];
const priorityOptions = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const statusBadges: Record<string, string> = {
  NOT_STARTED: 'bg-slate-500/20 text-slate-300',
  ONGOING: 'bg-cyan-500/20 text-cyan-300',
  COMPLETED: 'bg-emerald-500/20 text-emerald-300',
  ON_HOLD: 'bg-amber-500/20 text-amber-300',
  OVERDUE: 'bg-rose-500/20 text-rose-300',
  AT_RISK: 'bg-orange-500/20 text-orange-300',
};

export function ProjectEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    ownerId: '',
    reviewerId: '',
    startDate: '',
    expectedCompletionDate: '',
    actualCompletionDate: '',
    priority: 'MEDIUM',
    status: 'NOT_STARTED',
    progress: '0',
    tags: '',
    budget: '',
    spent: '',
  });

  const { data: projectData, isLoading: projectLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-for-select'],
    queryFn: () => usersApi.list({ status: 'ACTIVE', limit: '100' }),
  });

  const users = usersData?.data?.items || [];

  useEffect(() => {
    if (projectData?.data) {
      const p = projectData.data;
      setFormData({
        name: p.name || '',
        description: p.description || '',
        category: p.category || '',
        ownerId: p.owner?.id || '',
        reviewerId: p.reviewer?.id || '',
        startDate: p.startDate ? p.startDate.split('T')[0] : '',
        expectedCompletionDate: p.expectedCompletionDate ? p.expectedCompletionDate.split('T')[0] : '',
        actualCompletionDate: p.actualCompletionDate ? p.actualCompletionDate.split('T')[0] : '',
        priority: p.priority || 'MEDIUM',
        status: p.status || 'NOT_STARTED',
        progress: (p.progress || 0).toString(),
        tags: p.tags?.join(', ') || '',
        budget: p.budget?.toString() || '',
        spent: p.spent?.toString() || '',
      });
    }
  }, [projectData]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => projectsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      toast({ title: 'Success', description: 'Project updated successfully' });
      navigate(`/projects/${id}`);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update project', variant: 'destructive' });
    },
  });

  if (projectLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-dbi-elevated rounded w-1/4" />
        <div className="h-64 bg-dbi-elevated rounded-lg" />
      </div>
    );
  }

  const project = projectData?.data;

  if (!project) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="mx-auto h-16 w-16 text-dbi-critical" />
        <h2 className="mt-4 text-2xl font-bold text-dbi-textPrimary">Project Not Found</h2>
        <p className="mt-2 text-dbi-textSecondary">The project you're looking for doesn't exist.</p>
        <Button asChild className="mt-4">
          <a href="/projects"><ArrowLeft className="mr-2 h-4 w-4" />Back to Projects</a>
        </Button>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      startDate: formData.startDate || null,
      expectedCompletionDate: formData.expectedCompletionDate || null,
      actualCompletionDate: formData.actualCompletionDate || null,
      budget: formData.budget ? parseFloat(formData.budget) : null,
      spent: formData.spent ? parseFloat(formData.spent) : null,
      progress: parseInt(formData.progress.toString(), 10) || 0,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
    };
    updateMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/projects/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">Edit Project</h1>
          <p className="text-dbi-textSecondary">Update project details</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge className={statusBadges[project.status] || getStatusColor(project.status)}>
            {project.status.replace('_', ' ')}
          </Badge>
          <Badge className={getPriorityColor(project.priority)}>
            {project.priority}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Project Information</CardTitle>
          <CardDescription>Update the project details</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="name">Project Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter project name"
                  required
                  className="mt-1"
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the project scope and objectives"
                  rows={4}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="e.g., Security Audit, Compliance, Penetration Testing"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="priority">Priority *</Label>
                <Select value={formData.priority} onValueChange={v => setFormData(prev => ({ ...prev, priority: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
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
                <Label htmlFor="ownerId">Project Owner (Lead) *</Label>
                <Select value={formData.ownerId} onValueChange={v => setFormData(prev => ({ ...prev, ownerId: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{u.fullName} ({u.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="reviewerId">Reviewer</Label>
                <Select value={formData.reviewerId || '__none__'} onValueChange={v => setFormData(prev => ({ ...prev, reviewerId: v === '__none__' ? '' : v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select reviewer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {users.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{u.fullName} ({u.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="progress">Progress (%)</Label>
                <Input
                  id="progress"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.progress}
                  onChange={e => setFormData(prev => ({ ...prev, progress: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={e => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="expectedCompletionDate">Expected Completion Date</Label>
                <Input
                  id="expectedCompletionDate"
                  type="date"
                  value={formData.expectedCompletionDate}
                  onChange={e => setFormData(prev => ({ ...prev, expectedCompletionDate: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="actualCompletionDate">Actual Completion Date</Label>
                <Input
                  id="actualCompletionDate"
                  type="date"
                  value={formData.actualCompletionDate}
                  onChange={e => setFormData(prev => ({ ...prev, actualCompletionDate: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="budget">Budget ($)</Label>
                <Input
                  id="budget"
                  type="number"
                  step="0.01"
                  value={formData.budget}
                  onChange={e => setFormData(prev => ({ ...prev, budget: e.target.value }))}
                  placeholder="0.00"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="spent">Spent ($)</Label>
                <Input
                  id="spent"
                  type="number"
                  step="0.01"
                  value={formData.spent}
                  onChange={e => setFormData(prev => ({ ...prev, spent: e.target.value }))}
                  placeholder="0.00"
                  className="mt-1"
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="tags">Tags (comma separated)</Label>
                <Input
                  id="tags"
                  value={formData.tags}
                  onChange={e => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="security, audit, compliance, quarterly"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => navigate(`/projects/${id}`)}>
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