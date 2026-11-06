import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: { value: number; label: string };
  accentColor?: string;
  onClick?: () => void;
}

export function MetricCard({ title, value, icon, trend, accentColor = 'cyan', onClick }: MetricCardProps) {
  // Full class names so Tailwind can see them (dynamic `bg-dbi-${x}` strings are never generated)
  const ACCENTS = {
    cyan: { text: 'text-dbi-cyan', chip: 'bg-dbi-cyan/10 ring-dbi-cyan/20', bar: 'from-dbi-cyan' },
    emerald: { text: 'text-dbi-emerald', chip: 'bg-dbi-emerald/10 ring-dbi-emerald/20', bar: 'from-dbi-emerald' },
    amber: { text: 'text-dbi-amber', chip: 'bg-dbi-amber/10 ring-dbi-amber/20', bar: 'from-dbi-amber' },
    rose: { text: 'text-dbi-critical', chip: 'bg-dbi-critical/10 ring-dbi-critical/20', bar: 'from-dbi-critical' },
    violet: { text: 'text-dbi-purple', chip: 'bg-dbi-purple/10 ring-dbi-purple/20', bar: 'from-dbi-purple' },
    slate: { text: 'text-dbi-textSecondary', chip: 'bg-dbi-textSecondary/10 ring-dbi-textSecondary/20', bar: 'from-dbi-textSecondary' },
    indigo: { text: 'text-dbi-indigo', chip: 'bg-dbi-indigo/10 ring-dbi-indigo/20', bar: 'from-dbi-indigo' },
  } as const;
  const accent = ACCENTS[accentColor as keyof typeof ACCENTS] ?? ACCENTS.cyan;
  const trendColors = { [accentColor]: accent.text } as Record<string, string>;

  return (
    <Card className={cn('relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg', onClick && 'cursor-pointer')}
      onClick={onClick}
      {...(onClick ? { role: 'link', tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } } : {})}
    >
      <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r to-transparent', accent.bar)} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-dbi-textSecondary truncate">{title}</p>
            <p className="mt-1 text-3xl font-bold text-dbi-textPrimary">{value}</p>
            {trend && (
              <div className="mt-2 flex items-center gap-1">
                {trend.value > 0 ? (
                  <TrendingUp className={cn('h-4 w-4', trendColors[accentColor])} />
                ) : trend.value < 0 ? (
                  <TrendingDown className={cn('h-4 w-4', trendColors[accentColor])} />
                ) : (
                  <Minus className={cn('h-4 w-4', trendColors[accentColor])} />
                )}
                <span className={cn('text-sm font-medium', trendColors[accentColor])}>
                  {trend.value > 0 ? '+' : ''}{trend.value}% {trend.label}
                </span>
              </div>
            )}
          </div>
          <div className={cn('p-3 rounded-xl ring-1', accent.chip)}>
            <div className={cn('text-2xl', accent.text)}>{icon}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}