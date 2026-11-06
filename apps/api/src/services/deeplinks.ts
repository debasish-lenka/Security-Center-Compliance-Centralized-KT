import type { PrismaClient } from '@prisma/client';

// Where a click on "something that happened" should go: the thing itself, not a list page.
//   task            -> its project, Tasks tab, that task selected and its history open
//   document        -> that project's documents with the document's details open
//   document_version-> the same, for the document the version belongs to
//   work_session    -> the project's Work Log tab
//   project / kt_report -> the project / the report
// An item that was deleted (or that this person cannot see) gets no link (null) rather than a page that says "not found".
export type Ref = { type: string | null | undefined; id: string | null | undefined };

export async function resolveLinks(prisma: PrismaClient, refs: Ref[]): Promise<{ link: (type: string | null | undefined, id: string | null | undefined) => string | null; projectOf: (type: string | null | undefined, id: string | null | undefined) => string | null }> {
  const ids = (t: string) => [...new Set(refs.filter((r) => r.type === t && r.id).map((r) => r.id!))];
  const [tasks, docs, versions, sessions] = await Promise.all([
    ids('task').length ? prisma.task.findMany({ where: { id: { in: ids('task') } }, select: { id: true, projectId: true } }) : [],
    ids('document').length ? prisma.projectDocument.findMany({ where: { id: { in: ids('document') } }, select: { id: true, projectId: true } }) : [],
    ids('document_version').length ? prisma.documentVersion.findMany({ where: { id: { in: ids('document_version') } }, select: { id: true, documentId: true, document: { select: { projectId: true } } } }) : [],
    ids('work_session').length ? prisma.workSession.findMany({ where: { id: { in: ids('work_session') } }, select: { id: true, projectId: true } }) : [],
  ]);
  const project = new Map<string, string>();
  const doc = new Map<string, string>();
  for (const t of tasks) project.set(`task:${t.id}`, t.projectId);
  for (const d of docs) { project.set(`document:${d.id}`, d.projectId); doc.set(`document:${d.id}`, d.id); }
  for (const v of versions) { project.set(`document_version:${v.id}`, v.document.projectId); doc.set(`document_version:${v.id}`, v.documentId); }
  for (const s of sessions) project.set(`work_session:${s.id}`, s.projectId);

  const projectOf = (type: string | null | undefined, id: string | null | undefined): string | null => {
    if (!type || !id) return null;
    if (type === 'project') return id;
    return project.get(`${type}:${id}`) ?? null;
  };
  const link = (type: string | null | undefined, id: string | null | undefined): string | null => {
    if (!type || !id) return null;
    const pid = projectOf(type, id);
    switch (type) {
      case 'project': return `/projects/${id}`;
      case 'kt_report': return `/kt-reports/${id}`;
      case 'task': return pid ? `/projects/${pid}?tab=work&task=${id}` : null;
      case 'document': return pid ? `/documents?projectId=${pid}&doc=${id}` : null;
      case 'document_version': return pid ? `/documents?projectId=${pid}&doc=${doc.get(`document_version:${id}`)}` : null;
      case 'work_session': return pid ? `/projects/${pid}?tab=session` : null;
      default: return null;
    }
  };
  return { link, projectOf };
}
