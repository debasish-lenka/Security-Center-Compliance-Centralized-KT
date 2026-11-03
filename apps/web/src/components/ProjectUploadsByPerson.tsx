import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { documentsApi } from '@/lib/api';
import { CreateKtDialog } from '@/components/CreateKtDialog';

interface Item {
  id: string; name: string; mimeType: string; size: number; createdAt: string; isImage: boolean; previewUrl: string | null;
  uploader: { id: string; fullName: string } | null;
}
const ROLE: Record<string, string> = { OWNER: 'Owner (lead)', LEAD: 'Manager', CONTRIBUTOR: 'Team member', REVIEWER: 'Reviewer', VIEWER: 'Viewer' };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const kb = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// The project's uploads grouped by the person who made them: how many images and documents each one added,
// and a click opens that person's own files.
export function ProjectUploadsByPerson({ projectId, members }: { projectId: string; members: { userId: string; role: string; user?: { fullName: string } }[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const [ktOpen, setKtOpen] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['documents-timeline', projectId],
    refetchInterval: 20000,
    queryFn: async () => {
      const res: any = await documentsApi.timeline(projectId);
      return (res.data?.items ?? res.data?.data?.items ?? []) as Item[];
    },
  });

  // everyone on the project, plus anyone who uploaded without being a member (an admin, for example)
  const people = new Map<string, { userId: string; fullName: string; role: string | null; images: Item[]; docs: Item[] }>();
  for (const m of members) people.set(m.userId, { userId: m.userId, fullName: m.user?.fullName ?? 'Unknown', role: m.role, images: [], docs: [] });
  for (const d of items) {
    if (!d.uploader) continue;
    if (!people.has(d.uploader.id)) people.set(d.uploader.id, { userId: d.uploader.id, fullName: d.uploader.fullName, role: null, images: [], docs: [] });
    (d.isImage ? people.get(d.uploader.id)!.images : people.get(d.uploader.id)!.docs).push(d);
  }
  const rows = [...people.values()].sort((a, b) => b.images.length + b.docs.length - (a.images.length + a.docs.length) || a.fullName.localeCompare(b.fullName));
  const totalImages = items.filter((d) => d.isImage).length;
  const totalDocs = items.length - totalImages;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Uploads by person</CardTitle>
          <p className="mt-1 text-sm text-dbi-textSecondary">{totalImages} images · {totalDocs} documents from {rows.filter((r) => r.images.length + r.docs.length > 0).length} people</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setKtOpen(true)}>Create KT</Button>
          <Button onClick={() => navigate(`/projects/${projectId}/uploads`)} disabled={items.length === 0}>Show all images and documents</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-dbi-cyan" /></div>}
        {!isLoading && rows.length === 0 && <p className="py-6 text-center text-sm text-dbi-textSecondary">No one is on this project yet.</p>}
        {rows.map((r) => {
          const total = r.images.length + r.docs.length;
          const isOpen = open === r.userId;
          return (
            <div key={r.userId} className="rounded-lg bg-dbi-elevated/60">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : r.userId)}
                className="flex w-full flex-wrap items-center gap-3 p-3 text-left"
              >
                {isOpen ? <ChevronDown className="h-4 w-4 text-dbi-textSecondary" /> : <ChevronRight className="h-4 w-4 text-dbi-textSecondary" />}
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-dbi-cyan/15 text-sm font-medium text-dbi-cyan">{r.fullName.charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-dbi-textPrimary">{r.fullName}</span>
                  <span className="block text-xs text-dbi-textSecondary">{r.role ? ROLE[r.role] ?? r.role : 'Not on the team'}</span>
                </span>
                <span className="flex items-center gap-4 text-sm text-dbi-textSecondary">
                  <span className="flex items-center gap-1"><ImageIcon className="h-4 w-4 text-dbi-cyan" /> {r.images.length} images</span>
                  <span className="flex items-center gap-1"><FileText className="h-4 w-4 text-dbi-warning" /> {r.docs.length} documents</span>
                </span>
              </button>

              {isOpen && (
                <div className="space-y-4 border-t border-dbi-border p-3">
                  {total === 0 && <p className="text-sm text-dbi-textSecondary">{r.fullName} has not uploaded anything yet.</p>}
                  {r.images.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-dbi-textSecondary">Images ({r.images.length})</p>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {r.images.map((d) => (
                          <a key={d.id} href={d.previewUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-dbi-border bg-dbi-background">
                            <img src={d.previewUrl ?? ''} alt={d.name} loading="lazy" className="h-36 w-full object-contain bg-dbi-elevated" />
                            <span className="block p-2">
                              <span className="block truncate text-sm text-dbi-textPrimary">{d.name}</span>
                              <span className="block text-xs text-dbi-textSecondary">{when(d.createdAt)}</span>
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.docs.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-dbi-textSecondary">Documents ({r.docs.length})</p>
                      <div className="space-y-1">
                        {r.docs.map((d) => (
                          <a key={d.id} href={`/api/v1/projects/${projectId}/documents/${d.id}/file`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-dbi-elevated">
                            <span className="truncate text-sm text-dbi-textPrimary">{d.name}</span>
                            <span className="shrink-0 text-xs text-dbi-textSecondary">{kb(d.size)} · {when(d.createdAt)}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
      <CreateKtDialog open={ktOpen} onOpenChange={setKtOpen} projects={[{ id: projectId, name: 'This project' }]} initialProjectId={projectId} />
    </Card>
  );
}
