// Project cards on the dashboards are coloured by severity (the project's priority),
// so what needs attention first stands out: Critical red, High orange, Medium yellow, Low green.
const STYLES: Record<string, { card: string; badge: string; dot: string; label: string }> = {
  CRITICAL: { card: 'border-l-4 border-l-rose-500 bg-rose-500/10', badge: 'bg-rose-500/20 text-rose-500 border-rose-500/30', dot: 'bg-rose-500', label: 'Critical' },
  HIGH: { card: 'border-l-4 border-l-orange-500 bg-orange-500/10', badge: 'bg-orange-500/20 text-orange-500 border-orange-500/30', dot: 'bg-orange-500', label: 'High' },
  MEDIUM: { card: 'border-l-4 border-l-yellow-500 bg-yellow-500/10', badge: 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30', dot: 'bg-yellow-500', label: 'Medium' },
  LOW: { card: 'border-l-4 border-l-emerald-500 bg-emerald-500/10', badge: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30', dot: 'bg-emerald-500', label: 'Low' },
};

export const priorityStyle = (priority?: string | null) => STYLES[String(priority ?? 'MEDIUM').toUpperCase()] ?? STYLES.MEDIUM;
export const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export const priorityRank = (priority?: string | null) => {
  const i = PRIORITY_ORDER.indexOf(String(priority ?? 'MEDIUM').toUpperCase() as (typeof PRIORITY_ORDER)[number]);
  return i === -1 ? 2 : i;
};
