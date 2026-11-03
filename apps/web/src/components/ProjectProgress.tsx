import { progressTone } from '@/lib/progress-style';

export interface ProgressBreakdown {
  overall: number;
  tasks: { total: number; done: number; inProgress: number };
  users: { userId: string; fullName: string; role: string; total: number; done: number; percent: number }[];
}

const Bar = ({ value, className = 'h-3' }: { value: number; className?: string }) => (
  <div className={`w-full overflow-hidden rounded-full bg-dbi-border ${className}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div className={`h-full rounded-full transition-all ${progressTone(value).bar}`} style={{ width: `${Math.max(value, value > 0 ? 2 : 0)}%` }} />
  </div>
);

// Total progress of the project (from its tasks), with the same figure for every person working on it
export function ProjectProgress({ data }: { data: ProgressBreakdown | null | undefined }) {
  if (!data) return null;
  const tone = progressTone(data.overall);
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p className="text-sm text-dbi-textSecondary">Total progress</p>
            <p className="text-xs text-dbi-textSecondary">
              {data.tasks.total > 0 ? `${data.tasks.done} of ${data.tasks.total} tasks done · ${tone.label}` : 'No tasks yet, it fills in as tasks are completed'}
            </p>
          </div>
          <p className={`text-3xl font-bold ${tone.text}`}>{data.overall}%</p>
        </div>
        <Bar value={data.overall} className="h-4" />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-dbi-textPrimary">Progress by person</p>
        {data.users.length === 0 && <p className="text-sm text-dbi-textSecondary">No team members on this project yet.</p>}
        {data.users.map((u) => (
          <div key={u.userId} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-dbi-textPrimary">{u.fullName}</span>
              <span className="text-xs text-dbi-textSecondary">
                {u.total > 0 ? `${u.done} of ${u.total} tasks` : 'no tasks yet'} · <b className={progressTone(u.percent).text}>{u.percent}%</b>
              </span>
            </div>
            <Bar value={u.percent} className="h-2" />
          </div>
        ))}
        <div className="flex flex-wrap gap-3 pt-1 text-xs text-dbi-textSecondary">
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" /> under 40%</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> 40-69%</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> 70% and above</span>
        </div>
      </div>
    </div>
  );
}
