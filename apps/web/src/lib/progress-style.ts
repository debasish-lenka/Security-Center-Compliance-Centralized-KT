// One colour scale for every progress figure: red under 40%, amber under 70%, green from 70%
export function progressTone(percent: number): { bar: string; text: string; label: string } {
  if (percent >= 70) return { bar: 'bg-emerald-500', text: 'text-emerald-600', label: 'on track' };
  if (percent >= 40) return { bar: 'bg-amber-500', text: 'text-amber-600', label: 'in progress' };
  return { bar: 'bg-rose-500', text: 'text-rose-600', label: 'needs attention' };
}
