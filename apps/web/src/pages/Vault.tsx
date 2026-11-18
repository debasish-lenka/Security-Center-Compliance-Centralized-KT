import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, Copy, Eye, EyeOff, FileUp, FolderLock, History, Loader2, LockKeyhole, Pencil, Plus, ShieldAlert, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { uploadPolicyApi, usersApi } from '@/lib/api';
import { vaultApi, type VaultFolder, type VaultGrant, type VaultLevel, type VaultSecret, type Revealed } from '@/lib/vaultApi';
import { toast } from '@/hooks/use-toast';
import { formatDateTimeIST } from '@/lib/utils';

const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';
const field = 'h-10 w-full rounded-md border border-dbi-border bg-dbi-elevated px-3 text-sm text-dbi-textPrimary';
const LEVEL_TEXT: Record<VaultLevel, string> = { VIEW: 'Can view', EDIT: 'Can edit', MANAGE: 'Manager' };
const TYPE_TEXT = { LOGIN: 'Login', API_KEY: 'API key', NOTE: 'Note', FILE: 'File' } as const;
const size = (b: number | null) => (b == null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const REVEAL_SECONDS = 30;

function LevelBadge({ level }: { level: VaultLevel | null }) {
  if (!level) return <Badge variant="outline">No access</Badge>;
  return <Badge variant={level === 'MANAGE' ? 'indigo' : level === 'EDIT' ? 'cyan' : 'success'}>{LEVEL_TEXT[level]}</Badge>;
}

// ---------- the value, shown for a short time ----------
function RevealDialog({ secret, stepUp, onClose }: { secret: VaultSecret; stepUp: 'code' | 'password' | 'none'; onClose: () => void }) {
  const [proof, setProof] = useState('');
  const [data, setData] = useState<Revealed | null>(null);
  const [show, setShow] = useState(false);
  const [left, setLeft] = useState(REVEAL_SECONDS);
  const copied = useRef(false);

  const open = useMutation({
    mutationFn: () => vaultApi.reveal(secret.id, stepUp === 'code' ? { code: proof } : { password: proof }),
    onSuccess: (r) => { setData(r); setProof(''); setLeft(REVEAL_SECONDS); },
    onError: (e) => toast({ title: 'Could not open', description: errMsg(e), variant: 'destructive' }),
  });

  // hides itself, and tries to empty the clipboard if it was used
  useEffect(() => {
    if (!data) return;
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [data]);
  useEffect(() => { if (data && left <= 0) close(); }, [left, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    if (copied.current) navigator.clipboard?.writeText('').catch(() => {});
    setData(null); onClose();
  };
  const copy = (text?: string) => {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => { copied.current = true; toast({ title: 'Copied', description: 'The clipboard is cleared when this window closes.' }); }, () => toast({ title: 'Could not copy', variant: 'destructive' }));
  };

  const Row = ({ label, text, secret: hidden }: { label: string; text?: string; secret?: boolean }) =>
    text ? (
      <div>
        <Label>{label}</Label>
        <div className="mt-1 flex items-center gap-2">
          <div className="min-h-10 flex-1 break-all rounded-md border border-dbi-border bg-dbi-elevated px-3 py-2 font-mono text-sm">
            {hidden && !show ? '••••••••••••' : text}
          </div>
          {hidden && <Button type="button" variant="outline" size="icon" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide' : 'Show'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>}
          <Button type="button" variant="outline" size="icon" onClick={() => copy(text)} aria-label={`Copy ${label}`}><Copy className="h-4 w-4" /></Button>
        </div>
      </div>
    ) : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{secret.name}</DialogTitle>
          <DialogDescription>{data ? `Version ${data.version}. This closes by itself in ${Math.max(left, 0)} seconds.` : 'Opening a secret is written to the audit log with your name.'}</DialogDescription>
        </DialogHeader>
        {!data ? (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (proof.trim()) open.mutate(); }}>
            {stepUp === 'none' ? (
              <p className="text-sm text-dbi-textSecondary">Turn on two-factor authentication in Settings first. Secrets can only be opened by accounts that can prove who is asking.</p>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="proof">{stepUp === 'code' ? 'Authenticator code (6 digits)' : 'Your password'}</Label>
                <Input id="proof" autoFocus autoComplete={stepUp === 'code' ? 'one-time-code' : 'current-password'} type={stepUp === 'code' ? 'text' : 'password'} inputMode={stepUp === 'code' ? 'numeric' : undefined} value={proof} onChange={(e) => setProof(e.target.value)} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
              <Button type="submit" disabled={open.isPending || !proof.trim() || stepUp === 'none'}>{open.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Show secret</Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <Row label="Username" text={data.username} />
            <Row label="Address (URL)" text={data.url} />
            <Row label={secret.type === 'NOTE' ? 'Note' : secret.type === 'API_KEY' ? 'Key' : 'Password'} text={data.value} secret />
            <DialogFooter><Button onClick={close}>Close now</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- add / change a secret ----------
function SecretDialog({ folderId, secret, onClose }: { folderId: string; secret: VaultSecret | null; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = !!secret;
  const [f, setF] = useState({ name: secret?.name ?? '', type: secret?.type ?? 'LOGIN', username: '', url: '', value: '', description: secret?.description ?? '', expiresAt: secret?.expiresAt?.slice(0, 10) ?? '', reason: '' });
  const [show, setShow] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const common = { name: f.name.trim(), description: f.description.trim() || null, expiresAt: f.expiresAt || null };
      if (!editing) return vaultApi.createSecret(folderId, { ...common, type: f.type, username: f.username || null, url: f.url || null, value: f.value });
      // empty = keep what is stored (the stored values are not shown here); anything typed becomes a new version
      return vaultApi.updateSecret(secret!.id, { ...common, ...(f.username ? { username: f.username } : {}), ...(f.url ? { url: f.url } : {}), ...(f.value ? { value: f.value } : {}), reason: f.reason.trim() });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vault-secrets', folderId] }); qc.invalidateQueries({ queryKey: ['vault-folders'] }); toast({ title: editing ? 'Saved' : 'Secret added' }); onClose(); },
    onError: (e) => toast({ title: 'Could not save', description: errMsg(e), variant: 'destructive' }),
  });
  const ok = f.name.trim() && (editing ? f.reason.trim().length >= 5 : !!f.value);

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !save.isPending) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Change "${secret!.name}"` : 'Add a secret'}</DialogTitle>
          <DialogDescription>{editing ? 'Leave the secret fields empty to keep them. A new value is saved as a new version; the old one is kept. You must say why: super admins are told what you changed and your reason.' : 'The value is encrypted before it is stored.'}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (ok) save.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2"><Label htmlFor="s-name">Name *</Label><Input id="s-name" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Office firewall admin" /></div>
            <div><Label htmlFor="s-type">Type</Label>
              <select id="s-type" className={field} value={f.type} disabled={editing} onChange={(e) => set('type', e.target.value)}>
                {Object.entries(TYPE_TEXT).filter(([k]) => k !== 'FILE').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          {f.type !== 'NOTE' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="s-user">Username</Label><Input id="s-user" autoComplete="off" value={f.username} onChange={(e) => set('username', e.target.value)} placeholder={editing ? 'unchanged' : ''} /></div>
              <div><Label htmlFor="s-url">Address (URL)</Label><Input id="s-url" autoComplete="off" value={f.url} onChange={(e) => set('url', e.target.value)} placeholder={editing ? 'unchanged' : 'https://...'} /></div>
            </div>
          )}
          <div>
            <Label htmlFor="s-val">{f.type === 'NOTE' ? 'Note' : f.type === 'API_KEY' ? 'Key' : 'Password'}{editing ? '' : ' *'}</Label>
            <div className="flex gap-2">
              {f.type === 'NOTE'
                ? <Textarea id="s-val" rows={4} autoComplete="off" value={f.value} onChange={(e) => set('value', e.target.value)} placeholder={editing ? 'unchanged' : ''} />
                : <Input id="s-val" autoComplete="new-password" type={show ? 'text' : 'password'} value={f.value} onChange={(e) => set('value', e.target.value)} placeholder={editing ? 'unchanged' : ''} />}
              {f.type !== 'NOTE' && <Button type="button" variant="outline" size="icon" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide' : 'Show'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>}
            </div>
          </div>
          <div><Label htmlFor="s-desc">What it is for</Label><Input id="s-desc" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Everyone can read this line. Never write the secret here." /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="s-exp">Change before (optional)</Label><Input id="s-exp" type="date" value={f.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} /></div>
          </div>
          {editing && <div><Label htmlFor="s-reason">Why are you changing this? *</Label><Input id="s-reason" value={f.reason} onChange={(e) => set('reason', e.target.value)} placeholder="e.g. password rotated after a staff change" /><p className="mt-1 text-xs text-dbi-textSecondary">At least 5 characters. Super admins see this reason.</p></div>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" disabled={!ok || save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? 'Save' : 'Add secret'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- who has access ----------
const DURATIONS: [string, string, number | null][] = [['forever', 'No end date', null], ['1h', '1 hour', 1], ['24h', '24 hours', 24], ['7d', '7 days', 168], ['30d', '30 days', 720]];

function AccessDialog({ folder, onClose }: { folder: { id: string; name: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: grants = [], isLoading } = useQuery({ queryKey: ['vault-grants', folder.id], queryFn: () => vaultApi.grants(folder.id) });
  const { data: dir } = useQuery({ queryKey: ['users-for-select'], queryFn: () => usersApi.directory({ limit: '200' }) });
  const users: any[] = dir?.data?.items || [];
  const [userId, setUserId] = useState('');
  const [level, setLevel] = useState<VaultLevel>('VIEW');
  const [dur, setDur] = useState('forever');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['vault-grants', folder.id] }); qc.invalidateQueries({ queryKey: ['vault-folders'] }); qc.invalidateQueries({ queryKey: ['vault-secrets', folder.id] }); };

  const give = useMutation({
    mutationFn: (b: { userId: string; level: VaultLevel; hours: number | null }) => vaultApi.grant(folder.id, { userId: b.userId, level: b.level, expiresAt: b.hours ? new Date(Date.now() + b.hours * 3600_000).toISOString() : null }),
    onSuccess: () => { refresh(); setUserId(''); toast({ title: 'Access saved' }); },
    onError: (e) => toast({ title: 'Could not save', description: errMsg(e), variant: 'destructive' }),
  });
  const take = useMutation({
    mutationFn: (uid: string) => vaultApi.revoke(folder.id, uid),
    onSuccess: () => { refresh(); toast({ title: 'Access removed' }); },
    onError: (e) => toast({ title: 'Could not remove', description: errMsg(e), variant: 'destructive' }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Who can open "{folder.name}"</DialogTitle>
          <DialogDescription>Only the people listed can see the values. Everyone else sees the names only. Every change here is written to the audit log.</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto rounded-md border border-dbi-border">
          {isLoading ? <p className="p-3 text-sm text-dbi-textSecondary">Loading...</p> : grants.length === 0 ? <p className="p-3 text-sm text-dbi-textSecondary">Nobody yet.</p> : grants.map((g: VaultGrant) => (
            <div key={g.id} className="flex items-center gap-3 border-b border-dbi-border p-3 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{g.user?.fullName ?? 'Unknown user'}</p>
                <p className="truncate text-xs text-dbi-textSecondary">{g.user?.email} · {g.user?.role?.replace(/_/g, ' ')}</p>
              </div>
              <select className={`${field} !w-32`} value={g.level} disabled={give.isPending} onChange={(e) => give.mutate({ userId: g.userId, level: e.target.value as VaultLevel, hours: null })} aria-label="Access level">
                {(Object.keys(LEVEL_TEXT) as VaultLevel[]).map((l) => <option key={l} value={l}>{LEVEL_TEXT[l]}</option>)}
              </select>
              <span className="w-28 text-xs text-dbi-textSecondary">{g.expired ? <Badge variant="critical">Ended</Badge> : g.expiresAt ? <><Clock className="mr-1 inline h-3 w-3" />{formatDateTimeIST(g.expiresAt)}</> : 'No end date'}</span>
              <Button variant="ghost" size="icon" onClick={() => { if (window.confirm(`Take away ${g.user?.fullName ?? 'this person'}'s access?`)) take.mutate(g.userId); }} aria-label="Remove access"><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" onSubmit={(e) => { e.preventDefault(); if (userId) give.mutate({ userId, level, hours: DURATIONS.find((d) => d[0] === dur)![2] }); }}>
          <select className={field} value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Person">
            <option value="">Choose a person</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.email})</option>)}
          </select>
          <select className={field} value={level} onChange={(e) => setLevel(e.target.value as VaultLevel)} aria-label="Access level">
            {(Object.keys(LEVEL_TEXT) as VaultLevel[]).map((l) => <option key={l} value={l}>{LEVEL_TEXT[l]}</option>)}
          </select>
          <select className={field} value={dur} onChange={(e) => setDur(e.target.value)} aria-label="For how long">
            {DURATIONS.map((d) => <option key={d[0]} value={d[0]}>{d[1]}</option>)}
          </select>
          <Button type="submit" disabled={!userId || give.isPending}>Give access</Button>
        </form>
        <DialogFooter><Button variant="outline" onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ secret, onClose }: { secret: VaultSecret; onClose: () => void }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['vault-versions', secret.id], queryFn: () => vaultApi.versions(secret.id) });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Versions of "{secret.name}"</DialogTitle><DialogDescription>Every change is kept as its own version. Nothing is overwritten.</DialogDescription></DialogHeader>
        <div className="max-h-72 overflow-y-auto">
          {isLoading ? <p className="text-sm text-dbi-textSecondary">Loading...</p> : data.map((v) => (
            <div key={v.version} className="flex items-center justify-between border-b border-dbi-border py-2 text-sm last:border-0">
              <span><b>Version {v.version}</b>{v.version === secret.currentVersion && <Badge variant="success" className="ml-2">Current</Badge>}<br /><span className="text-xs text-dbi-textSecondary">{v.reason ?? ''}{v.by ? ` · ${v.by}` : ''}</span></span>
              <span className="text-xs text-dbi-textSecondary">{formatDateTimeIST(v.createdAt)}</span>
            </div>
          ))}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- upload a file (e.g. a zip of shared credentials), or put a newer file in place of it ----------
