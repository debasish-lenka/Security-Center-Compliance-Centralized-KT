import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { complianceApi, usersApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, getStatusColor, formatDateTimeIST } from '@/lib/utils';
import { ArrowLeft, Edit, Trash2, Shield, Calendar, User, Clock, AlertTriangle, CheckCircle, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const statusBadges: Record<string, string> = {
  NOT_STARTED: 'bg-slate-500/20 text-slate-300',
  IN_PROGRESS: 'bg-cyan-500/20 text-cyan-300',
  COMPLETED: 'bg-emerald-500/20 text-emerald-300',
  OVERDUE: 'bg-rose-500/20 text-rose-300',
  AT_RISK: 'bg-amber-500/20 text-amber-300',
};

const frameworkIcons: Record<string, React.ReactNode> = {
  NIST_CSF: <Shield className="h-4 w-4 text-blue-400" />,
  ISO_27001: <Shield className="h-4 w-4 text-green-400" />,
  SOC2: <Shield className="h-4 w-4 text-purple-400" />,
  PCI_DSS: <Shield className="h-4 w-4 text-orange-400" />,
  GDPR: <Shield className="h-4 w-4 text-red-400" />,
  HIPAA: <Shield className="h-4 w-4 text-teal-400" />,
  FEDRAMP: <Shield className="h-4 w-4 text-indigo-400" />,
  CIS_CONTROLS: <Shield className="h-4 w-4 text-cyan-400" />,
  MITRE_ATTACK: <Shield className="h-4 w-4 text-rose-400" />,
  CUSTOM: <Shield className="h-4 w-4 text-dbi-textSecondary" />,
};

const getStatusIcon = (status: string) => {
  if (status === 'COMPLETED') return <CheckCircle className="h-4 w-4 text-dbi-success" />;
  if (status === 'IN_PROGRESS') return <AlertTriangle className="h-4 w-4 text-dbi-warning" />;
  if (status === 'NOT_STARTED' || status === 'NOT_APPLICABLE') return <Shield className="h-4 w-4 text-dbi-textSecondary" />;
  return <AlertTriangle className="h-4 w-4 text-dbi-critical" />;
};

export function ComplianceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [taskOpen, setTaskOpen] = useState(false);
  const [evOpen, setEvOpen] = useState(false);
  const [task, setTask] = useState({ title: '', description: '', assigneeId: '', dueDate: '' });
  const [evNote, setEvNote] = useState('');
  const canManage = ['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER'].includes(user?.role ?? '');
  const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['compliance-control', id] });

  const { data: people = [] } = useQuery({
    queryKey: ['compliance-assignees'],
    enabled: taskOpen && canManage,
    retry: false,
    queryFn: async () => {
      const r: any = await usersApi.list({ limit: '100' });
      return (r.data?.items ?? r.data?.data?.items ?? []) as { id: string; fullName: string }[];
    },
  });

  const addTask = useMutation({
    mutationFn: () => complianceApi.createRemediationTask(id!, { title: task.title.trim(), description: task.description.trim() || null, assigneeId: task.assigneeId || user?.id, dueDate: task.dueDate }),
    onSuccess: () => { refresh(); setTaskOpen(false); setTask({ title: '', description: '', assigneeId: '', dueDate: '' }); toast({ title: 'Remediation task added' }); },
    onError: (e) => toast({ title: 'Could not add the task', description: errMsg(e), variant: 'destructive' }),
  });
  const setTaskStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) => complianceApi.updateRemediationTask(taskId, { status }),
    onSuccess: refresh,
    onError: (e) => toast({ title: 'Could not update the task', description: errMsg(e), variant: 'destructive' }),
  });
  const addEvidence = useMutation({
    mutationFn: () => {
      const stamp = new Date().toISOString().slice(0, 10);
      const prev = (data?.data?.evidenceText as string) || '';
      return complianceApi.updateControl(id!, { evidence: `${prev}${prev ? '\n' : ''}[${stamp} ${user?.fullName ?? ''}] ${evNote.trim()}` });
    },
    onSuccess: () => { refresh(); setEvOpen(false); setEvNote(''); toast({ title: 'Evidence note added' }); },
    onError: (e) => toast({ title: 'Could not add evidence', description: errMsg(e), variant: 'destructive' }),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['compliance-control', id],
    queryFn: () => complianceApi.getControl(id!),
    enabled: !!id,
  });

  const deleteMutation = async () => {
    if (!confirm('Are you sure you want to delete this compliance control? This action cannot be undone.')) return;
    try {
      await complianceApi.delete(id!);
      toast({ title: 'Control deleted', description: 'The compliance control has been deleted successfully' });
      navigate('/compliance');
    } catch {
      toast({ title: 'Error', description: 'Failed to delete control', variant: 'destructive' });
    }
  };

  const control = data?.data;

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

  if (error || !control) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="mx-auto h-16 w-16 text-dbi-critical" />
        <h2 className="mt-4 text-2xl font-bold text-dbi-textPrimary">Control Not Found</h2>
        <p className="mt-2 text-dbi-textSecondary">The compliance control you're looking for doesn't exist or has been removed.</p>
        <Button asChild className="mt-4">
          <Link to="/compliance"><ArrowLeft className="mr-2 h-4 w-4" />Back to Compliance</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/compliance')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-dbi-textPrimary">{control.name}</h1>
            <p className="text-dbi-textSecondary">{control.controlId || control.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {frameworkIcons[control.framework]}
            <Badge variant="secondary">{control.framework.replace('_', ' ')}</Badge>
          </div>
          <Badge className={statusBadges[control.status] || 'bg-dbi-muted text-dbi-textSecondary'}>
            {control.status.replace('_', ' ')}
          </Badge>
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/compliance/${id}/edit`}>
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
                <Shield className="h-6 w-6 text-dbi-cyan" />
              </div>
              <div>
                <p className="text-sm text-dbi-textSecondary">Framework</p>
                <p className="text-xl font-bold text-dbi-textPrimary">{control.framework.replace('_', ' ')}</p>
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
                <p className="text-sm text-dbi-textSecondary">Last Assessed</p>
                <p className="text-xl font-bold text-dbi-textPrimary">{control.lastAssessed ? formatDateTimeIST(control.lastAssessed) : 'Never'}</p>
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
                <p className="text-sm text-dbi-textSecondary">Owner</p>
                <p className="text-xl font-bold text-dbi-textPrimary">{control.owner?.fullName || control.owner || 'Unassigned'}</p>
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
                <p className="text-sm text-dbi-textSecondary">Next Review</p>
                <p className="text-xl font-bold text-dbi-textPrimary">{control.nextReviewDate ? formatDate(control.nextReviewDate) : 'Not scheduled'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-invert max-w-none whitespace-pre-wrap text-dbi-textSecondary">
                {control.description || 'No description provided'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Evidence notes</CardTitle>
            </CardHeader>
            <CardContent>
              {control.evidenceText ? (
                <div className="space-y-2">
                  {String(control.evidenceText).split('\n').filter(Boolean).map((line: string, idx: number) => (
                    <div key={idx} className="rounded-lg bg-dbi-elevated p-3 text-sm text-dbi-textPrimary">{line}</div>
                  ))}
                </div>
              ) : <p className="text-sm text-dbi-textSecondary">No evidence recorded yet.</p>}
              <p className="mt-3 text-xs text-dbi-textSecondary">Supporting files go in the Document Vault of the project.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-dbi-warning" />
                Remediation Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(control.remediationTasks ?? []).length === 0 && <p className="text-sm text-dbi-textSecondary">No remediation tasks.</p>}
              <div className="space-y-3">
                {(control.remediationTasks ?? []).map((t: any) => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-dbi-elevated rounded-lg">
                    <div>
                      <p className="font-medium text-dbi-textPrimary">{t.title}</p>
                      <p className="text-sm text-dbi-textSecondary">{t.description}</p>
                      <p className="text-xs text-dbi-textSecondary">{t.assignee?.fullName ? `${t.assignee.fullName} · ` : ''}due {formatDate(t.dueDate)}</p>
                    </div>
                    {(canManage || t.assigneeId === user?.id) ? (
                      <select aria-label={`Status of ${t.title}`} value={t.status} onChange={(e) => setTaskStatus.mutate({ taskId: t.id, status: e.target.value })} className="h-9 rounded-md border border-dbi-border bg-dbi-elevated px-2 text-sm text-dbi-textPrimary">
                        {['PENDING', 'IN_PROGRESS', 'COMPLETED'].map((st) => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}
                        {t.status === 'OVERDUE' && <option value="OVERDUE">OVERDUE</option>}
                      </select>
                    ) : <Badge variant="secondary">{t.status?.replace('_', ' ')}</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Control ID</p>
                <p className="font-mono text-sm text-dbi-textPrimary">{control.controlId || control.id}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Status</p>
                <div className="flex items-center gap-2">
                  {getStatusIcon(control.status)}
                  <Badge className={getStatusColor(control.status)}>
                    {control.status.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Framework</p>
                <div className="flex items-center gap-2">
                  {frameworkIcons[control.framework]}
                  <p className="text-sm text-dbi-textPrimary">{control.framework.replace('_', ' ')}</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Last Assessed</p>
                <p className="text-sm text-dbi-textPrimary">{control.lastAssessed ? formatDateTimeIST(control.lastAssessed) : 'Never'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Next Review</p>
                <p className="text-sm text-dbi-textPrimary">{control.nextReviewDate ? formatDate(control.nextReviewDate) : 'Not scheduled'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Owner</p>
                <p className="text-sm text-dbi-textPrimary">{control.owner?.fullName || control.owner || 'Unassigned'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Created</p>
                <p className="text-sm text-dbi-textPrimary">{control.createdAt ? formatDateTimeIST(control.createdAt) : 'Unknown'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Updated</p>
                <p className="text-sm text-dbi-textPrimary">{control.updatedAt ? formatDateTimeIST(control.updatedAt) : 'Unknown'}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-dbi-info">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-dbi-info" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to={`/compliance/${id}/edit`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Control
                </Link>
              </Button>
              {canManage && <Button variant="outline" className="w-full justify-start" onClick={() => setTaskOpen(true)}><AlertTriangle className="mr-2 h-4 w-4" />Add Remediation Task</Button>}
              {canManage && <Button variant="outline" className="w-full justify-start" onClick={() => setEvOpen(true)}><FileText className="mr-2 h-4 w-4" />Add Evidence</Button>}
              <Button variant="ghost" className="w-full justify-start text-dbi-critical hover:text-dbi-critical" onClick={deleteMutation}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Control
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add remediation task</DialogTitle><DialogDescription>What must be fixed, who does it, and by when.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (task.title.trim() && task.dueDate) addTask.mutate(); }}>
            <div className="space-y-2"><Label htmlFor="rt-title">Title *</Label><Input id="rt-title" value={task.title} maxLength={255} onChange={(e) => setTask({ ...task, title: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="rt-desc">Description</Label><Input id="rt-desc" value={task.description} onChange={(e) => setTask({ ...task, description: e.target.value })} /></div>
            <div className="space-y-2">
              <Label htmlFor="rt-assignee">Assign to</Label>
              <select id="rt-assignee" value={task.assigneeId} onChange={(e) => setTask({ ...task, assigneeId: e.target.value })} className="h-10 w-full rounded-md border border-dbi-border bg-dbi-elevated px-3 text-sm text-dbi-textPrimary">
                <option value="">Me</option>
                {people.filter((p) => p.id !== user?.id).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label htmlFor="rt-due">Due date *</Label><Input id="rt-due" type="date" value={task.dueDate} onChange={(e) => setTask({ ...task, dueDate: e.target.value })} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setTaskOpen(false)}>Cancel</Button><Button type="submit" disabled={!task.title.trim() || !task.dueDate || addTask.isPending}>Add task</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={evOpen} onOpenChange={setEvOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add evidence note</DialogTitle><DialogDescription>Describe the evidence: document name, location or finding. It is stamped with today's date and your name.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (evNote.trim()) addEvidence.mutate(); }}>
            <div className="space-y-2"><Label htmlFor="ev-note">Note *</Label><Input id="ev-note" value={evNote} onChange={(e) => setEvNote(e.target.value)} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEvOpen(false)}>Cancel</Button><Button type="submit" disabled={!evNote.trim() || addEvidence.isPending}>Add evidence</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}