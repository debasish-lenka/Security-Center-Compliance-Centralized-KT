import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { complianceApi, usersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const frameworkOptions = ['NIST_CSF', 'ISO_27001', 'SOC2', 'PCI_DSS', 'GDPR', 'HIPAA', 'FEDRAMP', 'CIS_CONTROLS', 'MITRE_ATTACK', 'CUSTOM'];
const statusOptions = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'AT_RISK'];

const frameworkLabels: Record<string, string> = {
  NIST_CSF: 'NIST CSF',
  ISO_27001: 'ISO 27001',
  SOC2: 'SOC 2',
  PCI_DSS: 'PCI DSS',
  GDPR: 'GDPR',
  HIPAA: 'HIPAA',
  FEDRAMP: 'FedRAMP',
  CIS_CONTROLS: 'CIS Controls',
  MITRE_ATTACK: 'MITRE ATT&CK',
  CUSTOM: 'Custom',
};

const statusLabels: Record<string, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  OVERDUE: 'Overdue',
  AT_RISK: 'At Risk',
};

const statusBadges: Record<string, string> = {
  NOT_STARTED: 'bg-slate-500/20 text-slate-300',
  IN_PROGRESS: 'bg-cyan-500/20 text-cyan-300',
  COMPLETED: 'bg-emerald-500/20 text-emerald-300',
  OVERDUE: 'bg-rose-500/20 text-rose-300',
  AT_RISK: 'bg-amber-500/20 text-amber-300',
};

export function ComplianceEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    controlId: '',
    name: '',
    framework: 'ISO_27001',
    status: 'NOT_STARTED',
    description: '',
    ownerId: '',
    lastAssessed: '',
    nextReviewDate: '',
    tags: '',
  });

  const { data: controlData, isLoading: controlLoading } = useQuery({
    queryKey: ['compliance-control', id],
    queryFn: () => complianceApi.getControl(id!),
    enabled: !!id,
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-for-select'],
    queryFn: () => usersApi.list({ status: 'ACTIVE', limit: '100' }),
  });

  const users = usersData?.data?.items || [];

  useEffect(() => {
    if (controlData?.data) {
      const c = controlData.data;
      setFormData({
        controlId: c.controlId || c.id || '',
        name: c.name || '',
        framework: c.framework || 'ISO_27001',
        status: c.status || 'NOT_STARTED',
        description: c.description || '',
        ownerId: c.ownerId || c.owner?.id || '',
        lastAssessed: c.lastAssessed ? c.lastAssessed.split('T')[0] : '',
        nextReviewDate: c.nextReviewDate ? c.nextReviewDate.split('T')[0] : '',
        tags: c.tags?.join(', ') || '',
      });
    }
  }, [controlData]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => complianceApi.updateControl(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-control', id] });
      toast({ title: 'Success', description: 'Compliance control updated successfully' });
      navigate(`/compliance/${id}`);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update control', variant: 'destructive' });
    },
  });

  if (controlLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-dbi-elevated rounded w-1/4" />
        <div className="h-64 bg-dbi-elevated rounded-lg" />
      </div>
    );
  }

  const control = controlData?.data;

  if (!control) {
    return (
      <div className="text-center py-12">
        <p className="text-dbi-critical">Compliance Control Not Found</p>
        <Button asChild className="mt-4">
          <a href="/compliance"><ArrowLeft className="mr-2 h-4 w-4" />Back to Compliance</a>
        </Button>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      lastAssessed: formData.lastAssessed || null,
      nextReviewDate: formData.nextReviewDate || null,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
    };
    updateMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/compliance/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">Edit Compliance Control</h1>
          <p className="text-dbi-textSecondary">Update control details</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge className={statusBadges[control.status] || 'bg-dbi-muted text-dbi-textSecondary'}>
            {statusLabels[control.status] || control.status.replace('_', ' ')}
          </Badge>
          <Badge variant="secondary">{frameworkLabels[control.framework] || control.framework}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Control Information</CardTitle>
          <CardDescription>Update the compliance control details</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="controlId">Control ID *</Label>
                <Input
                  id="controlId"
                  value={formData.controlId}
                  onChange={e => setFormData(prev => ({ ...prev, controlId: e.target.value }))}
                  placeholder="e.g., A.12.1, CC6.1, 4.2.1"
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="framework">Framework *</Label>
                <Select value={formData.framework} onValueChange={v => setFormData(prev => ({ ...prev, framework: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select framework" />
                  </SelectTrigger>
                  <SelectContent>
                    {frameworkOptions.map(f => <SelectItem key={f} value={f}>{frameworkLabels[f]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="name">Control Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter control name"
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="status">Status *</Label>
                <Select value={formData.status} onValueChange={v => setFormData(prev => ({ ...prev, status: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map(s => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="ownerId">Owner *</Label>
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
                <Label htmlFor="nextReviewDate">Next Review Date</Label>
                <Input
                  id="nextReviewDate"
                  type="date"
                  value={formData.nextReviewDate}
                  onChange={e => setFormData(prev => ({ ...prev, nextReviewDate: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the control requirements, implementation details, and assessment criteria"
                  rows={6}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => navigate(`/compliance/${id}`)}>
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