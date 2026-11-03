import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Download, HardDriveDownload, Info, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { backupsApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { formatDateTimeIST } from '@/lib/utils';

interface Settings {
  enabled: boolean;
  frequency: 'DAILY' | 'WEEKLY';
  timeUtc: string;
  weekday: number;
  keep: number;
  includeDocuments: boolean;
  lastRunAt: string | null;
  lastStatus: 'OK' | 'FAILED' | 'RUNNING' | null;
  lastMessage: string | null;
}
interface Item { name: string; createdAt: string; dbSize: number | null; documentsSize: number | null }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';
const size = (b: number | null) => (b == null ? '-' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const when = (iso: string) => formatDateTimeIST(iso);

// The server keeps the time in UTC; people set it in Indian Standard Time (UTC + 5:30)
const OFFSET = 330;
const hm = (mins: number) => { const t = ((mins % 1440) + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const utcToLocal = (hhmm: string) => hm(toMinutes(hhmm) + OFFSET);
const localToUtc = (hhmm: string) => hm(toMinutes(hhmm) - OFFSET);

const field = 'h-10 rounded-md border border-dbi-border bg-dbi-elevated px-3 text-sm text-dbi-textPrimary';

export function Backups() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: async () => (await backupsApi.list()).data?.data as { settings: Settings; items: Item[]; running: boolean; nextRunAt: string | null },
    refetchInterval: (q) => (q.state.data?.running ? 2000 : false),
  });

  const [form, setForm] = useState<{ enabled: boolean; frequency: 'DAILY' | 'WEEKLY'; localTime: string; weekday: number; keep: number; includeDocuments: boolean } | null>(null);
  useEffect(() => {
    if (data && !form) {
      const s = data.settings;
      setForm({ enabled: s.enabled, frequency: s.frequency, localTime: utcToLocal(s.timeUtc), weekday: s.weekday, keep: s.keep, includeDocuments: s.includeDocuments });
    }
  }, [data, form]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['backups'] });

  const save = useMutation({
    mutationFn: () => backupsApi.saveSettings({ ...form!, timeUtc: localToUtc(form!.localTime), localTime: undefined }),
    onSuccess: () => { refresh(); toast({ title: 'Backup schedule saved' }); },
    onError: (e) => toast({ title: 'Could not save', description: errMsg(e), variant: 'destructive' }),
  });
  const runNow = useMutation({
    mutationFn: () => backupsApi.run(),
    onSuccess: () => { refresh(); toast({ title: 'Backup started', description: 'It appears in the list when it is done' }); },
    onError: (e) => toast({ title: 'Could not start the backup', description: errMsg(e), variant: 'destructive' }),
  });
  const remove = useMutation({
    mutationFn: (name: string) => backupsApi.remove(name),
    onSuccess: () => { refresh(); toast({ title: 'Backup deleted' }); },
    onError: (e) => toast({ title: 'Could not delete', description: errMsg(e), variant: 'destructive' }),
  });
  const download = async (name: string, file: 'db' | 'documents') => {
    try { await backupsApi.download(name, file); } catch (e) { toast({ title: 'Download failed', description: errMsg(e), variant: 'destructive' }); }
  };

  if (isLoading || !data || !form) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-dbi-cyan" /></div>;
  }
  const s = data.settings;
  const running = data.running || runNow.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight dbi-gradient-text">Backups</h1>
          <p className="text-dbi-textSecondary">Database and uploaded documents, saved on the server</p>
        </div>
        <Button onClick={() => runNow.mutate()} disabled={running}>
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
          {running ? 'Backup running...' : 'Back up now'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6">
          <p className="text-xs text-dbi-textSecondary">Last backup</p>
          <p className="mt-1 text-lg font-semibold text-dbi-textPrimary">{s.lastRunAt ? when(s.lastRunAt) : 'Never'}</p>
          {s.lastStatus && <Badge className={s.lastStatus === 'FAILED' ? 'mt-2 bg-dbi-critical/15 text-dbi-critical' : 'mt-2 bg-dbi-success/15 text-dbi-success'}>{s.lastStatus === 'FAILED' ? 'Failed' : s.lastStatus === 'RUNNING' ? 'Running' : 'Succeeded'}</Badge>}
          {s.lastStatus === 'FAILED' && s.lastMessage && <p className="mt-2 break-words text-xs text-dbi-critical">{s.lastMessage}</p>}
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-dbi-textSecondary">Next scheduled backup</p>
          <p className="mt-1 text-lg font-semibold text-dbi-textPrimary">{s.enabled && data.nextRunAt ? when(data.nextRunAt) : 'Schedule is off'}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-dbi-textSecondary">Backups kept</p>
          <p className="mt-1 text-lg font-semibold text-dbi-textPrimary">{data.items.length} <span className="text-sm font-normal text-dbi-textSecondary">(newest {s.keep} are kept)</span></p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="flex items-center gap-3">
              <Switch id="bk-enabled" checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
              <Label htmlFor="bk-enabled">Back up automatically</Label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="bk-freq">How often</Label>
                <select id="bk-freq" className={`${field} w-full`} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as 'DAILY' | 'WEEKLY' })}>
                  <option value="DAILY">Every day</option>
                  <option value="WEEKLY">Every week</option>
                </select>
              </div>
              {form.frequency === 'WEEKLY' && (
                <div className="space-y-2">
                  <Label htmlFor="bk-day">Day</Label>
                  <select id="bk-day" className={`${field} w-full`} value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}>
                    {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="bk-time">Time (IST)</Label>
                <input id="bk-time" type="time" className={`${field} w-full`} value={form.localTime} onChange={(e) => setForm({ ...form, localTime: e.target.value })} required />
                <p className="text-xs text-dbi-textSecondary">Server time (UTC): {form.localTime ? localToUtc(form.localTime) : '-'}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bk-keep">Keep the newest</Label>
                <input id="bk-keep" type="number" min={1} max={90} className={`${field} w-full`} value={form.keep} onChange={(e) => setForm({ ...form, keep: Math.min(90, Math.max(1, Number(e.target.value) || 1)) })} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="bk-docs" checked={form.includeDocuments} onCheckedChange={(v) => setForm({ ...form, includeDocuments: v })} />
              <Label htmlFor="bk-docs">Include uploaded documents (bigger backups)</Label>
            </div>
            <Button type="submit" disabled={save.isPending || !form.localTime}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save schedule
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Saved backups ({data.items.length})</CardTitle></CardHeader>
        <CardContent>
          {data.items.length === 0 ? (
            <div className="py-10 text-center text-dbi-textSecondary">
              <HardDriveDownload className="mx-auto mb-3 h-12 w-12" />
              No backup yet. Press "Back up now".
            </div>
          ) : (
            <div className="space-y-2">
              {data.items.map((b) => (
                <div key={b.name} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-dbi-elevated/60 p-3">
                  <div>
                    <p className="font-medium text-dbi-textPrimary">{formatDateTimeIST(b.createdAt)}</p>
                    <p className="text-xs text-dbi-textSecondary">Database {size(b.dbSize)} · Documents {size(b.documentsSize)} · <span className="font-mono">{b.name}</span></p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => download(b.name, 'db')}><Download className="mr-1 h-4 w-4" /> Database</Button>
                    {b.documentsSize != null && <Button size="sm" variant="outline" onClick={() => download(b.name, 'documents')}><Download className="mr-1 h-4 w-4" /> Documents</Button>}
                    <Button size="icon" variant="ghost" title="Delete this backup" aria-label={`Delete backup ${b.name}`} className="text-dbi-critical hover:text-dbi-critical"
                      onClick={() => { if (confirm('Delete this backup for good?')) remove.mutate(b.name); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg border border-dbi-cyan/30 bg-dbi-cyan/5 p-4 text-sm text-dbi-textSecondary">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-dbi-cyan" />
        <ul className="list-disc space-y-1 pl-4">
          <li>Backups are stored on the server in the <span className="font-mono">backups</span> folder. If its disk fails they are lost too, so download one now and then and keep it on another computer.</li>
          <li>They contain every user's password hash and all documents. Keep the downloaded files private.</li>
          <li>The secret keys in the server's <span className="font-mono">.env</span> file are not included. Keep a copy of that file too (it is needed to restore 2FA and mail settings).</li>
          <li>To restore, on the Ubuntu server run <span className="font-mono">./restore.sh backups/{'<name>'}</span>. Restoring replaces the current data, so it is not done from this page.</li>
        </ul>
      </div>
    </div>
  );
}
