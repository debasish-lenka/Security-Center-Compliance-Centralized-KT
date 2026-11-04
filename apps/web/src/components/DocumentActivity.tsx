import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { documentsApi } from '@/lib/api';
import { formatDateTimeIST } from '@/lib/utils';

interface Props { documentId: string }

// Recent opens, downloads and changes of one document. The server only answers
// for the owner, project lead, reviewer and super admin, so for others nothing is shown.
export function DocumentActivity({ documentId }: Props) {
  const { data } = useQuery({
    queryKey: ['document-activity', documentId],
    retry: false,
    queryFn: async () => (await documentsApi.getDocumentActivity(documentId)).data?.data as {
      totalAccesses: number;
      uniqueUsers: number;
      actionCounts: Record<string, number>;
      recentEvents: { id: string; action: string; createdAt: string; ipAddress: string | null; user: { fullName: string } | null }[];
    },
  });
  if (!data) return null;
  return (
    <div className="rounded-lg border border-dbi-border p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-dbi-textPrimary"><Eye className="h-4 w-4 text-dbi-cyan" /> Access activity</div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-dbi-textSecondary">
        <span>{data.totalAccesses} events</span>
        <span>{data.uniqueUsers} {data.uniqueUsers === 1 ? 'person' : 'people'}</span>
        {Object.entries(data.actionCounts).map(([k, v]) => <span key={k}>{k.toLowerCase()}: {v}</span>)}
      </div>
      {data.recentEvents.length === 0 ? (
        <p className="text-sm text-dbi-textSecondary">Nobody has opened this document yet.</p>
      ) : (
        <div className="max-h-44 space-y-1 overflow-y-auto">
          {data.recentEvents.map((e) => (
            <div key={e.id} className="flex justify-between gap-3 rounded bg-dbi-elevated/60 px-3 py-1.5 text-sm">
              <span className="text-dbi-textPrimary">{e.user?.fullName ?? 'Unknown'} <span className="text-dbi-textSecondary">{e.action.toLowerCase()}</span></span>
              <span className="text-xs text-dbi-textSecondary">{formatDateTimeIST(e.createdAt)}{e.ipAddress ? ` · ${e.ipAddress}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
