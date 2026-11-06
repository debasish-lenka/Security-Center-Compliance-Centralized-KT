import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { documentsApi, uploadPolicyApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const CATEGORIES = [['TECHNICAL', 'Technical'], ['COMPLIANCE', 'Compliance'], ['DESIGN', 'Design'], ['MEETING_NOTES', 'Meeting notes'], ['KT_REPORT', 'KT report'], ['OTHER', 'Other']];

// Upload a file straight into one project, from the project's own page. The project is already chosen; the file lands in the
// project's documents and so also in the Document Vault under that project (the vault lists every project's documents).
export function ProjectUploadDialog({ projectId, projectName, open, onOpenChange }: { projectId: string; projectName: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState('OTHER');
  const [busy, setBusy] = useState(false);
  const { data: policy } = useQuery({ queryKey: ['upload-policy'], staleTime: 60 * 60_000, queryFn: async () => (await uploadPolicyApi.get()).data.data as { maxMb: number; extensions: string[]; accept: string; groups: { label: string; extensions: string[] }[]; virusScan?: boolean } });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>The file is saved in this project and also appears in the Document Vault under it.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget; // read before the first await
            const file = (new FormData(form).get('file') as File) ?? null;
            if (!file || !file.name) { toast({ title: 'Error', description: 'Please select a file', variant: 'destructive' }); return; }
            const ending = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
            if (policy && !policy.extensions.includes(ending)) {
              toast({ title: 'This type of file is not allowed', description: ending ? `.${ending} files cannot be uploaded. See the list under the file box.` : 'The file has no ending (like .pdf).', variant: 'destructive' });
              return;
            }
            if (policy && file.size > policy.maxMb * 1024 * 1024) { toast({ title: 'The file is too large', description: `The limit is ${policy.maxMb} MB.`, variant: 'destructive' }); return; }
            setBusy(true);
            try {
              await documentsApi.upload({ file, projectId, name: file.name, description: '', type: file.type || 'OTHER', category });
              toast({ title: 'Success', description: 'Document uploaded successfully' });
              form.reset(); setCategory('OTHER'); onOpenChange(false);
              for (const key of ['documents', 'documents-timeline', 'project-documents', 'project']) qc.invalidateQueries({ queryKey: [key] });
            } catch (err: any) {
              toast({ title: 'Upload failed', description: err?.response?.data?.error?.message || 'Please try again', variant: 'destructive' });
            } finally { setBusy(false); }
          }}
        >
          <div>
            <span className="text-sm font-medium text-dbi-textSecondary">Project</span>
            <div className="mt-1 flex h-10 w-full items-center rounded-md border border-input bg-background px-3 text-sm text-foreground">{projectName}</div>
          </div>
          <div>
            <label htmlFor="pu-category" className="text-sm font-medium text-dbi-textSecondary">Category</label>
            <select id="pu-category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground">
              {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pu-file" className="text-sm font-medium text-dbi-textSecondary">File *</label>
            <input id="pu-file" type="file" name="file" required accept={policy?.accept} disabled={busy} className="mt-1 block w-full text-sm text-dbi-textPrimary bg-dbi-elevated border-dbi-border rounded-lg p-2" />
            <p className="mt-1 text-xs text-dbi-textSecondary">
              Up to {policy?.maxMb ?? 50} MB. Allowed: {policy ? policy.groups.map((g) => `${g.label} (${g.extensions.map((e) => `.${e}`).join(' ')})`).join('; ') : '...'}. Programs, scripts and web pages are not accepted.{policy?.virusScan ? ' Every file is checked for viruses before it is saved.' : ''}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Uploading...' : 'Upload'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
