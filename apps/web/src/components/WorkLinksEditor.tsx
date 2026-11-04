import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface WorkLink { label: string; url: string }

// The outside tools the work of a project is done in (a Cisco dashboard, ManageEngine...).
// People start their work from these links, so the work can be recorded.
export function WorkLinksEditor({ value, onChange }: { value: WorkLink[]; onChange: (v: WorkLink[]) => void }) {
  const set = (i: number, patch: Partial<WorkLink>) => onChange(value.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  return (
    <div className="md:col-span-2">
      <Label>Work links (where the work is done)</Label>
      <div className="mt-2 space-y-2">
        {value.map((l, i) => (
          <div key={i} className="flex flex-col gap-2 sm:flex-row">
            <Input aria-label={`Work link ${i + 1} name`} value={l.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Name, e.g. Cisco dashboard" className="sm:w-56" maxLength={60} />
            <Input aria-label={`Work link ${i + 1} address`} value={l.url} onChange={(e) => set(i, { url: e.target.value })} placeholder="https://..." className="flex-1" maxLength={500} />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove work link ${i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {value.length < 10 && (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { label: '', url: '' }])}>
            <Plus className="mr-1 h-4 w-4" /> Add a work link
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-dbi-textSecondary">People start their work from these links, and the work is recorded in the project's Work tab.</p>
    </div>
  );
}

// only complete rows are sent
export const cleanLinks = (v: WorkLink[]) => v.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.label && l.url);
