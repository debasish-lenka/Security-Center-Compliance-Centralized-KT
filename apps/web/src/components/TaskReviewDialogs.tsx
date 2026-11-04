import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { taskFlowApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { formatDateTimeIST } from '@/lib/utils';

const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

const EVIDENCE: Record<string, { label: string; cls: string }> = {
  FULL: { label: 'Full evidence', cls: 'bg-dbi-success/20 text-dbi-success' },
  PARTIAL: { label: 'Partial evidence', cls: 'bg-dbi-warning/20 text-dbi-warning' },
  NONE: { label: 'No evidence', cls: 'bg-dbi-critical/20 text-dbi-critical' },
};
const toolText = (s: { toolCheck: string | null; ocrSeen?: number; ocrChecked?: number }) => {
  const n = s.ocrChecked ? ` (${s.ocrSeen ?? 0}/${s.ocrChecked})` : '';
  return s.toolCheck === 'SEEN' ? `Tool seen${n}` : s.toolCheck === 'LOW' ? `Tool rarely seen${n}` : s.toolCheck === 'NOT_SEEN' ? `Tool NOT seen${n}` : s.toolCheck === 'NO_LINK' ? 'No tool set' : 'Not checked yet';
};

// One piece of proof, as the person pointed to it when submitting
export function EvidenceLine({ projectId, e }: { projectId: string; e: any }) {
  if (e.type === 'DOCUMENT') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <FileText className="h-4 w-4 shrink-0 text-dbi-textSecondary" />
        <span className="min-w-0 flex-1 truncate text-dbi-textPrimary">{e.name}</span>
        <span className="shrink-0 text-xs text-dbi-textSecondary">{formatDateTimeIST(e.createdAt)}</span>
        <a href={`/api/v1/projects/${projectId}/documents/${e.id}/open`} target="_blank" rel="noopener noreferrer" title="Open in a new tab" className="text-dbi-cyan"><ExternalLink className="h-4 w-4" /></a>
      </div>
    );
  }
  const ev = EVIDENCE[e.evidence] ?? EVIDENCE.NONE;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Clock className="h-4 w-4 shrink-0 text-dbi-textSecondary" />
      <span className="text-dbi-textPrimary">Work session {formatDateTimeIST(e.startedAt)}, {mins(e.minutes)}{e.linkLabel ? ` in ${e.linkLabel}` : ''}</span>
      <Badge className={ev.cls}>{ev.label}</Badge>
      <Badge variant="secondary">{toolText(e)}</Badge>
      <span className="text-xs text-dbi-textSecondary">{e.shots} screenshot{e.shots === 1 ? '' : 's'}</span>
    </div>
  );
}

