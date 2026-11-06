import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MultiOption { value: string; label: string; count?: number; hint?: string }

// A drop-down where several choices can be ticked at once. Shows how many are ticked; has its own search when the list is long.
export function MultiSelect({ label, options, value, onChange, className, width = 'w-64' }: {
  label: string; options: MultiOption[]; value: string[]; onChange: (v: string[]) => void; className?: string; width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const shown = useMemo(() => options.filter((o) => !q || `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q.toLowerCase())), [options, q]);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div ref={box} className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn('flex h-10 items-center gap-2 rounded-md border bg-dbi-elevated px-3 text-sm text-dbi-textPrimary hover:border-dbi-cyan/60', value.length ? 'border-dbi-cyan/60' : 'border-dbi-border')}
      >
        <span>{label}</span>
        {value.length > 0 && <span className="rounded-full bg-dbi-cyan px-1.5 text-xs font-semibold text-dbi-background">{value.length}</span>}
        <ChevronDown className="ml-auto h-4 w-4 text-dbi-textSecondary" />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" className={cn('absolute left-0 z-40 mt-1 max-w-[calc(100vw-2rem)] rounded-lg border border-dbi-border bg-dbi-surface p-2 shadow-xl', width)}>
          {options.length > 8 && (
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}...`} className="mb-2 h-9 w-full rounded-md border border-dbi-border bg-dbi-elevated px-2 text-sm text-dbi-textPrimary outline-none focus:border-dbi-cyan" />
          )}
          <div className="max-h-64 overflow-y-auto">
            {shown.length === 0 && <p className="px-2 py-3 text-center text-sm text-dbi-textSecondary">Nothing found</p>}
            {shown.map((o) => {
              const on = value.includes(o.value);
              return (
                <button key={o.value} type="button" role="option" aria-selected={on} onClick={() => toggle(o.value)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-dbi-textPrimary hover:bg-dbi-elevated">
                  <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-dbi-cyan bg-dbi-cyan text-dbi-background' : 'border-dbi-border')}>{on && <Check className="h-3 w-3" />}</span>
                  <span className="min-w-0 flex-1 truncate">{o.label}{o.hint && <span className="ml-1 text-xs text-dbi-textSecondary">{o.hint}</span>}</span>
                  {o.count !== undefined && <span className="text-xs text-dbi-textSecondary">{o.count}</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-dbi-border pt-2 text-xs">
            <button type="button" className="text-dbi-textSecondary hover:text-dbi-textPrimary" onClick={() => onChange([])} disabled={value.length === 0}>Clear</button>
            <button type="button" className="text-dbi-cyan hover:underline" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
