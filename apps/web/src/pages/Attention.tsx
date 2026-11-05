import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BellRing, CheckCircle2, Loader2, Send, ShieldCheck, UserCog } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { attentionApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { ReassignTaskDialog } from '@/components/ReassignTaskDialog';

const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';

const KINDS: Record<string, { title: string; hint: string; cls: string }> = {
  WAITING_VERIFICATION: { title: 'Waiting for your verification', hint: 'Submitted by the person. Open the project and press Verify.', cls: 'bg-dbi-amber/15 text-dbi-amber' },
  OVERDUE: { title: 'Overdue', hint: 'The due date has passed and the task is not finished.', cls: 'bg-dbi-critical/15 text-dbi-critical' },
  BLOCKED: { title: 'Blocked', hint: 'The person said what is stopping them. Help them, or give the task to someone else.', cls: 'bg-dbi-critical/15 text-dbi-critical' },
  STALLED: { title: 'Not moving', hint: 'No sign of work for several days (the number of days is set by an admin in Reminders).', cls: 'bg-dbi-warning/20 text-dbi-warning' },
  NOT_STARTED: { title: 'Has not started the project', hint: 'Added to the project but never pressed Start project.', cls: 'bg-dbi-warning/20 text-dbi-warning' },
};

export function Attention() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['attention'], queryFn: async () => (await attentionApi.list()).data.data as any, refetchInterval: 60_000, staleTime: 0, refetchOnMount: 'always' });
  const [busy, setBusy] = useState<string | null>(null);
  const [reassign, setReassign] = useState<any | null>(null);

  const nudge = async (it: any) => {
    const key = `${it.kind}${it.taskId ?? it.projectId}${it.personId}`;
    setBusy(key);
    try { await attentionApi.nudge({ userId: it.personId, projectId: it.projectId, taskId: it.taskId }); toast({ title: 'Reminder sent', description: `${it.personName} has been told.` }); }
    catch (e) { toast({ title: 'Reminder not sent', description: errMsg(e), variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  if (q.isLoading) return <div className="h-40 animate-pulse rounded-lg bg-dbi-elevated" />;
  if (q.isError || !q.data) return <p className="text-sm text-dbi-textSecondary">This list could not be loaded.</p>;
  const { counts, items, settings } = q.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-7 w-7 text-dbi-amber" />
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">Needs attention</h1>
          <p className="text-dbi-textSecondary">What the projects you own or lead need from you today</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(KINDS).map(([k, v]) => (
          <Badge key={k} className={v.cls} data-testid={`count-${k}`}>{v.title}: {counts[k] ?? 0}</Badge>
        ))}
      </div>

      {items.length === 0 ? (
        <Card><CardContent className="flex items-center gap-3 py-8 text-dbi-textSecondary"><CheckCircle2 className="h-6 w-6 text-dbi-success" />Nothing needs your attention right now.</CardContent></Card>
      ) : (
        Object.entries(KINDS).map(([kind, meta]) => {
          const rows = items.filter((i: any) => i.kind === kind);
          if (rows.length === 0) return null;
          return (
            <Card key={kind}>
              <CardHeader>
                <CardTitle className="text-base">{meta.title} ({rows.length})</CardTitle>
                <p className="text-xs text-dbi-textSecondary">{meta.hint}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {rows.map((it: any) => {
                  const key = `${it.kind}${it.taskId ?? it.projectId}${it.personId}`;
                  return (
                    <div key={key} className="flex flex-wrap items-center gap-3 rounded-lg bg-dbi-elevated/60 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-dbi-textPrimary">{it.taskTitle ?? `Start "${it.projectName}"`}</p>
                        <p className="text-xs text-dbi-textSecondary">
                          <Link className="underline" to={`/projects/${it.projectId}`}>{it.projectName}</Link>
                          {it.personName ? ` · ${it.personName}` : ''} · {it.days} day{it.days === 1 ? '' : 's'}
                          {kind === 'OVERDUE' ? ' late' : kind === 'WAITING_VERIFICATION' ? ' waiting' : kind === 'BLOCKED' ? ' blocked' : kind === 'STALLED' ? ' without progress' : ' since added'}
                        </p>
                        {it.detail && <p className="mt-1 text-xs text-dbi-critical">{it.detail}</p>}
                      </div>
                      {it.canVerify && <Button size="sm" asChild><Link to={`/projects/${it.projectId}?tab=work`}><ShieldCheck className="mr-1 h-4 w-4" />Verify</Link></Button>}
                      {it.canNudge && (
                        <Button size="sm" variant="outline" onClick={() => nudge(it)} disabled={busy === key}>
                          {busy === key ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <BellRing className="mr-1 h-4 w-4" />}Remind
                        </Button>
                      )}
                      {it.taskId && kind !== 'WAITING_VERIFICATION' && (
                        <Button size="sm" variant="outline" onClick={() => setReassign({ projectId: it.projectId, task: { id: it.taskId, title: it.taskTitle, assignee: it.personId ? { id: it.personId, fullName: it.personName } : null } })}>
                          <UserCog className="mr-1 h-4 w-4" />Give to someone else
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" asChild><Link to={`/projects/${it.projectId}${it.taskId ? '?tab=work' : '?tab=team'}`}><Send className="mr-1 h-4 w-4" />Open</Link></Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })
      )}

      <p className="text-xs text-dbi-textSecondary">"Not moving" counts after {settings.stalledAfterDays} day(s) and "has not started" after {settings.notStartedAfterDays} day(s). An admin can change these on the Reminders page. A reminder to the same person about the same thing can be sent once a day.</p>

      {reassign && (
        <ReassignTaskDialog projectId={reassign.projectId} task={reassign.task} open onOpenChange={(o) => { if (!o) setReassign(null); }} onDone={() => qc.invalidateQueries({ queryKey: ['attention'] })} />
      )}
    </div>
  );
}
