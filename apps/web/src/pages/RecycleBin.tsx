import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { recycleBinApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { formatDateTimeIST } from '@/lib/utils';

const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

// Deleted documents wait here for 30 days; a super admin can restore them or remove them for good
export function RecycleBin() {
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['recycle-bin'],
    queryFn: async () => ((await recycleBinApi.list()).data?.items ?? []) as any[],
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['recycle-bin'] });
    queryClient.invalidateQueries({ queryKey: ['documents'] });
  };
  const restore = useMutation({
    mutationFn: async (id: string) => { await recycleBinApi.restore(id); },
    onSuccess: () => { refresh(); toast({ title: 'Document restored', description: 'It is back in its project' }); },
    onError: (e) => toast({ title: 'Could not restore', description: errMsg(e), variant: 'destructive' }),
  });
  const purge = useMutation({
    mutationFn: async (id: string) => { await recycleBinApi.purge(id); },
    onSuccess: () => { refresh(); toast({ title: 'Deleted for good' }); },
    onError: (e) => toast({ title: 'Could not delete', description: errMsg(e), variant: 'destructive' }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight dbi-gradient-text">Recycle Bin</h1>
        <p className="text-dbi-textSecondary">Deleted documents are kept for 30 days, then removed for good.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-dbi-cyan" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-dbi-textSecondary">The recycle bin is empty.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((e: any) => (
            <Card key={e.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium text-dbi-textPrimary">{e.documentName}</p>
                  <p className="text-xs text-dbi-textSecondary">
                    {e.projectName ?? 'Project deleted'} · {kb(e.size)} · {e.versions} version{e.versions === 1 ? '' : 's'}
                  </p>
                  <p className="text-xs text-dbi-textSecondary">
                    Deleted {formatDateTimeIST(e.deletedAt)} by {e.deletedBy}
                    {e.requestedBy ? ` · requested by ${e.requestedBy}` : ''}
                  </p>
                  {e.reason && <p className="text-sm text-dbi-textPrimary"><span className="text-dbi-textSecondary">Reason: </span>{e.reason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={e.daysLeft <= 5 ? 'bg-dbi-critical/15 text-dbi-critical' : 'bg-dbi-cyan/15 text-dbi-cyan'}>
                    {e.daysLeft} day{e.daysLeft === 1 ? '' : 's'} left
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => restore.mutate(e.id)} disabled={restore.isPending || !e.projectName} title={e.projectName ? '' : 'The project no longer exists'}>
                    <RotateCcw className="mr-1 h-4 w-4" /> Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-dbi-critical hover:text-dbi-critical"
                    onClick={() => { if (confirm(`Delete "${e.documentName}" for good? This cannot be undone.`)) purge.mutate(e.id); }}
                    disabled={purge.isPending}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Delete forever
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
