import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit, KeyRound, Loader2, Send, ShieldOff, UserCheck, UserCog, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { accessApi, usersApi } from '@/lib/api';
import { HandoverDialog } from '@/components/HandoverDialog';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { getStatusColor, formatDateTimeIST } from '@/lib/utils';

const ADMIN_LEVEL = ['SUPER_ADMIN', 'ADMIN'];
const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';
const roleLabel = (r: string) => r.replace(/_/g, ' ').toLowerCase().replace(/^\w|\s\w/g, (c) => c.toUpperCase());

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const [pwOpen, setPwOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [password, setPassword] = useState('');

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => (await usersApi.get(id!)).data?.data,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['user-projects', id],
    queryFn: async () => ((await usersApi.getProjects(id!)).data?.data ?? []) as any[],
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['user', id] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };
  const fail = (title: string) => (e: any) => toast({ title, description: errMsg(e), variant: 'destructive' });

  const setStatus = useMutation({
    mutationFn: async (status: string) => { await usersApi.update(id!, { status }); },
    onSuccess: (_r, status) => { refresh(); toast({ title: status === 'ACTIVE' ? 'Account reactivated' : 'Account deactivated', description: status === 'ACTIVE' ? undefined : 'They are signed out and cannot log in' }); },
    onError: fail('Could not change the status'),
  });
  const resetMfa = useMutation({
    mutationFn: async () => { await accessApi.resetMfa(id!); },
    onSuccess: () => { refresh(); toast({ title: 'Authenticator reset', description: 'They will set up a new one at next login' }); },
    onError: fail('Could not reset'),
  });
  const resend = useMutation({
    mutationFn: async () => (await accessApi.resendInvite(id!)).data?.data,
    onSuccess: (r: any) => toast(r?.emailed ? { title: 'Invitation sent' } : { title: 'Email not sent', description: r?.error ?? 'Mail is not configured', variant: 'destructive' }),
    onError: fail('Could not resend'),
  });
  const setPw = useMutation({
    mutationFn: async () => { await accessApi.setPassword(id!, password); },
    onSuccess: () => { setPwOpen(false); setPassword(''); refresh(); toast({ title: 'Password updated', description: 'Give the new password to the user' }); },
    onError: fail('Could not set the password'),
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-dbi-cyan" /></div>;
  if (!user) return <p className="text-dbi-textSecondary">User not found.</p>;

  const isSuper = me?.role === 'SUPER_ADMIN';
  const targetIsAdmin = ADMIN_LEVEL.includes(user.role);
  const canManage = isSuper || (!targetIsAdmin && me?.id !== user.id);
  const pwOk = password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password);
  const needsTotp = targetIsAdmin && user.authProvider === 'LOCAL';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/users')} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-dbi-cyan/15 text-xl font-semibold text-dbi-cyan">
              {user.fullName?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight dbi-gradient-text">{user.fullName}</h1>
              <p className="text-dbi-textSecondary">{user.email}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{roleLabel(user.role)}</Badge>
          <Badge className={getStatusColor(user.status)}>{user.status}</Badge>
        </div>
      </div>

      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link to={`/users/${id}/edit`}><Edit className="mr-2 h-4 w-4" /> Edit</Link></Button>
          {user.authProvider === 'LOCAL' && (
            <Button variant="outline" onClick={() => { setPassword(''); setPwOpen(true); }}><KeyRound className="mr-2 h-4 w-4" /> Set password</Button>
          )}
          {user.status === 'PENDING' && (
            <Button variant="outline" onClick={() => resend.mutate()} disabled={resend.isPending}><Send className="mr-2 h-4 w-4" /> Resend invite</Button>
          )}
          {isSuper && needsTotp && user.totpEnabled && (
            <Button variant="outline" onClick={() => { if (confirm(`Reset the authenticator for ${user.email}?`)) resetMfa.mutate(); }}>
              <ShieldOff className="mr-2 h-4 w-4" /> Reset 2FA
            </Button>
          )}
          <Button variant="outline" onClick={() => setHandoverOpen(true)}><UserCog className="mr-2 h-4 w-4" /> Hand over work</Button>
          {user.status === 'ACTIVE' ? (
            <Button
              variant="ghost"
              className="text-dbi-critical hover:text-dbi-critical"
              disabled={me?.id === user.id}
              onClick={() => { if (confirm(`Deactivate ${user.fullName}? They are signed out at once and cannot log in until you reactivate them.`)) setStatus.mutate('INACTIVE'); }}
            >
              <UserX className="mr-2 h-4 w-4" /> Deactivate
            </Button>
          ) : user.status !== 'PENDING' && (
            <Button variant="outline" onClick={() => setStatus.mutate('ACTIVE')}><UserCheck className="mr-2 h-4 w-4" /> Reactivate</Button>
          )}
        </div>
      )}
      {!canManage && me?.id !== user.id && (
        <p className="text-sm text-dbi-textSecondary">Only a super admin can change an admin account.</p>
      )}

      <Card>
        <CardContent className="grid gap-4 p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><p className="text-dbi-textSecondary">Department</p><p className="font-medium text-dbi-textPrimary">{user.department || 'Not set'}</p></div>
          <div><p className="text-dbi-textSecondary">Signs in with</p><p className="font-medium text-dbi-textPrimary">{user.authProvider === 'MICROSOFT' ? 'Microsoft 365 account' : 'Password'}</p></div>
          <div>
            <p className="text-dbi-textSecondary">Two-step verification</p>
            <p className="font-medium text-dbi-textPrimary">
              {user.authProvider === 'MICROSOFT' ? 'Handled by Microsoft' : !targetIsAdmin ? 'Not required for this role' : user.totpEnabled ? 'Enabled' : 'Will be set up at next login'}
            </p>
          </div>
          <div><p className="text-dbi-textSecondary">Created</p><p className="font-medium text-dbi-textPrimary">{formatDateTimeIST(user.createdAt)}</p></div>
          <div><p className="text-dbi-textSecondary">Last active</p><p className="font-medium text-dbi-textPrimary">{user.lastActivityAt ? formatDateTimeIST(user.lastActivityAt) : 'Never'}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Projects ({projects.length})</CardTitle></CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="py-4 text-center text-sm text-dbi-textSecondary">Not on any project.</p>
          ) : (
            <div className="space-y-2">
              {projects.map((p: any) => (
                <Link key={p.projectId} to={`/projects/${p.projectId}`} className="flex items-center justify-between rounded-lg bg-dbi-elevated/60 p-3 hover:bg-dbi-elevated">
                  <div>
                    <p className="font-medium text-dbi-textPrimary">{p.project?.name}</p>
                    <p className="text-xs text-dbi-textSecondary">{String(p.project?.status ?? '').replace(/_/g, ' ')} · {p.project?.progress ?? 0}% complete</p>
                  </div>
                  <Badge variant="secondary">{roleLabel(p.role)}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set a new password</DialogTitle>
            <DialogDescription>For {user.email}. Tell them the password yourself; it cannot be viewed again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input autoComplete="off" placeholder="At least 10 characters, a letter and a number" value={password} onChange={(e) => setPassword(e.target.value)} />
            {password && !pwOk && <p className="text-xs text-dbi-critical">At least 10 characters, with a letter and a number.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)}>Cancel</Button>
            <Button onClick={() => setPw.mutate()} disabled={!pwOk || setPw.isPending}>
              {setPw.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {user && <HandoverDialog user={{ id: user.id, fullName: user.fullName }} open={handoverOpen} onOpenChange={setHandoverOpen} onDone={() => { refresh(); queryClient.invalidateQueries({ queryKey: ['user-projects', id] }); }} />}
    </div>
  );
}
