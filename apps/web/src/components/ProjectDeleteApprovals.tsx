import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Loader2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { projectDeleteApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { formatDateTimeIST } from '@/lib/utils';

const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';

// Project delete requests: the ones a super admin must decide, and the ones I asked for that are still waiting
export function ProjectDeleteApprovals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const { data: toDecide = [] } = useQuery({
    queryKey: ['project-delete-requests', 'approver'],
    enabled: isSuperAdmin,
    queryFn: async () => ((await projectDeleteApi.list('approver', 'PENDING')).data?.items ?? []) as any[],
    refetchInterval: 30000,
  });
  const { data: mine = [] } = useQuery({
    queryKey: ['project-delete-requests', 'mine'],
    queryFn: async () => ((await projectDeleteApi.list('mine', 'PENDING')).data?.items ?? []) as any[],
    refetchInterval: 30000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['project-delete-requests'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };
  const approve = useMutation({
    mutationFn: async (id: string) => { await projectDeleteApi.approve(id); },
    onSuccess: () => { refresh(); toast({ title: 'Project deleted', description: 'A backup was taken first' }); },
    onError: (e) => toast({ title: 'Could not delete', description: errMsg(e), variant: 'destructive' }),
  });
  const reject = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => { await projectDeleteApi.reject(id, text); },
    onSuccess: () => { setRejecting(null); setNote(''); refresh(); toast({ title: 'Rejected', description: 'The requester was told' }); },
    onError: (e) => toast({ title: 'Could not reject', description: errMsg(e), variant: 'destructive' }),
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => { await projectDeleteApi.cancel(id); },
    onSuccess: () => { refresh(); toast({ title: 'Request withdrawn' }); },
    onError: (e) => toast({ title: 'Could not withdraw', description: errMsg(e), variant: 'destructive' }),
  });

  if (toDecide.length === 0 && mine.length === 0) return null;

  return (
    <div className="space-y-4">
      {toDecide.length > 0 && (
        <Card className="border-dbi-amber/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-5 w-5 text-dbi-amber" /> Project delete requests waiting for you ({toDecide.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {toDecide.map((r: any) => (
              <div key={r.id} className="rounded-lg bg-dbi-elevated/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-dbi-textPrimary"><b>{r.requestedBy?.fullName}</b> asked to delete the project <b>{r.projectName}</b></p>
                    <p className="text-xs text-dbi-textSecondary">{formatDateTimeIST(r.createdAt)}</p>
                    <p className="mt-2 rounded bg-dbi-background/60 p-2 text-sm text-dbi-textPrimary"><span className="text-dbi-textSecondary">Reason: </span>{r.reason}</p>
                  </div>
                  {rejecting !== r.id && (
                    <div className="flex gap-2">
                      <Button size="sm" disabled={approve.isPending}
                        onClick={() => { if (confirm(`Delete the project "${r.projectName}" and everything in it? A backup is taken first.`)) approve.mutate(r.id); }}>
                        {approve.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setRejecting(r.id); setNote(''); }}><X className="mr-1 h-4 w-4" /> Reject</Button>
                    </div>
                  )}
                </div>
                {rejecting === r.id && (
                  <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim().length >= 3) reject.mutate({ id: r.id, text: note.trim() }); }}>
                    <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is it being kept?" aria-label="Reason for rejecting"
                      className="h-9 min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground" />
                    <Button type="submit" size="sm" disabled={note.trim().length < 3 || reject.isPending}>Reject</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
                  </form>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {mine.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-5 w-5 text-dbi-cyan" /> Your project delete requests ({mine.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {mine.map((r: any) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-dbi-elevated/60 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-dbi-textPrimary">{r.projectName}</p>
                  <p className="text-xs text-dbi-textSecondary">Delete pending at {r.pendingWith?.join(', ') || 'a super admin'} · {formatDateTimeIST(r.createdAt)}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => cancel.mutate(r.id)} disabled={cancel.isPending}>Withdraw</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
