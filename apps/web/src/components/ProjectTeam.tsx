import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { projectsApi, teamApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';

const ROLES = [
  ['OWNER', 'Owner'],
  ['LEAD', 'Lead'],
  ['CONTRIBUTOR', 'Contributor'],
  ['REVIEWER', 'Reviewer'],
  ['VIEWER', 'Viewer (read-only)'],
] as const;

const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-60';
const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';

// Who is on the project and what they may do. Owners and leads manage the team; only owners change owners.
export function ProjectTeam({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newUser, setNewUser] = useState('');
  const [newRole, setNewRole] = useState('CONTRIBUTOR');

  const membersKey = ['project-team', projectId];
  const { data: members = [], isLoading } = useQuery({
    queryKey: membersKey,
    queryFn: async () => ((await projectsApi.getMembers(projectId)).data?.data ?? []) as any[],
  });

  const me = members.find((m: any) => m.userId === user?.id);
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const canManage = isAdmin || ['OWNER', 'LEAD'].includes(me?.role);
  const canManageOwners = isAdmin || me?.role === 'OWNER';

  const { data: available = [] } = useQuery({
    queryKey: ['project-available', projectId, members.length],
    queryFn: async () => ((await teamApi.available(projectId)).data?.data ?? []) as any[],
    enabled: canManage,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: membersKey });
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    queryClient.invalidateQueries({ queryKey: ['project-members', projectId] });
  };
  const fail = (title: string) => (e: any) => toast({ title, description: errMsg(e), variant: 'destructive' });

  const add = useMutation({
    mutationFn: async () => { await teamApi.add(projectId, newUser, newRole); },
    onSuccess: () => { setNewUser(''); setNewRole('CONTRIBUTOR'); refresh(); toast({ title: 'Member added' }); },
    onError: fail('Could not add member'),
  });
  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => { await teamApi.setRole(projectId, id, role); },
    onSuccess: () => { refresh(); toast({ title: 'Role updated' }); },
    onError: fail('Could not change the role'),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await teamApi.remove(projectId, id); },
    onSuccess: () => { refresh(); toast({ title: 'Member removed' }); },
    onError: fail('Could not remove the member'),
  });

  const roleChoices = ROLES.filter(([v]) => canManageOwners || v !== 'OWNER');

  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <CardHeader><CardTitle className="text-base">Add a team member</CardTitle></CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => { e.preventDefault(); if (newUser) add.mutate(); }}
            >
              <div className="min-w-[220px] flex-1">
                <label htmlFor="team-user" className="mb-1 block text-xs text-dbi-textSecondary">Person</label>
                <select id="team-user" className={`${selectClass} w-full`} value={newUser} onChange={(e) => setNewUser(e.target.value)}>
                  <option value="">{available.length ? 'Select a person' : 'Everyone is already on the team'}</option>
                  {available.map((u: any) => <option key={u.id} value={u.id}>{u.fullName} ({u.email})</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="team-role" className="mb-1 block text-xs text-dbi-textSecondary">Project role</label>
                <select id="team-role" className={selectClass} value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  {roleChoices.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </div>
              <Button type="submit" disabled={!newUser || add.isPending}>
                {add.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Add
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Team ({members.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-dbi-cyan" /></div>
          ) : members.length === 0 ? (
            <p className="py-6 text-center text-sm text-dbi-textSecondary">No members yet.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m: any) => {
                const locked = !canManage || (m.role === 'OWNER' && !canManageOwners);
                return (
                  <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-dbi-elevated/60 p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dbi-cyan/15 text-sm font-medium text-dbi-cyan">
                      {m.user?.fullName?.charAt(0).toUpperCase() ?? '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-dbi-textPrimary">
                        {m.user?.fullName} {m.userId === user?.id && <Badge variant="secondary" className="ml-1 text-xs">You</Badge>}
                      </p>
                      <p className="truncate text-xs text-dbi-textSecondary">{m.user?.email}{m.user?.department ? ` · ${m.user.department}` : ''}</p>
                    </div>
                    <select
                      aria-label={`Role of ${m.user?.fullName}`}
                      className={selectClass}
                      value={m.role}
                      disabled={locked || setRole.isPending}
                      onChange={(e) => setRole.mutate({ id: m.id, role: e.target.value })}
                    >
                      {ROLES.filter(([v]) => canManageOwners || v !== 'OWNER' || m.role === 'OWNER').map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                    {!locked && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${m.user?.fullName}`}
                        className="text-dbi-critical hover:text-dbi-critical"
                        onClick={() => { if (confirm(`Remove ${m.user?.fullName} from this project?`)) remove.mutate(m.id); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
