import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { formatDateTimeIST } from '@/lib/utils';

// Admin review of screenshots that did not show the tool. They are kept encrypted for 48 hours, outside every work log.
interface Held { id: string; createdAt: string; expiresAt: string; size: number; reason: string; project: string; person: string; tool: string | null }
const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';

// The picture is fetched only when asked for, with the admin's own login, and dropped when the box is closed
function PictureView({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    api.get(`/v1/admin/work-quarantine/${id}/picture`, { responseType: 'blob' })
      .then((r) => { if (!alive) return; url = URL.createObjectURL(r.data as Blob); setSrc(url); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  if (failed) return <p className="text-sm text-dbi-critical">The picture could not be shown. It may have been decided or deleted already.</p>;
  if (!src) return <p className="text-sm text-dbi-textSecondary">Loading the picture...</p>;
  return <img src={src} alt="Screenshot held for review" className="max-h-96 w-auto max-w-full rounded-md border border-dbi-border" />;
}

export function QuarantinePanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['work-quarantine'],
    queryFn: async () => (await api.get('/v1/admin/work-quarantine')).data.data as Held[],
    retry: false,
    refetchInterval: 60_000,
  });
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const decide = useMutation({
    mutationFn: (v: { id: string; restore: boolean; note?: string }) => api.post(`/v1/admin/work-quarantine/${v.id}/decide`, { restore: v.restore, ...(v.note ? { note: v.note } : {}) }),
    onSuccess: (_d, v) => {
      toast({ title: v.restore ? 'Put back in the work log' : 'Refused and deleted' });
      setOpen(null);
      setNote('');
      qc.invalidateQueries({ queryKey: ['work-quarantine'] });
    },
    onError: (e) => toast({ title: 'Could not save', description: errMsg(e), variant: 'destructive' }),
  });

  if (q.isError) return null; // not an admin: the panel is not shown
  const rows = q.data ?? [];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Pictures held for review ({rows.length})</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-dbi-textSecondary">These screenshots did not show the tool, so they are kept encrypted for 48 hours and are in no work log. Look at each one. Put it back only if the tool is on it. Otherwise refuse it, and it is deleted at once. Whatever is not decided in 48 hours is deleted by itself.</p>
        {rows.length === 0 && <p className="text-dbi-textSecondary">Nothing is held.</p>}
        {rows.map((r) => (
          <div key={r.id} className="space-y-2 rounded-md border border-dbi-border p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-medium">{r.project} · {r.person} · {r.tool ?? 'no tool name'}</span>
              <span className="text-xs text-dbi-textSecondary">held {formatDateTimeIST(r.createdAt)} · deleted by itself {formatDateTimeIST(r.expiresAt)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { setOpen(open === r.id ? null : r.id); setNote(''); }}>{open === r.id ? 'Hide picture' : 'Show picture'}</Button>
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, restore: true })}>Put back in the work log</Button>
            </div>
            {open === r.id && (
              <div className="space-y-2">
                <PictureView id={r.id} />
                <div className="flex flex-wrap items-center gap-2">
                  <Input className="max-w-sm" aria-label="Reason for refusing" placeholder="Why refuse it? (at least 5 characters)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button size="sm" variant="destructive" disabled={note.trim().length < 5 || decide.isPending} onClick={() => decide.mutate({ id: r.id, restore: false, note: note.trim() })}>Refuse and delete</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
