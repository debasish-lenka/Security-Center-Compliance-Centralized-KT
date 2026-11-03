import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Play, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { projectsApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';

export interface StartInfo {
  started: number;
  total: number;
  startedBy: { userId: string; fullName: string; at: string }[];
  waiting: string[];
  iStarted: boolean | null;
}
export interface LastUpdate { by: string; text: string; at: string }

// "2 of 5 started" and the latest change; with a Start button for a person who has not started yet.
// `compact` is the one-line version for tables and cards.
export function ProjectStartPanel({
  projectId,
  info,
  last,
  compact = false,
  chips = false,
}: {
  projectId: string;
  info: StartInfo | null | undefined;
  last: LastUpdate | null | undefined;
  compact?: boolean;
  chips?: boolean; // the team's names, green once started, amber while waiting
}) {
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: async () => { await projectsApi.start(projectId); },
    onSuccess: () => {
      // everything that shows this project reads the new state
      queryClient.invalidateQueries();
      toast({ title: 'Project started', description: 'It is now marked as started for you, and your team can see it' });
    },
    onError: (e: any) => toast({ title: 'Could not start the project', description: e?.response?.data?.error?.message || 'Please try again', variant: 'destructive' }),
  });

  if (!info) return null;
  const mustStart = info.iStarted === false;
  const allStarted = info.total > 0 && info.started === info.total;
  const lastLine = last ? `Latest update: ${last.by} ${last.text} · ${formatDate(last.at, 'relative')}` : 'No updates yet';

  const noTeam = info.total === 0;

  if (chips) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-dbi-textPrimary">
          {noTeam ? 'No team members selected yet' : `Team: ${info.started} of ${info.total} started`}
        </p>
        {!noTeam && (
          <div className="flex flex-wrap gap-1">
            {info.startedBy.slice(0, 8).map((s) => (
              <span key={s.userId} title={`Started ${formatDate(s.at, 'relative')}`} className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600">✓ {s.fullName}</span>
            ))}
            {info.waiting.slice(0, 8).map((n) => (
              <span key={n} title="Has not started yet" className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600">{n}</span>
            ))}
            {info.total > 16 && <span className="text-xs text-dbi-textSecondary">+{info.total - 16} more</span>}
          </div>
        )}
        <p className="line-clamp-1 text-xs text-dbi-textSecondary">{lastLine}</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-0.5 text-xs text-dbi-textSecondary">
        <p className={mustStart ? 'font-medium text-dbi-amber' : ''}>
          {noTeam ? 'No team members selected yet' : `${mustStart ? 'Waiting for you to start · ' : ''}${info.started} of ${info.total} started`}
        </p>
        <p className="line-clamp-1">{lastLine}</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-4 ${mustStart ? 'border-dbi-amber/50 bg-dbi-amber/5' : 'border-dbi-border'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {allStarted ? <CheckCircle2 className="h-5 w-5 text-dbi-success" /> : <UserCheck className="h-5 w-5 text-dbi-cyan" />}
          <div>
            <p className="font-medium text-dbi-textPrimary">{noTeam ? 'No team members selected for this project yet' : `${info.started} of ${info.total} team members started this project`}</p>
            <p className="text-xs text-dbi-textSecondary">{lastLine}</p>
          </div>
        </div>
        {mustStart && (
          <Button onClick={() => start.mutate()} disabled={start.isPending}>
            {start.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Start project
          </Button>
        )}
      </div>
      {(info.startedBy.length > 0 || info.waiting.length > 0) && (
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-dbi-textSecondary">Started</p>
            {info.startedBy.length === 0 && <p className="text-dbi-textSecondary">No one yet</p>}
            {info.startedBy.map((s) => (
              <p key={s.userId} className="text-dbi-textPrimary">{s.fullName} <span className="text-xs text-dbi-textSecondary">· {formatDate(s.at, 'relative')}</span></p>
            ))}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-dbi-textSecondary">Not started yet</p>
            {info.waiting.length === 0 && <p className="text-dbi-textSecondary">Everyone has started</p>}
            {info.waiting.map((n) => <p key={n} className="text-dbi-textPrimary">{n}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}
