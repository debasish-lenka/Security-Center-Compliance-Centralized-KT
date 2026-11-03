import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Info, Key, Loader2, Plus, Search, Shield, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { rolesApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface Permission { id: string; name: string; description: string | null; resource: string; action: string }
interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: { id: string; name: string }[];
}

const errMsg = (e: any) => e?.response?.data?.error?.message || 'Something went wrong';
const titleCase = (s: string) => s.replace(/[_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function Roles() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [viewing, setViewing] = useState<Role | null>(null);
  const [form, setForm] = useState({ name: '', description: '', permissionIds: [] as string[] });

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => ((await rolesApi.list()).data?.items ?? []) as Role[],
  });
  const { data: permissions = [] } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => ((await rolesApi.getPermissions()).data?.data ?? []) as Permission[],
  });

  // permissions grouped by what they apply to
  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissions) map.set(p.resource, [...(map.get(p.resource) ?? []), p]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  const visible = roles.filter((r) => `${r.name} ${r.description ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  const openCreate = () => { setEditing(null); setForm({ name: '', description: '', permissionIds: [] }); setDialogOpen(true); };
  const openEdit = (r: Role) => {
    setEditing(r);
    setForm({ name: r.name, description: r.description ?? '', permissionIds: r.permissions.map((p) => p.id) });
    setDialogOpen(true);
  };
  const toggle = (id: string) =>
    setForm((f) => ({ ...f, permissionIds: f.permissionIds.includes(id) ? f.permissionIds.filter((x) => x !== id) : [...f.permissionIds, id] }));

  const save = useMutation({
    mutationFn: async () => {
      const body = { name: form.name.trim(), description: form.description.trim() || null, permissionIds: form.permissionIds };
      if (editing) await rolesApi.update(editing.id, body);
      else await rolesApi.create(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast({ title: editing ? 'Role updated' : 'Role created' });
      setDialogOpen(false);
    },
    onError: (e) => toast({ title: 'Could not save the role', description: errMsg(e), variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { await rolesApi.delete(id); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['roles'] }); toast({ title: 'Role deleted' }); },
    onError: (e) => toast({ title: 'Could not delete the role', description: errMsg(e), variant: 'destructive' }),
  });

  const valid = form.name.trim().length >= 2 && form.permissionIds.length > 0;
  const renameLocked = !!editing?.isSystem;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight dbi-gradient-text">Roles & Permissions</h1>
          <p className="text-dbi-textSecondary">Named sets of permissions</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New Role</Button>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-dbi-cyan/30 bg-dbi-cyan/5 p-4 text-sm text-dbi-textSecondary">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-dbi-cyan" />
        <p>
          What a person can do in the app is decided by their <b className="text-dbi-textPrimary">account role</b> (set on the Users page) and their{' '}
          <b className="text-dbi-textPrimary">role in each project</b> (set on the project's Team tab). The roles listed here are a catalogue of
          permission sets for documentation and reviews; changing them does not change what anyone can do today.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>All Roles ({visible.length})</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
              <Input placeholder="Search roles..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-dbi-cyan" /></div>
          ) : visible.length === 0 ? (
            <div className="py-12 text-center">
              <Shield className="mx-auto h-14 w-14 text-dbi-textSecondary" />
              <p className="mt-4 text-dbi-textSecondary">{roles.length === 0 ? 'No roles yet' : 'No role matches your search'}</p>
              {roles.length === 0 && <Button onClick={openCreate} className="mt-4"><Plus className="mr-2 h-4 w-4" /> Create first role</Button>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>People</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <p className="font-medium text-dbi-textPrimary">{r.name}</p>
                        <p className="text-xs text-dbi-textSecondary">{r.description || 'No description'}</p>
                      </TableCell>
                      <TableCell className="text-sm text-dbi-textSecondary">{r.permissions.length}</TableCell>
                      <TableCell className="text-sm text-dbi-textSecondary">{r.userCount}</TableCell>
                      <TableCell><Badge variant={r.isSystem ? 'secondary' : 'outline'} className="text-xs">{r.isSystem ? 'System' : 'Custom'}</Badge></TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="View permissions" aria-label={`View permissions of ${r.name}`} onClick={() => setViewing(r)}><Key className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Edit" aria-label={`Edit ${r.name}`} onClick={() => openEdit(r)}><Edit className="h-4 w-4" /></Button>
                          {!r.isSystem && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Delete"
                              aria-label={`Delete ${r.name}`}
                              className="text-dbi-critical hover:text-dbi-critical"
                              onClick={() => { if (confirm(`Delete the role "${r.name}"?${r.userCount ? ` It is assigned to ${r.userCount} ${r.userCount === 1 ? 'person' : 'people'}.` : ''}`)) remove.mutate(r.id); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* create / edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit role' : 'Create new role'}</DialogTitle>
            <DialogDescription>{editing ? 'Change the details and permissions.' : 'Name the role and choose its permissions.'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="role-name">Name *</Label>
              <Input id="role-name" value={form.name} maxLength={100} disabled={renameLocked} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Security Analyst" />
              {renameLocked && <p className="text-xs text-dbi-textSecondary">Built-in roles cannot be renamed.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-desc">Description</Label>
              <Input id="role-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is this role for?" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Permissions * <span className="font-normal text-dbi-textSecondary">({form.permissionIds.length} selected)</span></Label>
                <button type="button" className="text-xs text-dbi-cyan" onClick={() => setForm({ ...form, permissionIds: form.permissionIds.length === permissions.length ? [] : permissions.map((p) => p.id) })}>
                  {form.permissionIds.length === permissions.length ? 'Clear all' : 'Select all'}
                </button>
              </div>
              {groups.map(([resource, list]) => (
                <div key={resource} className="space-y-2">
                  <h4 className="text-xs font-medium uppercase tracking-wider text-dbi-textSecondary">{titleCase(resource)}</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {list.map((p) => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-dbi-elevated/50 p-2 hover:bg-dbi-elevated" title={p.description ?? ''}>
                        <input type="checkbox" className="h-4 w-4" checked={form.permissionIds.includes(p.id)} onChange={() => toggle(p.id)} />
                        <span className="text-sm text-dbi-textPrimary">{titleCase(p.action)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!valid || save.isPending}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? 'Update role' : 'Create role'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* read-only view */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Permissions of {viewing?.name}</DialogTitle>
            <DialogDescription>{viewing?.permissions.length ?? 0} of {permissions.length} permissions</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {groups.map(([resource, list]) => {
              const granted = list.filter((p) => viewing?.permissions.some((g) => g.id === p.id));
              if (granted.length === 0) return null;
              return (
                <div key={resource}>
                  <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-dbi-textSecondary">{titleCase(resource)}</h4>
                  <div className="flex flex-wrap gap-2">
                    {granted.map((p) => <Badge key={p.id} className="bg-dbi-success/15 text-dbi-success">{titleCase(p.action)}</Badge>)}
                  </div>
                </div>
              );
            })}
            {viewing?.permissions.length === 0 && <p className="text-sm text-dbi-textSecondary">This role has no permissions.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
