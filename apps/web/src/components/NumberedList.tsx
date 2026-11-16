import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Stored as plain text, one point per line and numbered ("1. first\n2. second"), so every screen that shows the text shows the numbers.
const strip = (line: string) => line.replace(/^\s*\d+\s*[.)]\s*/, '');
export const toLines = (text: string): string[] => {
  const lines = (text || '').split(/\r?\n/).map(strip).map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines : [''];
};
export const fromLines = (lines: string[]): string =>
  lines.map((l) => l.trim()).filter(Boolean).map((l, i) => `${i + 1}. ${l}`).join('\n');

// One small box per point with its number, an "Add" button for the next one, and a remove button on each.
export function NumberedList({ id, value, onChange, placeholder, addLabel, disabled }: {
  id: string; value: string; onChange: (text: string) => void; placeholder: string; addLabel: string; disabled?: boolean;
}) {
  const [lines, setLines] = useState<string[]>(() => toLines(value));
  const update = (next: string[]) => { setLines(next); onChange(fromLines(next)); };
  return (
    <div className="space-y-2" id={id}>
      {lines.map((line, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-7 shrink-0 text-right text-sm font-medium text-dbi-textSecondary">{i + 1}.</span>
          <Input
            aria-label={`${placeholder} ${i + 1}`}
            value={line}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => update(lines.map((l, j) => (j === i ? e.target.value : l)))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); update([...lines.slice(0, i + 1), '', ...lines.slice(i + 1)]); } }}
          />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${i + 1}`} disabled={disabled || lines.length === 1 && !line} onClick={() => update(lines.length === 1 ? [''] : lines.filter((_, j) => j !== i))}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => update([...lines, ''])}>
        <Plus className="mr-1 h-4 w-4" />{addLabel}
      </Button>
    </div>
  );
}
