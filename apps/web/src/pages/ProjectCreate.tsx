import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, usersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const priorityOptions = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function ProjectCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    ownerId: '',
    managerId: 'none',
    startDate: '',
    expectedCompletionDate: '',
    priority: 'MEDIUM',
    tags: '',
    budget: '',
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-for-select'],
    // the directory is open to every signed-in user, unlike the admin-only user list
    queryFn: () => usersApi.directory({ limit: '200' }),
  });

  const users = usersData?.data?.items || [];
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const toggleMember = (id: string) => setMemberIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  // the owner and the manager are on the project anyway, so they are not listed again as team members
  const pickable = users.filter((u: any) => u.id !== formData.ownerId && u.id !== formData.managerId && `${u.fullName} ${u.email}`.toLowerCase().includes(memberSearch.toLowerCase()));

  const createMutation = useMutation({
    mutationFn: (data: any) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: 'Success', description: 'Project created successfully' });
      navigate('/projects');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create project', variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      startDate: formData.startDate || null,
      expectedCompletionDate: formData.expectedCompletionDate || null,
      budget: formData.budget ? parseFloat(formData.budget) : null,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      managerId: formData.managerId !== 'none' ? formData.managerId : null,
      memberIds: memberIds.filter((id) => id !== formData.ownerId && id !== formData.managerId),
    };
    createMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/projects')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">New Project</h1>
          <p className="text-dbi-textSecondary">Create a new security project</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Project Information</CardTitle>
          <CardDescription>Fill in the details to create a new project</CardDescription>
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
                <Label htmlFor="managerId">Manager</Label>
                <Select value={formData.managerId} onValueChange={v => setFormData(prev => ({ ...prev, managerId: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No manager</SelectItem>
                    {users.filter((u: any) => u.id !== formData.ownerId).map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{u.fullName} ({u.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-dbi-textSecondary">The project also shows on the manager's dashboard.</p>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="memberSearch">Team members ({memberIds.length} selected)</Label>
                <Input id="memberSearch" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search people..." className="mt-1" />
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border border-dbi-border p-2">
                  {pickable.length === 0 && <p className="p-2 text-sm text-dbi-textSecondary">No one to add.</p>}
                  {pickable.map((u: any) => (
                    <label key={u.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-dbi-elevated">
                      <input type="checkbox" className="h-4 w-4" checked={memberIds.includes(u.id)} onChange={() => toggleMember(u.id)} />
                      <span className="text-sm text-dbi-textPrimary">{u.fullName} <span className="text-dbi-textSecondary">({u.email})</span></span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-dbi-textSecondary">Choose one or many. You can add or remove people later from the project's Team tab.</p>
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
              <Button type="button" variant="outline" onClick={() => navigate('/projects')}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {createMutation.isPending ? 'Creating...' : 'Create Project'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}