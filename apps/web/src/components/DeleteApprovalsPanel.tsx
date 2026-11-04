import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Loader2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { deleteRequestsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { formatDateTimeIST } from '@/lib/utils';

const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';

// Shown on the dashboards. Two parts, each only when there is something to show:
//   - requests waiting for MY decision (project managers; super admins see every pending request)
//   - delete requests I asked for that are still pending
export function DeleteApprovalsPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // refresh every 30s so a manager sees new requests without reloading
  const { data: toDecide = [] } = useQuery({
    queryKey: ['delete-requests', 'approver'],
    queryFn: async () => ((await deleteRequestsApi.list('approver', 'PENDING')).data?.items ?? []) as any[],
    refetchInterval: 30000,
  });
  const { data: mine = [] } = useQuery({
    queryKey: ['delete-requests', 'mine'],
    queryFn: async () => ((await deleteRequestsApi.list('mine', 'PENDING')).data?.items ?? []) as any[],
    refetchInterval: 30000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['delete-requests'] });
    queryClient.invalidateQueries({ queryKey: ['documents'] });
    queryClient.invalidateQueries({ queryKey: ['recycle-bin'] });
  };

  const approve = useMutation({
    mutationFn: async (id: string) => { await deleteRequestsApi.approve(id); },
    onSuccess: () => { refresh(); toast({ title: 'Approved', description: 'The document was moved to the recycle bin' }); },
    onError: (e) => toast({ title: 'Could not approve', description: errMsg(e), variant: 'destructive' }),
  });
  const reject = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => { await deleteRequestsApi.reject(id, text); },
    onSuccess: () => { setRejecting(null); setNote(''); refresh(); toast({ title: 'Rejected', description: 'The requester was told' }); },
    onError: (e) => toast({ title: 'Could not reject', description: errMsg(e), variant: 'destructive' }),
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => { await deleteRequestsApi.cancel(id); },
    onSuccess: () => { refresh(); toast({ title: 'Request withdrawn' }); },
    onError: (e) => toast({ title: 'Could not cancel', description: errMsg(e), variant: 'destructive' }),
  });

  if (toDecide.length === 0 && mine.length === 0) return null;

  return (
    <div className="space-y-4">
      {toDecide.length > 0 && (
        <Card className="border-dbi-amber/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-5 w-5 text-dbi-amber" />
              Document delete requests waiting for approval ({toDecide.length})
            </CardTitle>
            {isSuperAdmin && (
              <Button variant="outline" size="sm" asChild><Link to="/recycle-bin">Recycle bin</Link></Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {toDecide.map((r: any) => (
              <div key={r.id} className="rounded-lg bg-dbi-elevated/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-dbi-textPrimary">
                      <b>{r.requestedBy?.fullName}</b> asked to delete <b>{r.documentName}</b>
                    </p>
                    <p className="text-xs text-dbi-textSecondary">
                      {r.project?.name} · {formatDateTimeIST(r.createdAt)}
                      {isSuperAdmin && ` · waiting for ${r.pendingWith?.join(', ') || 'no one'}`}
                    </p>
                    {r.escalated && <Badge className="mt-1 bg-dbi-amber/15 text-dbi-amber">Escalated: the requester manages this project</Badge>}
                    <p className="mt-2 rounded bg-dbi-background/60 p-2 text-sm text-dbi-textPrimary">
                      <span className="text-dbi-textSecondary">Reason: </span>{r.reason}
                    </p>
                  </div>
                  {rejecting !== r.id && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => { if (confirm(`Delete "${r.documentName}"? It will stay in the recycle bin for 30 days.`)) approve.mutate(r.id); }}
                        disabled={approve.isPending}
                      >
                        <Check className="mr-1 h-4 w-4" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setRejecting(r.id); setNote(''); }}>
                        <X className="mr-1 h-4 w-4" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
                {rejecting === r.id && (
                  <form
                    className="mt-3 flex flex-wrap gap-2"
                    onSubmit={(e) => { e.preventDefault(); if (note.trim().length >= 3) reject.mutate({ id: r.id, text: note.trim() }); }}
                  >
                    <input
                      autoFocus
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Why is it being kept?"
                      aria-label="Reason for rejecting"
                      className="h-9 min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    />
                    <Button type="submit" size="sm" disabled={note.trim().length < 3 || reject.isPending}>
                      {reject.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Reject
                    </Button>
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
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5 text-dbi-cyan" /> Your delete requests ({mine.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {mine.map((r: any) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-dbi-elevated/60 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-dbi-textPrimary">{r.documentName} <span className="text-dbi-textSecondary">· {r.project?.name}</span></p>
                  <p className="text-xs text-dbi-textSecondary">
                    Delete pending, waiting for {r.pendingWith?.join(', ') || 'a manager'} · {formatDateTimeIST(r.createdAt)}
                  </p>
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
