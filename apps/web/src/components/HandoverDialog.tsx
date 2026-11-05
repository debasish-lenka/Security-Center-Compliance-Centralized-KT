import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { handoverApi, usersApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';
const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground';

// Admin: when somebody leaves, their open work goes to someone else in one step
export function HandoverDialog({ user, open, onOpenChange, onDone }: { user: { id: string; fullName: string }; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [to, setTo] = useState('');
  const [withProjects, setWithProjects] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const preview = useQuery({ queryKey: ['handover-preview', user.id], enabled: open, staleTime: 0, refetchOnMount: 'always', queryFn: async () => (await handoverApi.preview(user.id)).data.data });
  const people = useQuery({ queryKey: ['handover-people'], enabled: open, queryFn: async () => { const body = (await usersApi.directory({ limit: '200' })).data; return (body?.data?.items ?? body?.items ?? []) as { id: string; fullName: string; email: string }[]; } });
  const d = preview.data;
  const nothing = d && d.openTasks === 0 && d.ownedProjects.length === 0 && d.ledProjects.length === 0;

  const go = async () => {
    setBusy(true); setProblem(null);
    try {
      const r = (await handoverApi.handOver(user.id, { toUserId: to, includeProjects: withProjects })).data.data;
      toast({ title: 'Work handed over', description: `${r.tasks} task(s), ${r.ownedProjects} project(s) as owner and ${r.ledProjects} as lead now belong to ${r.to}.` });
      setTo(''); onOpenChange(false); onDone();
    } catch (e) { setProblem(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setTo(''); setProblem(null); } onOpenChange(o); }}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hand over the work of {user.fullName}</DialogTitle>
          <DialogDescription>For when someone leaves or changes work. Their open tasks and projects go to one person, in one step, and it is written in the history. Nothing is deleted.</DialogDescription>
        </DialogHeader>
        {preview.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
        {d && (
          <div className="space-y-2 rounded-md border border-dbi-border p-3 text-sm">
            <p><b>{d.openTasks}</b> open task(s) (to do, in progress or blocked) will move.</p>
            {d.tasks.length > 0 && <ul className="ml-4 list-disc text-xs text-dbi-textSecondary">{d.tasks.map((t: any) => <li key={t.id}>{t.title} ({t.project})</li>)}{d.openTasks > d.tasks.length && <li>and {d.openTasks - d.tasks.length} more</li>}</ul>}
            <p><b>{d.ownedProjects.length}</b> project(s) they own{d.ownedProjects.length > 0 && <span className="text-xs text-dbi-textSecondary">: {d.ownedProjects.map((p: any) => p.name).join(', ')}</span>}</p>
            <p><b>{d.ledProjects.length}</b> project(s) they lead{d.ledProjects.length > 0 && <span className="text-xs text-dbi-textSecondary">: {d.ledProjects.map((p: any) => p.name).join(', ')}</span>}</p>
            {d.tasksWaitingVerification > 0 && <p className="text-xs text-dbi-textSecondary">{d.tasksWaitingVerification} task(s) they submitted stay with them; a lead can still verify those.</p>}
          </div>
        )}
        {nothing && <p className="text-sm text-dbi-textSecondary">This person has no open work to hand over.</p>}
        {d && !nothing && (
          <div className="space-y-3">
            <div>
              <label htmlFor="handover-to" className="text-sm font-medium text-dbi-textPrimary">Give it to</label>
              <select id="handover-to" className={`${selectClass} mt-1`} value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Choose a person...</option>
                {(people.data ?? []).filter((p) => p.id !== user.id).map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.email})</option>)}
              </select>
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={withProjects} onChange={(e) => setWithProjects(e.target.checked)} />
              <span>Also move the projects they own or lead. The new person becomes the owner or lead; {user.fullName} stays on as a contributor.</span>
            </label>
          </div>
        )}
        {problem && <p role="alert" className="rounded-md border border-dbi-critical/40 bg-dbi-critical/10 p-2 text-sm text-dbi-critical">{problem}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={go} disabled={busy || !to || !!nothing}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Hand over</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
