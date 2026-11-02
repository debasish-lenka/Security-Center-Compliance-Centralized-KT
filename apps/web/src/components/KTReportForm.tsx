import { useState } from 'react';
import { Loader2, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export interface KTReportValues {
  projectId: string;
  reportDate: string;
  workCompleted: string;
  detailedWork: string;
  completedTasks: string;
  pendingTasks: string;
  challenges: string;
  nextDayPlan: string;
}

export const emptyKTReport = (projectId = ''): KTReportValues => ({
  projectId,
  reportDate: new Date().toISOString().slice(0, 10),
  workCompleted: '',
  detailedWork: '',
  completedTasks: '',
  pendingTasks: '',
  challenges: '',
  nextDayPlan: '',
});

const SECTIONS: { key: keyof KTReportValues; label: string; hint: string; rows: number }[] = [
  { key: 'workCompleted', label: 'Work completed (summary)', hint: 'A short summary of what you finished', rows: 3 },
  { key: 'detailedWork', label: 'Detailed work', hint: 'What you did and how, so someone else can pick it up', rows: 6 },
  { key: 'completedTasks', label: 'Completed tasks', hint: 'One per line', rows: 3 },
  { key: 'pendingTasks', label: 'Pending tasks', hint: 'What is still open', rows: 3 },
  { key: 'challenges', label: 'Challenges / blockers', hint: 'Anything slowing you down', rows: 3 },
  { key: 'nextDayPlan', label: "Next day's plan", hint: 'What you will do next', rows: 3 },
];

// Shared by "New KT report" and "Edit KT report"
export function KTReportForm({
  initial,
  projects,
  lockProject,
  lockDate,
  saving,
  onSave,
  onCancel,
}: {
  initial: KTReportValues;
  projects: { id: string; name: string }[];
  lockProject?: boolean;
  lockDate?: boolean;
  saving: boolean;
  onSave: (values: KTReportValues, status: 'DRAFT' | 'SUBMITTED') => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<KTReportValues>(initial);
  const set = (key: keyof KTReportValues, value: string) => setV((prev) => ({ ...prev, [key]: value }));
  const hasContent = !!(v.workCompleted.trim() || v.detailedWork.trim());
  const canSave = !!v.projectId && !!v.reportDate && hasContent && !saving;

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (canSave) onSave(v, 'DRAFT'); }} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Report details</CardTitle>
          <CardDescription>One report per project per day. Saving again for the same day updates it.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="kt-project">Project *</Label>
            {/* native select: works the same in every browser and inside any layout */}
            <select
              id="kt-project"
              value={v.projectId}
              onChange={(e) => set('projectId', e.target.value)}
              disabled={lockProject || saving}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60"
            >
              <option value="">{projects.length ? 'Select a project' : 'No projects available'}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="kt-date">Report date *</Label>
            <Input id="kt-date" type="date" value={v.reportDate} onChange={(e) => set('reportDate', e.target.value)} disabled={lockDate || saving} required />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What happened</CardTitle>
          <CardDescription>Fill in at least the summary or the detailed work.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {SECTIONS.map((s) => (
            <div key={s.key} className="space-y-2">
              <Label htmlFor={`kt-${s.key}`}>{s.label}</Label>
              <Textarea id={`kt-${s.key}`} rows={s.rows} placeholder={s.hint} value={v[s.key]} onChange={(e) => set(s.key, e.target.value)} disabled={saving} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="outline" disabled={!canSave}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save as draft
        </Button>
        <Button type="button" disabled={!canSave} onClick={() => onSave(v, 'SUBMITTED')}>
          <Send className="mr-2 h-4 w-4" />
          Submit for review
        </Button>
      </div>
    </form>
  );
}
