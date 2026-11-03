import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usersApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';

const ROLES = [
  ['SUPER_ADMIN', 'Super Admin'], ['ADMIN', 'Admin'], ['SECURITY_ADMIN', 'Security Admin'], ['SECURITY_ANALYST', 'Security Analyst'],
  ['COMPLIANCE_OFFICER', 'Compliance Officer'], ['MANAGER', 'Manager'], ['USER', 'User'], ['VIEWER', 'Viewer'],
] as const;
const STATUSES = [['ACTIVE', 'Active'], ['INACTIVE', 'Inactive (cannot log in)'], ['SUSPENDED', 'Suspended']] as const;
const ADMIN_LEVEL = ['SUPER_ADMIN', 'ADMIN'];
const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60';

export function UserEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const [form, setForm] = useState({ fullName: '', department: '', role: 'USER', status: 'ACTIVE' });

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => (await usersApi.get(id!)).data?.data,
  });

  useEffect(() => {
    if (user) setForm({ fullName: user.fullName ?? '', department: user.department ?? '', role: user.role, status: user.status === 'PENDING' ? 'ACTIVE' : user.status });
  }, [user]);

  const save = useMutation({
    mutationFn: async () => {
      const changed: Record<string, unknown> = { fullName: form.fullName.trim(), department: form.department.trim() || null };
      if (form.role !== user.role) changed.role = form.role;
      if (user.status !== 'PENDING' && form.status !== user.status) changed.status = form.status;
      await usersApi.update(id!, changed);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user', id] });
      toast({ title: 'User updated' });
      navigate(`/users/${id}`);
    },
    onError: (e: any) => toast({ title: 'Could not save', description: e?.response?.data?.error?.message || 'Please try again', variant: 'destructive' }),
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-dbi-cyan" /></div>;
  if (!user) return <p className="text-dbi-textSecondary">User not found.</p>;

  const isSuper = me?.role === 'SUPER_ADMIN';
  const isSelf = me?.id === user.id;
  const blocked = !isSuper && ADMIN_LEVEL.includes(user.role);
  const roleChoices = ROLES.filter(([v]) => isSuper || !ADMIN_LEVEL.includes(v));
  const lockRoleStatus = isSelf; // you cannot change your own role or status
  const valid = form.fullName.trim().length >= 2;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/users/${id}`)} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight dbi-gradient-text">Edit user</h1>
          <p className="text-dbi-textSecondary">{user.email}</p>
        </div>
      </div>

      {blocked ? (
        <Card><CardContent className="p-6 text-dbi-textSecondary">Only a super admin can change an admin account.</CardContent></Card>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
          <Card>
            <CardHeader>
              <CardTitle>Account details</CardTitle>
              <CardDescription>The email address cannot be changed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="eu-name">Full name *</Label>
                <Input id="eu-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eu-dept">Department</Label>
                <Input id="eu-dept" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="eu-role">Role</Label>
                  <select id="eu-role" className={selectClass} value={form.role} disabled={lockRoleStatus} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    {roleChoices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    {!roleChoices.some(([v]) => v === form.role) && <option value={form.role}>{form.role}</option>}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eu-status">Status</Label>
                  <select id="eu-status" className={selectClass} value={form.status} disabled={lockRoleStatus || user.status === 'PENDING'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {user.status === 'PENDING' && <option value="PENDING">Pending (waiting for activation)</option>}
                    {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              {lockRoleStatus && <p className="text-xs text-dbi-textSecondary">You cannot change your own role or status.</p>}
              {form.role !== user.role && ADMIN_LEVEL.includes(form.role) && (
                <p className="text-xs text-dbi-amber">Admin roles must set up an authenticator app at their next login.</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => navigate(`/users/${id}`)}>Cancel</Button>
                <Button type="submit" disabled={!valid || save.isPending}>
                  {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
}
