import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { auditLogsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MultiSelect } from '@/components/ui/multi-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Activity, AlertTriangle, ArrowDown, ArrowUp, Bookmark, Download, ExternalLink, Eye, FileSearch, Loader2, Search, Shield, Trash2, Users, X } from 'lucide-react';
import { formatDateTimeIST, formatRelativeTime, getStatusColor } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

// ---- the filter lives in the address bar, so a view can be bookmarked, shared with a colleague and survives a reload ----
const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
const RANGES: [string, string][] = [['1h', 'Last hour'], ['today', 'Today'], ['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days']];
const SORTABLE = ['createdAt', 'action', 'resourceType', 'outcome', 'ipAddress'];
const VIEWS_KEY = 'dbi_audit_views';

// what the quick ranges mean right now (a plain date is that day in IST, a date-time without a zone is IST as well: the server reads them so)
function rangeBounds(range: string | null, from: string | null, to: string | null): Record<string, string> {
  const now = Date.now();
  if (from || to) return { ...(from ? { startDate: from } : {}), ...(to ? { endDate: to } : {}) };
  if (range === '1h') return { startDate: new Date(now - 3600_000).toISOString() };
  if (range === '24h') return { startDate: new Date(now - 86400_000).toISOString() };
  if (range === '7d') return { startDate: new Date(now - 7 * 86400_000).toISOString() };
  if (range === '30d') return { startDate: new Date(now - 30 * 86400_000).toISOString() };
  if (range === 'today') return { startDate: new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10) };
  return {};
}

const VERB: Record<string, string> = {
  CREATE: 'created', UPDATE: 'changed', DELETE: 'deleted', LOGIN: 'signed in', LOGOUT: 'signed out', UPLOAD: 'uploaded', DOWNLOAD: 'downloaded',
  APPROVE: 'approved', REJECT: 'rejected', ASSIGN: 'assigned', UNASSIGN: 'unassigned', EXPORT: 'exported', VIEW: 'opened', SHARE: 'shared',
  CONFIG_CHANGE: 'changed the settings of', ROLE_CHANGE: 'changed the role of', PERMISSION_CHANGE: 'changed the permissions of', SUBMIT_REVIEW: 'sent for review',
  TRANSFER_OWNERSHIP: 'transferred', ROLLBACK_VERSION: 'rolled back', GENERATE_KB: 'generated', BULK_ASSIGN: 'assigned in bulk',
};
const human = (s: string) => s.replace(/_/g, ' ').toLowerCase();
const sentence = (l: any) => `${l.actor?.fullName ?? 'The system'} ${VERB[l.action] ?? human(l.action)} ${human(l.resourceType)}${l.itemName ? ` "${l.itemName}"` : ''}`;

const actionColor = (a: string) => ({
  CREATE: 'bg-emerald-500/20 text-emerald-300', UPDATE: 'bg-amber-500/20 text-amber-300', DELETE: 'bg-rose-500/20 text-rose-300', LOGIN: 'bg-indigo-500/20 text-indigo-300',
  LOGOUT: 'bg-slate-500/20 text-slate-300', EXPORT: 'bg-purple-500/20 text-purple-300', APPROVE: 'bg-emerald-500/20 text-emerald-300', REJECT: 'bg-rose-500/20 text-rose-300',
  ASSIGN: 'bg-cyan-500/20 text-cyan-300', UNASSIGN: 'bg-amber-500/20 text-amber-300', UPLOAD: 'bg-cyan-500/20 text-cyan-300', DOWNLOAD: 'bg-sky-500/20 text-sky-300',
}[a] ?? 'bg-dbi-textSecondary/20 text-dbi-textSecondary');

// details: a list of "what: value" lines, changes shown as "from -> to"
function DetailsView({ details }: { details: any }) {
  if (details == null || (typeof details === 'object' && Object.keys(details).length === 0)) return <p className="text-dbi-textSecondary">No details were recorded.</p>;
  if (typeof details !== 'object') return <p className="break-words text-dbi-textPrimary">{String(details)}</p>;
  const show = (v: any) => (v === null || v === undefined ? 'nothing' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const rows: [string, string][] = [];
  for (const [k, v] of Object.entries(details)) {
    if (k === 'changes' && v && typeof v === 'object') {
      for (const [f, c] of Object.entries(v as Record<string, any>)) rows.push([`${human(f)} changed`, c && typeof c === 'object' && ('from' in c || 'to' in c) ? `${show(c.from)}  →  ${show(c.to)}` : show(c)]);
    } else rows.push([human(k), show(v)]);
  }
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5">
      {rows.map(([k, v], i) => (<div key={i} className="contents"><dt className="text-dbi-textSecondary">{k}</dt><dd className="break-words text-dbi-textPrimary">{v}</dd></div>))}
    </dl>
  );
}