// ---- the person submits their task, pointing to proof ----
export function SubmitTaskDialog({ projectId, task, open, onOpenChange, onDone }: { projectId: string; task: any | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [summary, setSummary] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['task-evidence', projectId], enabled: open, staleTime: 0, refetchOnMount: 'always', queryFn: async () => (await taskFlowApi.evidenceOptions(projectId)).data.data as { sessions: any[]; documents: any[] } });

  const reset = () => { setSummary(''); setPicked({}); setProblem(null); };
  const chosen = Object.entries(picked).filter(([, v]) => v).map(([k]) => ({ type: (k.startsWith('s:') ? 'SESSION' : 'DOCUMENT') as 'SESSION' | 'DOCUMENT', id: k.slice(2) }));
  const submit = async () => {
    setBusy(true); setProblem(null);
    try {
      await taskFlowApi.submit(projectId, task.id, { summary: summary.trim(), evidence: chosen });
      toast({ title: 'Submitted for verification', description: 'The project owner or lead has been told.' });
      reset(); onOpenChange(false); onDone();
    } catch (e) { setProblem(errMsg(e)); } finally { setBusy(false); }
  };
  const box = (k: string) => <input type="checkbox" className="h-4 w-4" checked={!!picked[k]} onChange={(ev) => setPicked({ ...picked, [k]: ev.target.checked })} />;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit "{task?.title}" for verification</DialogTitle>
          <DialogDescription>Say what you did and point to the proof. The project owner or lead checks it; only then is the task done.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="submit-summary" className="text-sm font-medium text-dbi-textPrimary">What did you do?</label>
            <Textarea id="submit-summary" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={3000} placeholder="For example: checked the 12 site health scores, two sites are below 80, raised tickets for both." className="mt-1" />
          </div>
          <div>
            <p className="text-sm font-medium text-dbi-textPrimary">Proof ({chosen.length} selected)</p>
            {q.isLoading && <Loader2 className="mt-2 h-4 w-4 animate-spin" />}
            {q.data && (
              <div className="mt-2 space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-dbi-textSecondary">Your finished work sessions</p>
                  {q.data.sessions.length === 0 && <p className="text-sm text-dbi-textSecondary">None yet. Start work in the Work Log tab and stop it when you finish.</p>}
                  <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                    {q.data.sessions.map((s) => (
                      <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-dbi-elevated">
                        {box(`s:${s.id}`)}
                        <EvidenceLine projectId={projectId} e={{ ...s, type: 'SESSION' }} />
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-dbi-textSecondary">Documents you uploaded</p>
                  {q.data.documents.length === 0 && <p className="text-sm text-dbi-textSecondary">None yet. Upload in the Document Vault.</p>}
                  <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                    {q.data.documents.map((d) => (
                      <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-dbi-elevated">
                        {box(`d:${d.id}`)}
                        <div className="min-w-0 flex-1"><EvidenceLine projectId={projectId} e={{ ...d, type: 'DOCUMENT' }} /></div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          {problem && <p role="alert" className="rounded-md border border-dbi-critical/40 bg-dbi-critical/10 p-2 text-sm text-dbi-critical">{problem}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || summary.trim().length < 10}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit for verification</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- the lead verifies: sees what was submitted and the proof ----
export function VerifyTaskDialog({ projectId, task, open, onOpenChange, onDone }: { projectId: string; task: any | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['task-reviews', projectId, task?.id], enabled: open && !!task, staleTime: 0, refetchOnMount: 'always', queryFn: async () => (await taskFlowApi.reviews(projectId, task.id)).data.data.items as any[] });
  const sub = [...(q.data ?? [])].reverse().find((r) => r.kind === 'SUBMITTED');

  const decide = async (decision: 'APPROVE' | 'REJECT') => {
    setBusy(decision); setProblem(null);
    try {
      await taskFlowApi.verify(projectId, task.id, { decision, note: note.trim() || undefined });
      toast({ title: decision === 'APPROVE' ? 'Task verified: done' : 'Sent back for changes' });
      setNote(''); onOpenChange(false); onDone();
    } catch (e) { setProblem(errMsg(e)); } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setNote(''); setProblem(null); } onOpenChange(o); }}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Verify "{task?.title}"</DialogTitle>
          <DialogDescription>{task?.assignee?.fullName} says this task is finished. Check what they submitted before you approve it.</DialogDescription>
        </DialogHeader>
        {q.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
        {sub && (
          <div className="space-y-3">
            <div className="rounded-md border border-dbi-border p-3">
              <p className="text-xs text-dbi-textSecondary">Submitted {formatDateTimeIST(sub.createdAt)} by {sub.by}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-dbi-textPrimary">{sub.note}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-dbi-textPrimary">Proof ({sub.evidence.length})</p>
              {sub.evidence.length === 0 && <p className="text-sm text-dbi-warning">No proof was attached.</p>}
              <div className="mt-1 space-y-2">{sub.evidence.map((e: any) => <EvidenceLine key={`${e.type}${e.id}`} projectId={projectId} e={e} />)}</div>
              <p className="mt-2 text-xs text-dbi-textSecondary">A work session's screenshots can be opened from the Work Log tab (View).</p>
            </div>
            <div>
              <label htmlFor="verify-note" className="text-sm font-medium text-dbi-textPrimary">Your note (needed when you send it back)</label>
              <Textarea id="verify-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} className="mt-1" />
            </div>
            {problem && <p role="alert" className="rounded-md border border-dbi-critical/40 bg-dbi-critical/10 p-2 text-sm text-dbi-critical">{problem}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="destructive" onClick={() => decide('REJECT')} disabled={busy !== null || note.trim().length < 5}>{busy === 'REJECT' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send back</Button>
          <Button onClick={() => decide('APPROVE')} disabled={busy !== null || !sub}>{busy === 'APPROVE' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Approve: done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- "I am stuck" ----
export function BlockTaskDialog({ projectId, task, open, onOpenChange, onDone }: { projectId: string; task: any | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setProblem(null);
    try { await taskFlowApi.block(projectId, task.id, reason.trim()); toast({ title: 'Marked as blocked', description: 'The project owner or lead has been told why.' }); setReason(''); onOpenChange(false); onDone(); }
    catch (e) { setProblem(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setReason(''); setProblem(null); } onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Blocked: "{task?.title}"</DialogTitle>
          <DialogDescription>Tell the lead what is stopping this task, for example no access or waiting for someone. Reminders pause while it is blocked.</DialogDescription>
        </DialogHeader>
        <Textarea aria-label="Why is it blocked" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="No access to the Cisco dashboard yet." />
        {problem && <p role="alert" className="rounded-md border border-dbi-critical/40 bg-dbi-critical/10 p-2 text-sm text-dbi-critical">{problem}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={go} disabled={busy || reason.trim().length < 5}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Mark as blocked</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- everything that happened to the task ----
const KIND: Record<string, string> = { SUBMITTED: 'Submitted for verification', APPROVED: 'Verified: done', CHANGES_REQUESTED: 'Sent back for changes', BLOCKED: 'Marked as blocked', UNBLOCKED: 'Unblocked' };
export function TaskHistoryDialog({ projectId, task, open, onOpenChange }: { projectId: string; task: any | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = useQuery({ queryKey: ['task-reviews', projectId, task?.id], enabled: open && !!task, staleTime: 0, refetchOnMount: 'always', queryFn: async () => (await taskFlowApi.reviews(projectId, task.id)).data.data.items as any[] });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>History of "{task?.title}"</DialogTitle>
          <DialogDescription>Every submit, verify, send back and block, with who did it and when (IST).</DialogDescription>
        </DialogHeader>
        {q.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
        {q.data && q.data.length === 0 && <p className="text-sm text-dbi-textSecondary">Nothing yet.</p>}
        <ul className="space-y-3">
          {q.data?.map((r) => (
            <li key={r.id} className="rounded-md border border-dbi-border p-3 text-sm">
              <p className="font-medium text-dbi-textPrimary">{KIND[r.kind] ?? r.kind}{r.selfVerified ? ' (their own task)' : ''}</p>
              <p className="text-xs text-dbi-textSecondary">{r.by} · {formatDateTimeIST(r.createdAt)}</p>
              {r.note && <p className="mt-1 whitespace-pre-wrap text-dbi-textPrimary">{r.note}</p>}
              {r.evidence?.length > 0 && <div className="mt-2 space-y-1">{r.evidence.map((e: any) => <EvidenceLine key={`${e.type}${e.id}`} projectId={projectId} e={e} />)}</div>}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
