import { PRIORITY_ORDER, priorityStyle } from '@/lib/priority-style';

// Colour key for the project cards
export function PriorityLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-dbi-textSecondary" aria-label="Colour key">
      {PRIORITY_ORDER.map((p) => (
        <span key={p} className="flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${priorityStyle(p).dot}`} /> {priorityStyle(p).label}
        </span>
      ))}
    </div>
  );
}
