import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { projectsApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { formatDate, formatDateTimeIST } from '@/lib/utils';
import { TaskDialog } from '@/components/TaskDialog';

const STATUSES = [
  ['TODO', 'To do'],
  ['IN_PROGRESS', 'In progress'],
  ['REVIEW', 'In review'],
  ['BLOCKED', 'Blocked'],
  ['DONE', 'Done'],
] as const;

const PRIORITY_STYLE: Record<string, string> = {
  LOW: 'bg-slate-500/15 text-slate-400',
  MEDIUM: 'bg-dbi-cyan/15 text-dbi-cyan',
  HIGH: 'bg-dbi-amber/15 text-dbi-amber',
  CRITICAL: 'bg-dbi-critical/15 text-dbi-critical',
};

const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';

// Tasks and milestones of one project (the "Work" tab)
export function ProjectWork({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [taskOpen, setTaskOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [msName, setMsName] = useState('');
  const [msDue, setMsDue] = useState('');

  const tasksKey = ['project-tasks', projectId];
  const msKey = ['project-milestones', projectId];

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: tasksKey,
    queryFn: async () => ((await projectsApi.getTasks(projectId, { limit: '100' })).data?.items ?? []) as any[],
  });
  const { data: milestones = [] } = useQuery({
    queryKey: msKey,
    queryFn: async () => ((await projectsApi.getMilestones(projectId)).data?.data ?? []) as any[],
  });

  const refreshTasks = () => {
    queryClient.invalidateQueries({ queryKey: tasksKey });
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('assignments') });
  };

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => { await projectsApi.updateTask(projectId, id, { status }); },
    onSuccess: refreshTasks,
    onError: (e) => toast({ title: 'Could not update task', description: errMsg(e), variant: 'destructive' }),
  });
  const removeTask = useMutation({
    mutationFn: async (id: string) => { await projectsApi.deleteTask(projectId, id); },
    onSuccess: refreshTasks,
    onError: (e) => toast({ title: 'Could not delete task', description: errMsg(e), variant: 'destructive' }),
  });
  const addMilestone = useMutation({
    mutationFn: async () => { await projectsApi.createMilestone(projectId, { name: msName.trim(), dueDate: msDue }); },
    onSuccess: () => { setMsName(''); setMsDue(''); queryClient.invalidateQueries({ queryKey: msKey }); },
    onError: (e) => toast({ title: 'Could not add milestone', description: errMsg(e), variant: 'destructive' }),
  });
  const completeMilestone = useMutation({
    mutationFn: async (id: string) => { await projectsApi.completeMilestone(projectId, id); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: msKey }),
    onError: (e) => toast({ title: 'Could not complete milestone', description: errMsg(e), variant: 'destructive' }),
  });
  const removeMilestone = useMutation({
    mutationFn: async (id: string) => { await projectsApi.deleteMilestone(projectId, id); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: msKey }),
    onError: (e) => toast({ title: 'Could not delete milestone', description: errMsg(e), variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Tasks ({tasks.length})</CardTitle>
          <Button size="sm" onClick={() => setTaskOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New task
          </Button>
        </CardHeader>
        <CardContent>
          {tasksLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-dbi-cyan" /></div>
          ) : tasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-dbi-textSecondary">No tasks yet. Add the first one.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((t: any) => (
                <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-dbi-elevated/60 p-3">
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium text-dbi-textPrimary ${t.status === 'DONE' ? 'line-through opacity-60' : ''}`}>{t.title}</p>
                    <p className="text-xs text-dbi-textSecondary">
                      {t.assignee?.fullName ?? 'Unassigned'}{t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ''}
                    </p>
                  </div>
                  <Badge className={PRIORITY_STYLE[t.priority] ?? ''}>{t.priority}</Badge>
                  <select
                    aria-label="Task status"
                    value={t.status}
                    onChange={(e) => setStatus.mutate({ id: t.id, status: e.target.value })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  >
                    {STATUSES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                  <Button variant="ghost" size="icon" aria-label={`Edit ${t.title}`} title="Edit" onClick={() => setEditing(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete task"
                    className="text-dbi-critical hover:text-dbi-critical"
                    onClick={() => { if (confirm(`Delete "${t.title}"?`)) removeTask.mutate(t.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Milestones ({milestones.length})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => { e.preventDefault(); if (msName.trim() && msDue) addMilestone.mutate(); }}
          >
            <Input className="min-w-[200px] flex-1" placeholder="Milestone name" value={msName} onChange={(e) => setMsName(e.target.value)} aria-label="Milestone name" />
            <Input className="w-44" type="date" value={msDue} onChange={(e) => setMsDue(e.target.value)} aria-label="Milestone due date" />
            <Button type="submit" variant="outline" disabled={!msName.trim() || !msDue || addMilestone.isPending}>
              <Plus className="mr-2 h-4 w-4" /> Add
            </Button>
          </form>
          {milestones.length === 0 ? (
            <p className="text-center text-sm text-dbi-textSecondary">No milestones yet.</p>
          ) : (
            <div className="space-y-2">
              {milestones.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg bg-dbi-elevated/60 p-3">
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium text-dbi-textPrimary ${m.completedAt ? 'line-through opacity-60' : ''}`}>{m.name}</p>
                    <p className="text-xs text-dbi-textSecondary">Due {formatDate(m.dueDate)}{m.completedAt ? ` · completed ${formatDateTimeIST(m.completedAt)}` : ''}</p>
                  </div>
                  {!m.completedAt && (
                    <Button variant="outline" size="sm" onClick={() => completeMilestone.mutate(m.id)}>
                      <Check className="mr-1 h-4 w-4" /> Complete
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete milestone"
                    className="text-dbi-critical hover:text-dbi-critical"
                    onClick={() => { if (confirm(`Delete "${m.name}"?`)) removeMilestone.mutate(m.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TaskDialog open={taskOpen} onOpenChange={setTaskOpen} fixedProjectId={projectId} onCreated={refreshTasks} />
      <TaskDialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }} fixedProjectId={projectId} task={editing} onCreated={refreshTasks} />
    </div>
  );
}
