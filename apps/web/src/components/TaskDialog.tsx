import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { projectsApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60';

// Creates a task in a project. Used from the project page (project fixed) and from My Assignments (pick a project).
export function TaskDialog({
  open,
  onOpenChange,
  projects = [],
  fixedProjectId,
  defaultAssigneeId,
  onCreated,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects?: { id: string; name: string }[];
  fixedProjectId?: string;
  defaultAssigneeId?: string;
  onCreated: () => void;
  task?: any | null; // set to edit that task instead of creating a new one
}) {
  const [projectId, setProjectId] = useState(fixedProjectId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId ?? '');
  const [status, setStatus] = useState('TODO');
  const [saving, setSaving] = useState(false);

  // Reset every time the dialog opens
  useEffect(() => {
    if (!open) return;
    setProjectId(fixedProjectId ?? '');
    setTitle('');
    setDescription('');
    setPriority('MEDIUM');
    setDueDate('');
    setAssigneeId(defaultAssigneeId ?? '');
    setStatus('TODO');
    if (task) {
      setTitle(task.title ?? '');
      setDescription(task.description ?? '');
      setPriority(task.priority ?? 'MEDIUM');
      setDueDate(task.dueDate ? String(task.dueDate).slice(0, 10) : '');
      setAssigneeId(task.assigneeId ?? task.assignee?.id ?? '');
      setStatus(task.status ?? 'TODO');
    }
  }, [open, fixedProjectId, defaultAssigneeId, task]);

  // Only members of the project can be assigned
  const { data: members = [] } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => ((await projectsApi.get(projectId)).data?.members ?? []) as any[],
    enabled: open && !!projectId,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        assigneeId: assigneeId || null,
        dueDate: dueDate || null,
      };
      if (task) await projectsApi.updateTask(projectId, task.id, ['TODO', 'IN_PROGRESS'].includes(task.status) ? { ...body, status } : body);
      else await projectsApi.createTask(projectId, body);
      toast({ title: task ? 'Task updated' : 'Task created' });
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      toast({ title: task ? 'Could not update the task' : 'Could not create task', description: err?.response?.data?.error?.message || 'Please try again', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>{task ? 'Change anything; every change is written to the audit log.' : 'Tasks belong to a project and can be assigned to a project member.'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {!fixedProjectId && (
            <div className="space-y-2">
              <Label htmlFor="task-project">Project *</Label>
              <select
                id="task-project"
                required
                className={selectClass}
                value={projectId}
                onChange={(e) => { setProjectId(e.target.value); setAssigneeId(''); }}
              >
                <option value="">{projects.length ? 'Select a project' : 'No projects available'}</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="task-title">Title *</Label>
            <Input id="task-title" required maxLength={255} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-desc">Description</Label>
            <textarea
              id="task-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="task-priority">Priority</Label>
              <select id="task-priority" className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due">Due date</Label>
              <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-assignee">Assignee</Label>
              <select id="task-assignee" className={selectClass} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={!projectId}>
                <option value="">Unassigned</option>
                {members.map((m: any) => <option key={m.userId} value={m.userId}>{m.user?.fullName}</option>)}
              </select>
            </div>
          </div>
          {task && ['TODO', 'IN_PROGRESS'].includes(task.status) && (
            <div className="space-y-2">
              <Label htmlFor="task-status">Status</Label>
              <select id="task-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                {[['TODO', 'To do'], ['IN_PROGRESS', 'In progress']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">A task is finished with "Submit for review" and verified by the project owner or lead.</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !projectId || !title.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {task ? 'Save changes' : 'Create task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
