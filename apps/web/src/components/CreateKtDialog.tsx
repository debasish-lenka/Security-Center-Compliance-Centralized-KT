import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { documentsApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

type TypeKey = 'pdf' | 'word' | 'excel' | 'other';
const TYPES: { key: TypeKey; label: string; result: string }[] = [
  { key: 'pdf', label: 'PDF', result: 'merged into one PDF' },
  { key: 'word', label: 'Word', result: 'kept intact in one ZIP' },
  { key: 'excel', label: 'Excel', result: 'kept intact in one ZIP' },
  { key: 'other', label: 'Other files', result: 'kept intact in one ZIP' },
];
const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground';

// "Create KT": pick the project, then Images or Documents. The server puts them together in upload order, each marked
// with who uploaded it and when, and saves the result in the Document Vault as a document made by the person who asked.
export function CreateKtDialog({
  open,
  onOpenChange,
  projects,
  initialProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: { id: string; name: string }[];
  initialProjectId?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const [kind, setKind] = useState<'images' | 'documents'>('images');
  const [types, setTypes] = useState<TypeKey[]>(['pdf', 'word', 'excel', 'other']);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; name: string; files: number; skipped: { name: string; reason: string }[] }[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setProjectId(initialProjectId ?? projects[0]?.id ?? '');
    setKind('images');
    setTypes(['pdf', 'word', 'excel', 'other']);
    setDone(null);
  }, [open, initialProjectId, projects]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['documents-timeline', projectId],
    enabled: open && !!projectId,
    queryFn: async () => {
      const res: any = await documentsApi.timeline(projectId);
      return (res.data?.items ?? res.data?.data?.items ?? []) as { group?: string; generated?: boolean }[];
    },
  });
  // KT files made earlier are never packed again, so they are not counted either
  const count = (g: string) => items.filter((d) => d.group === g && !d.generated).length;
  const imageCount = count('image');
  const docCount = (k: TypeKey) => count(k);
  const chosenDocs = types.reduce((n, t) => n + docCount(t), 0);
  const nothing = kind === 'images' ? imageCount === 0 : chosenDocs === 0;

  const create = async () => {
    setBusy(true);
    try {
      const res: any = await documentsApi.createKtPack(projectId, { kind, types: kind === 'documents' ? types : undefined });
      const made = (res.data?.data?.items ?? res.data?.items ?? []) as any[];
      setDone(made);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents-timeline'] });
      toast({ title: 'KT file created', description: `${made.length} new ${made.length === 1 ? 'file is' : 'files are'} in the Document Vault` });
    } catch (e: any) {
      toast({ title: 'Could not create the KT file', description: e?.response?.data?.error?.message || 'Please try again', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const optionClass = (on: boolean) => `flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors ${on ? 'border-dbi-cyan bg-dbi-cyan/10' : 'border-dbi-border hover:bg-dbi-elevated/50'}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create KT</DialogTitle>
          <DialogDescription>Put a project's files together in the order they were uploaded, with each person's name and the date under their file. The result is saved in the Document Vault under your name.</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3">
            {done.map((d) => (
              <div key={d.id} className="rounded-lg bg-dbi-elevated/60 p-3">
                <p className="font-medium text-dbi-textPrimary">{d.name}</p>
                <p className="text-xs text-dbi-textSecondary">{d.files} files put together</p>
                {d.skipped?.length > 0 && <p className="mt-1 text-xs text-dbi-amber">Left out: {d.skipped.map((s) => s.name).join(', ')} ({d.skipped[0].reason})</p>}
              </div>
            ))}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button onClick={() => { onOpenChange(false); navigate(`/documents?projectId=${projectId}`); }}>Open the Document Vault</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="kt-project" className="text-sm font-medium text-dbi-textSecondary">Project *</label>
              <select id="kt-project" className={selectClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-dbi-textSecondary">What should be put together? *</p>
              <button type="button" className={optionClass(kind === 'images')} onClick={() => setKind('images')} aria-pressed={kind === 'images'}>
                <ImageIcon className="h-6 w-6 text-dbi-cyan" />
                <span className="flex-1">
                  <span className="block font-medium text-dbi-textPrimary">Images {isLoading ? '' : `(${imageCount})`}</span>
                  <span className="block text-xs text-dbi-textSecondary">All pictures of all people, top to bottom in one PDF</span>
                </span>
              </button>
              <button type="button" className={optionClass(kind === 'documents')} onClick={() => setKind('documents')} aria-pressed={kind === 'documents'}>
                <FileText className="h-6 w-6 text-dbi-warning" />
                <span className="flex-1">
                  <span className="block font-medium text-dbi-textPrimary">Documents</span>
                  <span className="block text-xs text-dbi-textSecondary">Choose the file types below; one file is made for each type</span>
                </span>
              </button>
            </div>

            {kind === 'documents' && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-dbi-textSecondary">File types</p>
                {TYPES.map((t) => (
                  <label key={t.key} className={`flex items-center gap-3 rounded-md px-2 py-1.5 ${docCount(t.key) === 0 ? 'opacity-50' : 'cursor-pointer hover:bg-dbi-elevated'}`}>
                    <input type="checkbox" className="h-4 w-4" disabled={docCount(t.key) === 0} checked={types.includes(t.key) && docCount(t.key) > 0}
                      onChange={() => setTypes((cur) => (cur.includes(t.key) ? cur.filter((x) => x !== t.key) : [...cur, t.key]))} />
                    <span className="flex-1 text-sm text-dbi-textPrimary">{t.label} ({docCount(t.key)})</span>
                    <span className="text-xs text-dbi-textSecondary">{t.result}</span>
                  </label>
                ))}
                <p className="text-xs text-dbi-textSecondary">Word and Excel files cannot be merged into one Word or Excel file without damaging them, so they are bundled in a ZIP in upload order.</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={create} disabled={busy || !projectId || nothing}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {nothing ? 'Nothing to put together' : 'Create KT file'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
