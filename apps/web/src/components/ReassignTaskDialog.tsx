import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { projectsApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';
const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground';

// The owner / a lead / an admin gives an open or blocked task to another member of the project
export function ReassignTaskDialog({ projectId, task, open, onOpenChange, onDone }: {
  projectId: string; task: { id: string; title: string; assignee?: { id: string; fullName: string } | null } | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void;
}) {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['project-members-reassign', projectId], enabled: open, staleTime: 0, refetchOnMount: 'always',
    queryFn: async () => ((await projectsApi.getMembers(projectId)).data?.data ?? []) as any[],
  });
  const people = (q.data ?? []).filter((m) => m.user?.status === 'ACTIVE' && m.role !== 'VIEWER' && m.userId !== task?.assignee?.id);

  const go = async () => {
    if (!task || !to) return;
    setBusy(true); setProblem(null);
    try {
      await projectsApi.updateTask(projectId, task.id, { assigneeId: to });
      toast({ title: 'Task given to someone else', description: 'Both people have been told.' });
      setTo(''); onOpenChange(false); onDone();
    } catch (e) { setProblem(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setTo(''); setProblem(null); } onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Give "{task?.title}" to someone else</DialogTitle>
          <DialogDescription>Now with {task?.assignee?.fullName ?? 'nobody'}. A blocked task starts again as To do. This is written in the task's history.</DialogDescription>
        </DialogHeader>
        {q.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
        {q.data && (
          <select aria-label="Give the task to" className={selectClass} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose a person...</option>
            {people.map((m) => <option key={m.userId} value={m.userId}>{m.user.fullName} ({m.role.toLowerCase()})</option>)}
          </select>
        )}
        {q.data && people.length === 0 && <p className="text-sm text-dbi-textSecondary">There is nobody else on this project. Add people in the Team tab first.</p>}
        {problem && <p role="alert" className="rounded-md border border-dbi-critical/40 bg-dbi-critical/10 p-2 text-sm text-dbi-critical">{problem}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={go} disabled={busy || !to}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Give the task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
