import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentTimeline } from '@/components/DocumentTimeline';
import { documentsApi, projectsApi } from '@/lib/api';

// One page with everything the whole team uploaded to a project: every image and document one after
// another, each with the name of the person and the date and time under it. A chip narrows it to one person.
export function ProjectUploads() {
  const { id } = useParams<{ id: string }>();
  const [who, setWho] = useState<string | undefined>();

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  });
  const { data: items = [] } = useQuery({
    queryKey: ['documents-timeline', id],
    enabled: !!id,
    queryFn: async () => {
      const res: any = await documentsApi.timeline(id!);
      return (res.data?.items ?? res.data?.data?.items ?? []) as { isImage: boolean; uploader: { id: string; fullName: string } | null }[];
    },
  });

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-dbi-cyan" /></div>;
  const p = project?.data;
  if (!p) return <p className="py-12 text-center text-dbi-textSecondary">Project not found.</p>;

  const byPerson = new Map<string, { name: string; images: number; docs: number }>();
  for (const d of items) {
    if (!d.uploader) continue;
    const row = byPerson.get(d.uploader.id) ?? { name: d.uploader.fullName, images: 0, docs: 0 };
    if (d.isImage) row.images += 1; else row.docs += 1;
    byPerson.set(d.uploader.id, row);
  }
  const images = items.filter((d) => d.isImage).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Back to the project"><Link to={`/projects/${p.id}`}><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">{p.name}: all uploads</h1>
          <p className="text-dbi-textSecondary">{images} images · {items.length - images} documents from {byPerson.size} people, all in one place</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={!who ? 'default' : 'outline'} onClick={() => setWho(undefined)}>Everyone ({items.length})</Button>
        {[...byPerson.entries()].map(([uid, r]) => (
          <Button key={uid} size="sm" variant={who === uid ? 'default' : 'outline'} onClick={() => setWho(uid)}>
            {r.name} ({r.images + r.docs})
          </Button>
        ))}
      </div>

      <DocumentTimeline projects={[{ id: p.id, name: p.name }]} initialProjectId={p.id} hideProjectPicker onlyUserId={who} />
    </div>
  );
}
