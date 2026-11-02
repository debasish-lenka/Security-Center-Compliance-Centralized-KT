import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { complianceApi, usersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const frameworkOptions = ['NIST_CSF', 'ISO_27001', 'SOC2', 'PCI_DSS', 'GDPR', 'HIPAA', 'FEDRAMP', 'CIS_CONTROLS', 'MITRE_ATTACK', 'CUSTOM'];
const statusOptions = ['NOT_APPLICABLE', 'NOT_IMPLEMENTED', 'PARTIALLY_IMPLEMENTED', 'IMPLEMENTED', 'VERIFIED', 'EXCEPTION_GRANTED'];

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
  NOT_APPLICABLE: 'Not Applicable',
  NOT_IMPLEMENTED: 'Not Implemented',
  PARTIALLY_IMPLEMENTED: 'Partially Implemented',
  IMPLEMENTED: 'Implemented',
  VERIFIED: 'Verified',
  EXCEPTION_GRANTED: 'Exception Granted',
};

export function ComplianceCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    controlId: '',
    name: '',
    framework: 'ISO_27001',
    status: 'NOT_IMPLEMENTED',
    description: '',
    ownerId: '',
    lastAssessed: '',
    nextReviewDate: '',
    tags: '',
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-for-select'],
    queryFn: () => usersApi.list({ status: 'ACTIVE', limit: '100' }),
  });

  const users = usersData?.data?.items || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => complianceApi.createControl(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance'] });
      toast({ title: 'Success', description: 'Compliance control created successfully' });
      navigate('/compliance');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create control', variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      lastAssessed: formData.lastAssessed || null,
      nextReviewDate: formData.nextReviewDate || null,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
    };
    createMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/compliance')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">New Compliance Control</h1>
          <p className="text-dbi-textSecondary">Create a new compliance control</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Control Information</CardTitle>
          <CardDescription>Fill in the details to create a new compliance control</CardDescription>
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
                <Label htmlFor="ownerId">Owner</Label>
                <Select value={formData.ownerId} onValueChange={v => setFormData(prev => ({ ...prev, ownerId: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select owner (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {users.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{u.fullName} ({u.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="lastAssessed">Last Assessed</Label>
                <Input
                  id="lastAssessed"
                  type="date"
                  value={formData.lastAssessed}
                  onChange={e => setFormData(prev => ({ ...prev, lastAssessed: e.target.value }))}
                  className="mt-1"
                />
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

              <div className="md:col-span-2">
                <Label htmlFor="tags">Tags (comma separated)</Label>
                <Input
                  id="tags"
                  value={formData.tags}
                  onChange={e => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="access-control, policy, quarterly, evidence-required"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => navigate('/compliance')}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {createMutation.isPending ? 'Creating...' : 'Create Control'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}