function FileDialog({ folderId, secret, onClose }: { folderId: string; secret: VaultSecret | null; onClose: () => void }) {
  const qc = useQueryClient();
  const replacing = !!secret;
  const { data: policy } = useQuery({ queryKey: ['upload-policy'], staleTime: 60 * 60_000, queryFn: async () => (await uploadPolicyApi.get()).data.data as { maxMb: number } });
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState({ name: secret?.name ?? '', description: secret?.description ?? '', expiresAt: secret?.expiresAt?.slice(0, 10) ?? '', reason: '' });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const maxMb = policy?.maxMb ?? 50;

  const save = useMutation({
    mutationFn: async () => {
      if (!replacing) return vaultApi.uploadFile(folderId, file!, { name: f.name.trim() || undefined, description: f.description.trim() || undefined, expiresAt: f.expiresAt || undefined });
      const reason = f.reason.trim();
      if (metaChanged) await vaultApi.updateSecret(secret!.id, { name: f.name.trim(), description: f.description.trim() || null, expiresAt: f.expiresAt || null, reason });
      if (file) await vaultApi.replaceFile(secret!.id, file, reason);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vault-secrets', folderId] }); qc.invalidateQueries({ queryKey: ['vault-folders'] }); toast({ title: replacing ? 'Saved' : 'File stored, encrypted' }); onClose(); },
    onError: (e) => toast({ title: 'Could not save', description: errMsg(e), variant: 'destructive' }),
  });
  const metaChanged = replacing && (f.name.trim() !== secret!.name || (f.description.trim() || null) !== secret!.description || (f.expiresAt || null) !== (secret!.expiresAt?.slice(0, 10) ?? null));
  const ok = replacing ? !!f.name.trim() && f.reason.trim().length >= 5 && (!!file || metaChanged) : !!file;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !save.isPending) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{replacing ? `Change "${secret!.name}"` : 'Upload a file'}</DialogTitle>
          <DialogDescription>{replacing ? 'Choose a file only if you want to replace it. The old file is kept as an older version. You must say why: super admins are told what you changed and your reason.' : `For a zip, key file or certificate. It is scanned, then encrypted before it is stored. Up to ${maxMb} MB.`}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (ok) save.mutate(); }}>
          <div>
            <Label htmlFor="f-file">{replacing ? 'New file (optional)' : 'File *'}</Label>
            <input
              id="f-file" type="file" disabled={save.isPending}
              className="block w-full rounded-md border border-dbi-border bg-dbi-elevated p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-cyan-500 file:px-3 file:py-1 file:text-sm file:text-background"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                if (picked && picked.size > maxMb * 1024 * 1024) { toast({ title: 'The file is too large', description: `The limit is ${maxMb} MB.`, variant: 'destructive' }); e.target.value = ''; setFile(null); return; }
                setFile(picked);
              }}
            />
            {file && <p className="mt-1 text-xs text-dbi-textSecondary">{file.name} · {size(file.size)}</p>}
          </div>
          <div><Label htmlFor="f-name">Name</Label><Input id="f-name" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder={file?.name ?? 'Defaults to the file name'} /></div>
          <div><Label htmlFor="f-desc">What it is for</Label><Input id="f-desc" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Everyone can read this line. Never write a secret here." /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="f-exp">Change before (optional)</Label><Input id="f-exp" type="date" value={f.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} /></div>
          </div>
          {replacing && <div><Label htmlFor="f-reason">Why are you changing this? *</Label><Input id="f-reason" value={f.reason} onChange={(e) => set('reason', e.target.value)} placeholder="e.g. new camera passwords after the reset" /><p className="mt-1 text-xs text-dbi-textSecondary">At least 5 characters. Super admins see this reason.</p></div>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" disabled={!ok || save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{replacing ? 'Save' : 'Upload'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- removing a secret needs a reason, which super admins are shown ----------
function ReasonDialog({ secret, busy, onConfirm, onClose }: { secret: VaultSecret; busy: boolean; onConfirm: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= 5;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Remove "{secret.name}"?</DialogTitle><DialogDescription>It disappears from the list; older versions stay in the database. Super admins are told who removed it and why.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (ok) onConfirm(reason.trim()); }}>
          <div><Label htmlFor="rm-reason">Why are you removing it? *</Label><Input id="rm-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. device was retired" /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={!ok || busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Remove</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- inside one folder ----------
function FolderView({ folderId, stepUp, onBack }: { folderId: string; stepUp: 'code' | 'password' | 'none'; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: status } = useQuery({ queryKey: ['vault-status'], queryFn: vaultApi.status });
  const { data, isLoading, isError } = useQuery({ queryKey: ['vault-secrets', folderId], queryFn: () => vaultApi.secrets(folderId) });
  const [reveal, setReveal] = useState<VaultSecret | null>(null);
  const [removing, setRemoving] = useState<VaultSecret | null>(null);
  const [file, setFile] = useState<VaultSecret | 'new' | null>(null);
  const [edit, setEdit] = useState<VaultSecret | 'new' | null>(null);
  const [history, setHistory] = useState<VaultSecret | null>(null);
  const [access, setAccess] = useState(false);

  const del = useMutation({
    mutationFn: (v: { id: string; reason: string }) => vaultApi.deleteSecret(v.id, v.reason),
    onSuccess: () => { setRemoving(null); qc.invalidateQueries({ queryKey: ['vault-secrets', folderId] }); qc.invalidateQueries({ queryKey: ['vault-folders'] }); toast({ title: 'Secret removed' }); },
    onError: (e) => toast({ title: 'Could not remove', description: errMsg(e), variant: 'destructive' }),
  });
  const delFolder = useMutation({
    mutationFn: () => vaultApi.deleteFolder(folderId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vault-folders'] }); onBack(); },
    onError: (e) => toast({ title: 'Could not delete the folder', description: errMsg(e), variant: 'destructive' }),
  });

  if (isLoading) return <p className="text-dbi-textSecondary">Loading...</p>;
  if (isError || !data) return <p className="text-dbi-textSecondary">This folder could not be opened.</p>;
  const lvl = data.myLevel;
  const rank = { VIEW: 1, EDIT: 2, MANAGE: 3 };
  const can = (need: VaultLevel) => !!lvl && rank[lvl] >= rank[need];
  const isAdmin = !!status?.canCreateFolder;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />All folders</Button>
        <h2 className="text-xl font-semibold">{data.folder.name}</h2>
        <LevelBadge level={lvl} />
        <div className="ml-auto flex flex-wrap gap-2">
          {(can('MANAGE') || isAdmin) && <Button variant="outline" onClick={() => setAccess(true)}><Users className="mr-2 h-4 w-4" />Access</Button>}
          {can('EDIT') && <Button onClick={() => setEdit('new')}><Plus className="mr-2 h-4 w-4" />Add secret</Button>}
          {can('EDIT') && <Button variant="outline" onClick={() => setFile('new')}><FileUp className="mr-2 h-4 w-4" />Upload file</Button>}
          {can('MANAGE') && data.secrets.length === 0 && <Button variant="outline" onClick={() => { if (window.confirm('Delete this empty folder?')) delFolder.mutate(); }}><Trash2 className="mr-2 h-4 w-4" />Delete folder</Button>}
        </div>
      </div>
      {data.folder.description && <p className="text-sm text-dbi-textSecondary">{data.folder.description}</p>}
      {!lvl && (
        <Card><CardContent className="flex items-center gap-3 p-4 text-sm text-dbi-textSecondary">
          <ShieldAlert className="h-5 w-5 shrink-0" />You can see what is stored here but not open it. Ask an admin to give you access to this folder.
        </CardContent></Card>
      )}
      <Card>
        <CardContent className="p-0">
          {data.secrets.length === 0 ? <p className="p-6 text-sm text-dbi-textSecondary">Nothing stored in this folder yet.</p> : (
            <div className="divide-y divide-dbi-border">
              {data.secrets.map((s) => {
                const due = s.expiresAt && new Date(s.expiresAt) < new Date();
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 p-4">
                    <LockKeyhole className="h-4 w-4 shrink-0 text-dbi-textSecondary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.name} <Badge variant="outline" className="ml-1">{TYPE_TEXT[s.type]}</Badge>{due && <Badge variant="warning" className="ml-1">Change overdue</Badge>}</p>
                      <p className="truncate text-xs text-dbi-textSecondary">{s.description || 'No description'} · {s.type === 'FILE' && s.fileSize ? `${size(s.fileSize)} · ` : ''}version {s.currentVersion}</p>
                      <p className="truncate text-xs text-dbi-textSecondary">{s.type === 'FILE' ? 'Uploaded' : 'Added'} by <b className="font-medium text-dbi-textPrimary">{s.createdBy ?? 'unknown'}</b> on {formatDateTimeIST(s.createdAt)}{s.currentVersion > 1 && <> · last changed by <b className="font-medium text-dbi-textPrimary">{s.changedBy ?? 'unknown'}</b> on {formatDateTimeIST(s.changedAt)}</>}</p>
                    </div>
                    <div className="flex gap-1">
                      {s.type === 'FILE'
                        ? <Badge variant="secondary" title="Files cannot be downloaded from the Secret Manager">No download</Badge>
                        : can('VIEW') && <Button size="sm" onClick={() => setReveal(s)}><Eye className="mr-1 h-4 w-4" />Show</Button>}
                      {can('EDIT') && <Button size="icon" variant="ghost" onClick={() => (s.type === 'FILE' ? setFile(s) : setEdit(s))} aria-label="Change"><Pencil className="h-4 w-4" /></Button>}
                      {can('EDIT') && <Button size="icon" variant="ghost" onClick={() => setHistory(s)} aria-label="Versions"><History className="h-4 w-4" /></Button>}
                      {can('MANAGE') && <Button size="icon" variant="ghost" onClick={() => setRemoving(s)} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {removing && <ReasonDialog secret={removing} busy={del.isPending} onConfirm={(reason) => del.mutate({ id: removing.id, reason })} onClose={() => setRemoving(null)} />}
      {reveal && <RevealDialog secret={reveal} stepUp={stepUp} onClose={() => setReveal(null)} />}
      {file && <FileDialog folderId={folderId} secret={file === 'new' ? null : file} onClose={() => setFile(null)} />}
      {edit && <SecretDialog folderId={folderId} secret={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {history && <HistoryDialog secret={history} onClose={() => setHistory(null)} />}
      {access && <AccessDialog folder={data.folder} onClose={() => setAccess(false)} />}
    </div>
  );
}

// ---------- the page ----------
export function Vault() {
  const qc = useQueryClient();
  const { data: status, isLoading: loadingStatus } = useQuery({ queryKey: ['vault-status'], queryFn: vaultApi.status });
  const { data: folders = [], isLoading } = useQuery({ queryKey: ['vault-folders'], queryFn: vaultApi.folders, enabled: !!status?.enabled });
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [nf, setNf] = useState({ name: '', description: '' });

  const create = useMutation({
    mutationFn: () => vaultApi.createFolder({ name: nf.name.trim(), description: nf.description.trim() || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vault-folders'] }); setCreating(false); setNf({ name: '', description: '' }); toast({ title: 'Folder created' }); },
    onError: (e) => toast({ title: 'Could not create', description: errMsg(e), variant: 'destructive' }),
  });

  if (loadingStatus) return <p className="text-dbi-textSecondary">Loading...</p>;
  if (status && !status.enabled) {
    return (
      <Card><CardHeader><CardTitle>Secret Manager is not switched on</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-dbi-textSecondary">
          <p>The server has no master key yet. On the server, run:</p>
          <pre className="overflow-x-auto rounded-md bg-dbi-elevated p-3 text-xs">cd /opt/dbi-security{'\n'}echo "VAULT_MASTER_KEY=$(openssl rand -hex 32)" &gt;&gt; .env{'\n'}./update.sh --force</pre>
          <p><b>Then keep a copy of that key somewhere else</b> (not on this server). Without it the stored secrets can never be opened again.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Secret Manager</h1>
          <p className="text-sm text-dbi-textSecondary">Internal logins, keys and notes, encrypted. You see every name; only people given access can open a value.</p>
        </div>
        {status?.canCreateFolder && !open && <Button className="ml-auto" onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" />New folder</Button>}
      </div>

      {open ? (
        <FolderView folderId={open} stepUp={status?.stepUp ?? 'password'} onBack={() => setOpen(null)} />
      ) : isLoading ? <p className="text-dbi-textSecondary">Loading...</p> : folders.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-dbi-textSecondary">{status?.canCreateFolder ? 'No folders yet. Create the first one, for example "Firewalls" or "Cloud accounts".' : 'No folders yet. An admin creates them.'}</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((f: VaultFolder) => (
            <button key={f.id} onClick={() => setOpen(f.id)} className="text-left">
              <Card className="h-full transition-colors hover:border-cyan-500/50">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center gap-2"><FolderLock className="h-5 w-5 text-dbi-textSecondary" /><span className="truncate font-semibold">{f.name}</span></div>
                  <p className="line-clamp-2 min-h-[2.5rem] text-sm text-dbi-textSecondary">{f.description || 'No description'}</p>
                  <div className="flex items-center justify-between text-xs text-dbi-textSecondary"><span>{f.secretCount} secret{f.secretCount === 1 ? '' : 's'}</span><LevelBadge level={f.myLevel} /></div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Dialog open={creating} onOpenChange={(o) => { if (!create.isPending) setCreating(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New folder</DialogTitle><DialogDescription>You become its manager. Then add people under Access.</DialogDescription></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (nf.name.trim()) create.mutate(); }}>
            <div><Label htmlFor="f-name">Name *</Label><Input id="f-name" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="e.g. Firewalls" /></div>
            <div><Label htmlFor="f-desc">What goes here</Label><Input id="f-desc" value={nf.description} onChange={(e) => setNf({ ...nf, description: e.target.value })} /></div>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" disabled={!nf.name.trim() || create.isPending}>Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
