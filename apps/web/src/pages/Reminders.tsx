import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { remindersApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { formatDateTimeIST } from '@/lib/utils';

interface Settings { enabled: boolean; stalledAfterDays: number; notStartedAfterDays: number; escalateAfterDays: number; lastRunAt: string | null; lastSummary: string | null }
const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';

// Admin sets after how many days quiet work is flagged (default 7). The check runs about once a day.
export function Reminders() {
  const qc = useQueryClient();
  const workQ = useQuery({ queryKey: ['work-settings'], queryFn: async () => (await remindersApi.getWork()).data.data as { requireScreenShare: boolean } });
  const setRequire = async (v: boolean) => {
    try { await remindersApi.saveWork({ requireScreenShare: v }); await qc.invalidateQueries({ queryKey: ['work-settings'] }); toast({ title: v ? 'Screen sharing is now required to start work' : 'Screen sharing is now optional' }); }
    catch (e) { toast({ title: 'Not saved', description: errMsg(e), variant: 'destructive' }); }
  };
  const q = useQuery({ queryKey: ['reminders'], queryFn: async () => (await remindersApi.get()).data.data as Settings });
  const [form, setForm] = useState<{ enabled: boolean; stalled: string; notStarted: string; escalate: string } | null>(null);
  const [busy, setBusy] = useState<'save' | 'run' | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (q.data && !form) setForm({ enabled: q.data.enabled, stalled: String(q.data.stalledAfterDays), notStarted: String(q.data.notStartedAfterDays), escalate: String(q.data.escalateAfterDays) });
  }, [q.data, form]);

  if (!form) return <div className="h-40 animate-pulse rounded-lg bg-dbi-elevated" />;

  const n = (v: string) => Math.round(Number(v));
  const valid = [form.stalled, form.notStarted, form.escalate].every((v) => Number.isFinite(n(v)) && n(v) >= 1 && n(v) <= 90);
  const body = () => ({ enabled: form.enabled, stalledAfterDays: n(form.stalled), notStartedAfterDays: n(form.notStarted), escalateAfterDays: n(form.escalate) });

  const save = async () => {
    setBusy('save');
    try { await remindersApi.save(body()); toast({ title: 'Reminder settings saved' }); await qc.invalidateQueries({ queryKey: ['reminders'] }); }
    catch (e) { toast({ title: 'Not saved', description: errMsg(e), variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const run = async () => {
    setBusy('run');
    try {
      await remindersApi.save(body()); // run with what is on the screen
      const r = await remindersApi.runNow();
      const s = r.data.data.summary;
      setResult(`${s.tasks} stalled task(s) and ${s.notStarted} assignment(s) not started were found. ${s.reminded} reminder(s) sent, ${s.leadsTold} lead notice(s), ${s.escalated} admin alert(s).`);
      await qc.invalidateQueries({ queryKey: ['reminders'] });
    } catch (e) { toast({ title: 'Check failed', description: errMsg(e), variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const days = (id: string, label: string, hint: string, value: string, set: (v: string) => void) => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <Input id={id} type="number" min={1} max={90} value={value} onChange={(e) => set(e.target.value)} className="w-28" />
        <span className="text-sm text-dbi-textSecondary">days</span>
      </div>
      <p className="mt-1 text-xs text-dbi-textSecondary">{hint}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BellRing className="h-7 w-7 text-dbi-primary" />
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">Reminders and work recording</h1>
          <p className="text-dbi-textSecondary">What happens when someone's work stops moving</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Work recording: screen sharing</CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="work-require" className="text-sm">{workQ.data?.requireScreenShare ? 'Required' : 'Optional'}</Label>
            <Switch id="work-require" checked={!!workQ.data?.requireScreenShare} disabled={!workQ.data} onCheckedChange={setRequire} aria-label="Screen sharing required to start work" />
          </div>
        </CardHeader>
        <CardContent className="text-sm text-dbi-textSecondary">
          When Required, nobody can press Start work in a project's Work Log until they share their whole screen (a single window or tab is not accepted). Work without full screen sharing is marked Partial or No evidence in the work sessions table and in the generated KT.
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Check for work that is not moving</CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="rem-enabled" className="text-sm">{form.enabled ? 'On' : 'Off'}</Label>
            <Switch id="rem-enabled" checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} aria-label="Reminders on or off" />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-dbi-textSecondary">
            Once a day the system looks at every open task and every project a person was given. If there has been no sign of work (the task was not changed, nothing done on the project, no work session) for the days below, the person is reminded and the project owner / lead is told. A task marked Blocked is left alone.
          </p>
          <div className="grid gap-5 md:grid-cols-3">
            {days('rem-stalled', 'Task has not moved', 'Remind the person and tell the project lead after this many days without progress.', form.stalled, (v) => setForm({ ...form, stalled: v }))}
            {days('rem-notstarted', 'Person has not started the project', 'A person added to a project who still has not pressed Start project after this many days.', form.notStarted, (v) => setForm({ ...form, notStarted: v }))}
            {days('rem-escalate', 'Then alert the admins', 'This many more days after the lead was told, the admins get an alert too.', form.escalate, (v) => setForm({ ...form, escalate: v }))}
          </div>
          {!valid && <p className="text-sm text-dbi-critical">Each value must be a whole number from 1 to 90.</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={!valid || busy !== null}>{busy === 'save' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
            <Button variant="outline" onClick={run} disabled={!valid || busy !== null}>{busy === 'run' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save and run the check now</Button>
            <span className="self-center text-xs text-dbi-textSecondary">This saves the days, then sends the real reminders now.</span>
          </div>
          {result && <p className="rounded-md border border-dbi-border p-3 text-sm text-dbi-textPrimary">{result}</p>}
          <p className="text-xs text-dbi-textSecondary">{q.data?.lastRunAt ? `Last check: ${formatDateTimeIST(q.data.lastRunAt)}. ${q.data.lastSummary ?? ''}.` : 'The check has not run yet.'}</p>
          <p className="text-xs text-dbi-textSecondary">The same reminder is not sent again within the "task has not moved" number of days. Reminders appear in each person's Notifications.</p>
        </CardContent>
      </Card>
    </div>
  );
}