function StatCard({ icon, label, value, tone, onClick, hint }: { icon: React.ReactNode; label: string; value: number | string; tone: string; onClick?: () => void; hint?: string }) {
  const body = (
    <CardContent className="flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>{icon}</div>
      <div className="min-w-0"><p className="truncate text-xs text-dbi-textSecondary">{label}</p><p className="text-2xl font-bold text-dbi-textPrimary">{value}</p>{hint && <p className="truncate text-xs text-dbi-textSecondary">{hint}</p>}</div>
    </CardContent>
  );
  return onClick
    ? <Card role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }} className="cursor-pointer transition hover:-translate-y-0.5 hover:border-dbi-cyan/50">{body}</Card>
    : <Card>{body}</Card>;
}

export function AuditLogs() {
  const [sp, setSp] = useSearchParams();
  const f = {
    q: sp.get('q') ?? '', action: csv(sp.get('action')), res: csv(sp.get('res')), actor: csv(sp.get('actor')), out: sp.get('out') ?? '',
    ip: sp.get('ip') ?? '', rid: sp.get('rid') ?? '', range: sp.get('range'), from: sp.get('from'), to: sp.get('to'),
    page: Math.max(1, Number(sp.get('page')) || 1), size: [20, 50, 100].includes(Number(sp.get('size'))) ? Number(sp.get('size')) : 20,
    sort: SORTABLE.includes(sp.get('sort') ?? '') ? sp.get('sort')! : 'createdAt', dir: sp.get('dir') === 'asc' ? 'asc' : 'desc',
  };
  const set = (patch: Record<string, string | string[] | null>, keepPage = false) => setSp((prev) => {
    const n = new URLSearchParams(prev);
    for (const [k, v] of Object.entries(patch)) { const s = Array.isArray(v) ? v.join(',') : v; if (s == null || s === '') n.delete(k); else n.set(k, s); }
    if (!keepPage) n.delete('page');
    return n;
  }, { replace: true });

  // typing in the search box waits a moment before it asks the server
  const [text, setText] = useState(f.q);
  useEffect(() => { setText(f.q); }, [f.q]);
  useEffect(() => { if (text === f.q) return; const t = setTimeout(() => set({ q: text }), 350); return () => clearTimeout(t); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const [live, setLive] = useState(false);
  const [viewing, setViewing] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [exporting, setExporting] = useState(false);

  // what is sent to the server (the filters; without paging)
  const filterParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (f.q) p.search = f.q;
    if (f.action.length) p.action = f.action.join(',');
    if (f.res.length) p.resourceType = f.res.join(',');
    if (f.actor.length) p.actorId = f.actor.join(',');
    if (f.out) p.outcome = f.out;
    if (f.ip) p.ip = f.ip;
    if (f.rid) p.resourceId = f.rid;
    return { ...p, ...rangeBounds(f.range, f.from, f.to) };
  }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const filterKey = JSON.stringify({ ...filterParams, startDate: f.from || f.range || '', endDate: f.to || '' }); // a relative range is not re-asked just because a minute passed

  const { data: facets } = useQuery({ queryKey: ['audit-facets'], staleTime: 60_000, queryFn: async () => (await auditLogsApi.facets()).data?.data as { actions: { value: string; count: number }[]; resourceTypes: { value: string; count: number }[] } });
  const { data: actors = [] } = useQuery({ queryKey: ['audit-actors'], staleTime: 60_000, queryFn: async () => ((await auditLogsApi.actors()).data?.data ?? []) as { value: string; label: string; email: string; count: number }[] });
  const { data: summary } = useQuery({ queryKey: ['audit-summary', filterKey], placeholderData: keepPreviousData, refetchInterval: live ? 10_000 : false, queryFn: async () => (await auditLogsApi.summary(filterParams)).data?.data });
  const { data, isLoading, error, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ['audit-logs', filterKey, f.page, f.size, f.sort, f.dir],
    placeholderData: keepPreviousData,
    refetchInterval: live ? 10_000 : false,
    queryFn: () => auditLogsApi.list({ ...filterParams, page: String(f.page), limit: String(f.size), sortBy: f.sort, sortOrder: f.dir }),
  });
  const logs: any[] = data?.data?.items || [];
  const total: number = data?.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / f.size));

  // ---- filter chips ----
  const actorName = (id: string) => actors.find((a) => a.value === id)?.label ?? id.slice(0, 8);
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (f.q) chips.push({ key: 'q', label: `Text: ${f.q}`, remove: () => set({ q: null }) });
  for (const a of f.action) chips.push({ key: `a-${a}`, label: `Action: ${human(a)}`, remove: () => set({ action: f.action.filter((x) => x !== a) }) });
  for (const r of f.res) chips.push({ key: `r-${r}`, label: `Resource: ${human(r)}`, remove: () => set({ res: f.res.filter((x) => x !== r) }) });
  for (const a of f.actor) chips.push({ key: `p-${a}`, label: `Person: ${actorName(a)}`, remove: () => set({ actor: f.actor.filter((x) => x !== a) }) });
  if (f.out) chips.push({ key: 'o', label: f.out === 'FAILURE' ? 'Failed only' : 'Succeeded only', remove: () => set({ out: null }) });
  if (f.ip) chips.push({ key: 'ip', label: `IP: ${f.ip}`, remove: () => set({ ip: null }) });
  if (f.rid) chips.push({ key: 'rid', label: `Item: ${f.rid.slice(0, 12)}${f.rid.length > 12 ? '…' : ''}`, remove: () => set({ rid: null }) });
  if (f.range && !f.from && !f.to) chips.push({ key: 'rg', label: `Time: ${RANGES.find((r) => r[0] === f.range)?.[1] ?? f.range}`, remove: () => set({ range: null }) });
  if (f.from) chips.push({ key: 'from', label: `From: ${f.from.replace('T', ' ')} IST`, remove: () => set({ from: null }) });
  if (f.to) chips.push({ key: 'to', label: `To: ${f.to.replace('T', ' ')} IST`, remove: () => set({ to: null }) });
  const clearAll = () => setSp(new URLSearchParams(), { replace: true });

  // ---- saved views (kept in this browser) ----
  const [views, setViews] = useState<{ name: string; query: string }[]>(() => { try { return JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]'); } catch { return []; } });
  const [viewsOpen, setViewsOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const viewsBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!viewsOpen) return;
    const away = (e: MouseEvent) => { if (viewsBox.current && !viewsBox.current.contains(e.target as Node)) setViewsOpen(false); };
    document.addEventListener('mousedown', away); return () => document.removeEventListener('mousedown', away);
  }, [viewsOpen]);
  const saveViews = (v: { name: string; query: string }[]) => { setViews(v); try { localStorage.setItem(VIEWS_KEY, JSON.stringify(v)); } catch { /* storage can be blocked */ } };
  const currentQuery = () => { const n = new URLSearchParams(sp); n.delete('page'); return n.toString(); };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const response = await auditLogsApi.export(filterParams);
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a'); a.href = url; a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`; a.click(); window.URL.revokeObjectURL(url);
      toast({ title: 'Exported', description: `The ${chips.length ? 'filtered' : 'complete'} log was saved as a CSV file` });
    } catch { toast({ title: 'Error', description: 'Failed to export audit logs', variant: 'destructive' }); }
    setExporting(false);
  };

  const sortBy = (key: string) => set({ sort: key, dir: f.sort === key && f.dir === 'desc' ? 'asc' : 'desc' }, true);
  const toggleIn = (key: 'action' | 'res' | 'actor', list: string[], v: string) => set({ [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] });
  const days = summary?.perDay ?? [];
  const maxDay = Math.max(1, ...days.map((d: any) => d.count));

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">Audit Logs</h1>
          <p className="text-dbi-textSecondary">Who did what, when and from where. Combine filters to find exactly what you are looking for.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-dbi-textSecondary" title="Refresh every 10 seconds">
            <Switch checked={live} onCheckedChange={setLive} aria-label="Live updates" /> Live
            {live && dataUpdatedAt > 0 && <span className="text-xs">updated {new Date(dataUpdatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>}
          </label>
          <div ref={viewsBox} className="relative">
            <Button variant="outline" onClick={() => setViewsOpen((o) => !o)} aria-expanded={viewsOpen}><Bookmark className="mr-2 h-4 w-4" />Saved views{views.length > 0 && ` (${views.length})`}</Button>
            {viewsOpen && (
              <div className="absolute right-0 z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-dbi-border bg-dbi-surface p-2 shadow-xl">
                {views.length === 0 && <p className="px-2 py-2 text-sm text-dbi-textSecondary">No saved views yet. Set some filters, give them a name and save.</p>}
                {views.map((v) => (
                  <div key={v.name} className="flex items-center gap-1 rounded hover:bg-dbi-elevated">
                    <button type="button" className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-dbi-textPrimary" onClick={() => { setSp(new URLSearchParams(v.query), { replace: true }); setViewsOpen(false); }}>{v.name}</button>
                    <button type="button" aria-label={`Delete view ${v.name}`} className="p-1.5 text-dbi-textSecondary hover:text-dbi-critical" onClick={() => saveViews(views.filter((x) => x.name !== v.name))}><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <form className="mt-2 flex gap-2 border-t border-dbi-border pt-2" onSubmit={(e) => { e.preventDefault(); const name = viewName.trim(); if (!name) return; saveViews([...views.filter((x) => x.name !== name), { name, query: currentQuery() }]); setViewName(''); toast({ title: 'View saved', description: name }); }}>
                  <Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Name this view" className="h-9 bg-dbi-elevated" maxLength={40} aria-label="Name of the view" />
                  <Button type="submit" size="sm" disabled={!viewName.trim() || chips.length === 0}>Save</Button>
                </form>
              </div>
            )}
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={exporting}>{exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Export CSV</Button>
        </div>
      </div>

      {/* numbers for what is filtered now */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Activity className="h-5 w-5" />} label="Events" value={summary?.total ?? '…'} tone="bg-dbi-cyan/15 text-dbi-cyan" hint={chips.length ? 'matching the filters' : 'in the whole log'} />
        <StatCard icon={<Shield className="h-5 w-5" />} label="Succeeded" value={summary?.succeeded ?? '…'} tone="bg-emerald-500/15 text-emerald-400" onClick={() => set({ out: f.out === 'SUCCESS' ? null : 'SUCCESS' })} hint={f.out === 'SUCCESS' ? 'filter on, click to remove' : 'click to show only these'} />
        <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="Failed" value={summary?.failed ?? '…'} tone="bg-rose-500/15 text-rose-400" onClick={() => set({ out: f.out === 'FAILURE' ? null : 'FAILURE' })} hint={f.out === 'FAILURE' ? 'filter on, click to remove' : 'click to show only these'} />
        <StatCard icon={<Users className="h-5 w-5" />} label="People" value={summary?.people ?? '…'} tone="bg-indigo-500/15 text-indigo-300" hint={summary?.systemEvents ? `+ ${summary.systemEvents} without a person` : undefined} />
      </div>

      {/* filters */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><FileSearch className="h-5 w-5 text-dbi-cyan" />Filters</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
              <Input aria-label="Search the log" placeholder="Search a person, a task or document name, an IP, an error..." value={text} onChange={(e) => setText(e.target.value)} className="h-10 border-dbi-border bg-dbi-elevated pl-9" />
            </div>
            <MultiSelect label="Action" value={f.action} onChange={(v) => set({ action: v })} options={(facets?.actions ?? []).map((a) => ({ value: a.value, label: human(a.value), count: a.count }))} />
            <MultiSelect label="Resource" value={f.res} onChange={(v) => set({ res: v })} width="w-72" options={(facets?.resourceTypes ?? []).map((r) => ({ value: r.value, label: human(r.value), count: r.count }))} />
            <MultiSelect label="Person" value={f.actor} onChange={(v) => set({ actor: v })} width="w-80" options={actors.map((a) => ({ value: a.value, label: a.label, hint: a.email, count: a.count }))} />
            <div className="flex overflow-hidden rounded-md border border-dbi-border" role="group" aria-label="Outcome">
              {[['', 'All'], ['SUCCESS', 'Succeeded'], ['FAILURE', 'Failed']].map(([v, l]) => (
                <button key={v} type="button" aria-pressed={f.out === v} onClick={() => set({ out: v || null })} className={`h-10 px-3 text-sm ${f.out === v ? (v === 'FAILURE' ? 'bg-rose-500/25 text-rose-200' : 'bg-dbi-cyan/20 text-dbi-cyan') : 'bg-dbi-elevated text-dbi-textSecondary hover:text-dbi-textPrimary'}`}>{l}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-dbi-textSecondary">When</span>
            {RANGES.map(([k, l]) => {
              const on = f.range === k && !f.from && !f.to;
              return <button key={k} type="button" aria-pressed={on} onClick={() => set({ range: on ? null : k, from: null, to: null })} className={`h-8 rounded-full border px-3 text-sm ${on ? 'border-dbi-cyan bg-dbi-cyan/15 text-dbi-cyan' : 'border-dbi-border text-dbi-textSecondary hover:text-dbi-textPrimary'}`}>{l}</button>;
            })}
            <span className="mx-1 text-xs text-dbi-textSecondary">or from</span>
            <input type="datetime-local" aria-label="From (IST)" title="From (IST)" value={f.from ?? ''} max={f.to ?? undefined} onChange={(e) => set({ from: e.target.value || null, range: null })} className="h-9 rounded-md border border-dbi-border bg-dbi-elevated px-2 text-sm text-dbi-textPrimary" />
            <span className="text-xs text-dbi-textSecondary">to</span>
            <input type="datetime-local" aria-label="To (IST)" title="To (IST)" value={f.to ?? ''} min={f.from ?? undefined} onChange={(e) => set({ to: e.target.value || null, range: null })} className="h-9 rounded-md border border-dbi-border bg-dbi-elevated px-2 text-sm text-dbi-textPrimary" />
            <span className="text-xs text-dbi-textSecondary">(IST)</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="IP address" placeholder="IP address" title="An IP address, or only the start of it" value={f.ip} onChange={(e) => set({ ip: e.target.value })} className="h-9 w-48 border-dbi-border bg-dbi-elevated font-mono" />
            <Input aria-label="Item id" placeholder="Item id (everything on one item)" value={f.rid} onChange={(e) => set({ rid: e.target.value })} className="h-9 w-72 max-w-full border-dbi-border bg-dbi-elevated font-mono" />
          </div>

          {(summary?.byAction?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-dbi-textSecondary">Most common</span>
              {summary.byAction.map((a: any) => (
                <button key={a.value} type="button" aria-pressed={f.action.includes(a.value)} onClick={() => toggleIn('action', f.action, a.value)} className={`rounded-full px-2.5 py-0.5 text-xs ${f.action.includes(a.value) ? 'ring-1 ring-dbi-cyan' : ''} ${actionColor(a.value)}`}>{human(a.value)} · {a.count}</button>
              ))}
            </div>
          )}

          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-dbi-border pt-3">
              {chips.map((c) => (
                <span key={c.key} className="inline-flex max-w-full items-center gap-1 rounded-full bg-dbi-cyan/15 py-0.5 pl-3 pr-1 text-sm text-dbi-cyan">
                  <span className="truncate">{c.label}</span>
                  <button type="button" aria-label={`Remove filter ${c.label}`} onClick={c.remove} className="rounded-full p-0.5 hover:bg-dbi-cyan/25"><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
              <button type="button" onClick={clearAll} className="text-sm text-dbi-textSecondary underline hover:text-dbi-textPrimary">Clear all</button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* events per day */}
      {days.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Events per day <span className="text-sm font-normal text-dbi-textSecondary">(click a day to look at it; red = failed)</span></CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="flex h-28 min-w-[20rem] items-end gap-1" role="list" aria-label="Events per day">
                {days.map((d: any) => (
                  <button key={d.date} type="button" role="listitem" title={`${new Date(`${d.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}: ${d.count} events${d.failed ? `, ${d.failed} failed` : ''}`}
                    onClick={() => set({ from: `${d.date}T00:00`, to: `${d.date}T23:59`, range: null })} className="group flex h-full min-w-[0.75rem] flex-1 flex-col justify-end">
                    <div className="w-full overflow-hidden rounded-t bg-dbi-cyan/70 group-hover:bg-dbi-cyan" style={{ height: `${Math.max(4, (d.count / maxDay) * 100)}%` }}>
                      {d.failed > 0 && <div className="w-full bg-rose-500" style={{ height: `${(d.failed / d.count) * 100}%` }} />}
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-1 flex min-w-[20rem] justify-between text-xs text-dbi-textSecondary"><span>{days[0].date}</span><span>{days[days.length - 1].date}</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* the log */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">Log <span className="text-base font-normal text-dbi-textSecondary">({total} {total === 1 ? 'entry' : 'entries'})</span>{isFetching && <Loader2 className="h-4 w-4 animate-spin text-dbi-cyan" />}</CardTitle>
            <label className="flex items-center gap-2 text-sm text-dbi-textSecondary">Rows per page
              <select value={f.size} onChange={(e) => set({ size: e.target.value === '20' ? null : e.target.value })} className="h-9 rounded-md border border-dbi-border bg-dbi-elevated px-2 text-dbi-textPrimary">{[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select>
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">{[...Array(5)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-dbi-elevated" />)}</div>
          ) : error ? (
            <div className="py-8 text-center text-dbi-critical">Failed to load audit logs</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center">
              <FileSearch className="mx-auto h-14 w-14 text-dbi-textSecondary" />
              <p className="mt-4 text-dbi-textSecondary">{chips.length ? 'Nothing matches these filters.' : 'No audit logs yet.'}</p>
              {chips.length > 0 && <Button variant="outline" className="mt-3" onClick={clearAll}>Clear all filters</Button>}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[['createdAt', 'Time (IST)'], ['', 'Who'], ['action', 'What'], ['outcome', 'Outcome'], ['ipAddress', 'IP address'], ['', '']].map(([key, label], i) => (
                        <TableHead key={i} aria-sort={key && f.sort === key ? (f.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                          {key ? (
                            <button type="button" onClick={() => sortBy(key)} className="flex items-center gap-1 hover:text-dbi-textPrimary">{label}{f.sort === key && (f.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}</button>
                          ) : label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log: any) => (
                      <TableRow key={log.id} className={`hover:bg-dbi-elevated/50 ${log.outcome === 'FAILURE' ? 'bg-rose-500/5' : ''}`}>
                        <TableCell className="whitespace-nowrap text-sm text-dbi-textSecondary">
                          <div className="text-dbi-textPrimary">{formatDateTimeIST(log.createdAt)}</div>
                          <div className="text-xs">{formatRelativeTime(log.createdAt)}</div>
                        </TableCell>
                        <TableCell>
                          <button type="button" disabled={!log.actorId} title={log.actorId ? 'Show only this person' : undefined} onClick={() => log.actorId && toggleIn('actor', f.actor, log.actorId)} className="flex items-center gap-2 text-left disabled:cursor-default">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-dbi-indigo/20 text-sm font-medium text-dbi-indigo">{log.actor?.fullName?.charAt(0).toUpperCase() || 'S'}</span>
                            <span className="min-w-0"><span className="block text-sm font-medium text-dbi-textPrimary">{log.actor?.fullName ?? 'System'}</span><span className="block truncate text-xs text-dbi-textSecondary">{log.actor?.email ?? 'no person'}</span></span>
                          </button>
                        </TableCell>
                        <TableCell className="max-w-[22rem]">
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" title="Show only this action" onClick={() => toggleIn('action', f.action, log.action)}><Badge className={actionColor(log.action)}>{log.action.replace(/_/g, ' ')}</Badge></button>
                            <button type="button" title="Show only this kind of item" onClick={() => toggleIn('res', f.res, log.resourceType)} className="text-sm font-medium text-dbi-textPrimary hover:text-dbi-cyan">{human(log.resourceType)}</button>
                          </div>
                          {log.itemName && <p className="mt-0.5 truncate text-sm text-dbi-textSecondary" title={log.itemName}>{log.itemName}</p>}
                          {log.outcome === 'FAILURE' && log.errorMessage && <p className="mt-0.5 truncate text-xs text-rose-300" title={log.errorMessage}>{log.errorMessage}</p>}
                        </TableCell>
                        <TableCell><Badge className={getStatusColor(log.outcome)}>{log.outcome === 'FAILURE' ? 'FAILED' : 'OK'}</Badge></TableCell>
                        <TableCell className="font-mono text-sm text-dbi-textSecondary">
                          {log.ipAddress ? <button type="button" title="Show only this IP address" onClick={() => set({ ip: log.ipAddress })} className="hover:text-dbi-cyan">{log.ipAddress}</button> : 'N/A'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Button variant="ghost" size="icon" aria-label="See the details of this entry" title="Details" onClick={() => { setViewing(log); setShowRaw(false); }}><Eye className="h-4 w-4" /></Button>
                          {log.link && <Button variant="ghost" size="icon" asChild><Link to={log.link} aria-label="Open the item" title="Open the item"><ExternalLink className="h-4 w-4" /></Link></Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-dbi-textSecondary">Showing {(f.page - 1) * f.size + 1} to {Math.min(f.page * f.size, total)} of {total} entries</p>
                  <Pagination totalPages={totalPages} currentPage={f.page} onPageChange={(p) => set({ page: p === 1 ? null : String(p) }, true)} />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* one entry in full */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Audit log entry</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              <p className="text-base text-dbi-textPrimary">{sentence(viewing)}.</p>
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <div><p className="text-dbi-textSecondary">When</p><p className="text-dbi-textPrimary">{formatDateTimeIST(viewing.createdAt)}</p></div>
                <div><p className="text-dbi-textSecondary">Outcome</p><Badge className={getStatusColor(viewing.outcome)}>{viewing.outcome === 'FAILURE' ? 'FAILED' : 'OK'}</Badge>{viewing.errorMessage && <p className="mt-1 text-rose-300">{viewing.errorMessage}</p>}</div>
                <div><p className="text-dbi-textSecondary">Person</p><p className="text-dbi-textPrimary">{viewing.actor ? `${viewing.actor.fullName} (${viewing.actor.email})` : 'No person (the system)'}</p></div>
                <div><p className="text-dbi-textSecondary">IP address</p><p className="font-mono text-dbi-textPrimary">{viewing.ipAddress || 'N/A'}</p></div>
                <div><p className="text-dbi-textSecondary">Action</p><Badge className={actionColor(viewing.action)}>{viewing.action.replace(/_/g, ' ')}</Badge></div>
                <div><p className="text-dbi-textSecondary">Item</p><p className="text-dbi-textPrimary">{human(viewing.resourceType)}{viewing.itemName ? `: ${viewing.itemName}` : ''}</p><p className="break-all font-mono text-xs text-dbi-textSecondary">{viewing.resourceId}</p></div>
                <div className="sm:col-span-2"><p className="text-dbi-textSecondary">Browser / device</p><p className="break-words text-dbi-textPrimary">{viewing.userAgent || 'N/A'}</p></div>
              </div>
              <div>
                <p className="mb-2 text-dbi-textSecondary">What was recorded</p>
                <div className="rounded-lg bg-dbi-elevated p-3"><DetailsView details={viewing.details} /></div>
                <button type="button" className="mt-2 text-xs text-dbi-cyan hover:underline" onClick={() => setShowRaw((r) => !r)}>{showRaw ? 'Hide' : 'Show'} the raw record</button>
                {showRaw && <pre className="mt-2 overflow-x-auto rounded-lg bg-dbi-elevated p-3 font-mono text-xs text-dbi-textPrimary">{JSON.stringify(viewing.details, null, 2)}</pre>}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-dbi-border pt-3">
                {viewing.link && <Button asChild size="sm"><Link to={viewing.link} onClick={() => setViewing(null)}><ExternalLink className="mr-2 h-4 w-4" />Open the item</Link></Button>}
                {viewing.resourceId && <Button size="sm" variant="outline" onClick={() => { set({ res: [viewing.resourceType], rid: viewing.resourceId }); setViewing(null); }}>Everything on this item</Button>}
                {viewing.actorId && <Button size="sm" variant="outline" onClick={() => { set({ actor: [viewing.actorId] }); setViewing(null); }}>Everything by this person</Button>}
                {viewing.ipAddress && <Button size="sm" variant="outline" onClick={() => { set({ ip: viewing.ipAddress }); setViewing(null); }}>Everything from this IP</Button>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
