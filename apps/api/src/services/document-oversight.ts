import type { FastifyInstance } from 'fastify';

export const MIN_REASON = 5;

// An ADMIN may change any document, but must say why. Everyone else is unaffected.
export function adminReasonError(role: string, reason: unknown): string | null {
  if (role !== 'ADMIN') return null;
  return typeof reason === 'string' && reason.trim().length >= MIN_REASON
    ? null
    : `Give a reason (at least ${MIN_REASON} characters) for changing this document`;
}

const show = (v: unknown) => {
  if (v === null || v === undefined || v === '') return 'empty';
  const t = Array.isArray(v) ? v.join(', ') || 'empty' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return t.length > 60 ? `${t.slice(0, 57)}...` : t;
};

// { field: { from, to } } for the fields that really changed
export function diffFields(before: Record<string, any>, after: Record<string, any>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) out[k] = { from: before[k] ?? null, to: after[k] };
  }
  return out;
}

export const describeChanges = (c: Record<string, { from: unknown; to: unknown }>) =>
  Object.entries(c).map(([k, v]) => `${k}: ${show(v.from)} -> ${show(v.to)}`).join('; ');

interface Tell {
  actorId: string;
  kind: 'CREATED' | 'EDITED' | 'DELETED';
  docId: string;
  docName: string;
  projectId: string;
  detail?: string;
  reason?: string | null;
}

// Every create, edit and delete of a document is reported to all active super admins (except the actor)
export async function tellSuperAdmins(app: FastifyInstance, t: Tell) {
  try {
    const [actor, project, admins] = await Promise.all([
      app.prisma.profile.findUnique({ where: { id: t.actorId }, select: { fullName: true, role: true } }),
      app.prisma.project.findUnique({ where: { id: t.projectId }, select: { name: true } }),
      app.prisma.profile.findMany({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: t.actorId } }, select: { id: true } }),
    ]);
    if (admins.length === 0) return;
    const verb = { CREATED: 'added', EDITED: 'changed', DELETED: 'deleted' }[t.kind];
    const message = [
      `${actor?.fullName ?? 'Someone'} ${verb} "${t.docName}"${project ? ` in ${project.name}` : ''}.`,
      t.detail ? `Changes: ${t.detail}.` : '',
      t.reason ? `Reason: ${t.reason}` : '',
    ].filter(Boolean).join(' ').slice(0, 1000);
    await app.prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: 'DOCUMENT_CHANGED' as const,
        title: `Document ${verb}`,
        message,
        // a deleted document has no page any more, so link to its project
        resourceType: t.kind === 'DELETED' ? 'project' : 'document',
        resourceId: t.kind === 'DELETED' ? t.projectId : t.docId,
      })),
    });
  } catch (e) {
    app.log.warn({ err: e }, 'could not notify super admins about a document change');
  }
}
