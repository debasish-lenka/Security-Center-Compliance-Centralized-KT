import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownUp, Download, FileText, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { documentsApi } from '@/lib/api';

interface Item {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  category: string;
  version: number;
  createdAt: string;
  description: string | null;
  isImage: boolean;
  previewUrl: string | null;
  uploader: { id: string; fullName: string } | null;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const size = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// Everything uploaded to one project, one below the other. Images are shown in full; under every file
// the uploader's name and the date and time are printed automatically, and a new upload joins the bottom.
export function DocumentTimeline({
  projects,
  initialProjectId,
  hideProjectPicker = false,
  onlyUserId,
}: {
  projects: { id: string; name: string }[];
  initialProjectId?: string;
  hideProjectPicker?: boolean; // the project is already fixed by the page
  onlyUserId?: string; // show one person's uploads only
}) {
  const [projectId, setProjectId] = useState(initialProjectId ?? '');
  const [newestFirst, setNewestFirst] = useState(false);
  const [zoom, setZoom] = useState<Item | null>(null);

  useEffect(() => { if (!projectId && projects.length > 0) setProjectId(projects[0].id); }, [projects, projectId]);

  const { data, isLoading } = useQuery({
    queryKey: ['documents-timeline', projectId],
    enabled: !!projectId,
    refetchInterval: 20000, // what others upload shows up by itself
    queryFn: async () => {
      const res: any = await documentsApi.timeline(projectId);
      return (res.data?.items ?? res.data?.data?.items ?? []) as Item[];
    },
  });
  const all = (data ?? []).filter((d) => !onlyUserId || d.uploader?.id === onlyUserId);
  const items = newestFirst ? [...all].reverse() : all;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {hideProjectPicker ? <span /> : (
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-72 bg-dbi-elevated border-dbi-border"><SelectValue placeholder="Choose a project" /></SelectTrigger>
          <SelectContent>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        )}
        <Button variant="outline" size="sm" onClick={() => setNewestFirst((v) => !v)}>
          <ArrowDownUp className="mr-2 h-4 w-4" /> {newestFirst ? 'Newest first' : 'Oldest first'}
        </Button>
      </div>

      {isLoading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-dbi-cyan" /></div>}
      {!isLoading && projectId && items.length === 0 && (
        <Card><CardContent className="py-12 text-center text-dbi-textSecondary">Nothing has been uploaded to this project yet.</CardContent></Card>
      )}

      <div className="space-y-5">
        {items.map((d) => (
          <Card key={d.id} className="overflow-hidden">
            {d.isImage && d.previewUrl ? (
              <button type="button" className="block w-full bg-dbi-elevated" onClick={() => setZoom(d)} aria-label={`Enlarge ${d.name}`}>
                <img src={d.previewUrl} alt={d.name} loading="lazy" className="mx-auto max-h-[460px] w-auto max-w-full object-contain" />
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-dbi-elevated/60 p-5">
                <FileText className="h-9 w-9 text-dbi-cyan" />
                <p className="text-sm text-dbi-textSecondary">{d.mimeType} · {size(d.size)}</p>
              </div>
            )}
            <CardContent className="space-y-1 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-dbi-textPrimary">{d.name}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{d.category.replace(/_/g, ' ')}</Badge>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={`/api/v1/projects/${projectId}/documents/${d.id}/file`} target="_blank" rel="noopener noreferrer"><Download className="mr-1 h-4 w-4" /> Open</a>
                  </Button>
                </div>
              </div>
              {d.description && <p className="text-sm text-dbi-textSecondary">{d.description}</p>}
              {/* added automatically from the upload */}
              <p className="text-sm text-dbi-textPrimary">
                Uploaded by <b>{d.uploader?.fullName ?? 'Unknown'}</b> <span className="text-dbi-textSecondary">· {when(d.createdAt)}</span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {zoom && zoom.previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4" onClick={() => setZoom(null)}>
          <Button variant="ghost" size="icon" className="absolute right-4 top-4 text-white" aria-label="Close" onClick={() => setZoom(null)}><X className="h-6 w-6" /></Button>
          <img src={zoom.previewUrl} alt={zoom.name} className="max-h-[85vh] max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
          <p className="mt-3 text-sm text-white">{zoom.name} · Uploaded by {zoom.uploader?.fullName ?? 'Unknown'} · {when(zoom.createdAt)}</p>
        </div>
      )}
    </div>
  );
}
