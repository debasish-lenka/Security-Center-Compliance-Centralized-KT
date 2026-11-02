import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { rolesApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Plus, Search, Edit, Trash2, Shield, Key, Loader2, Users, Check, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const permissionCategories = {
  'Users': ['users.read', 'users.write', 'users.delete', 'users.manage_roles'],
  'Projects': ['projects.read', 'projects.write', 'projects.delete', 'projects.manage_members'],
  'Documents': ['documents.read', 'documents.write', 'documents.delete', 'documents.manage'],
  'KT Reports': ['kt_reports.read', 'kt_reports.write', 'kt_reports.delete', 'kt_reports.publish'],
  'Compliance': ['compliance.read', 'compliance.write', 'compliance.delete', 'compliance.manage'],
  'Notifications': ['notifications.read', 'notifications.write', 'notifications.manage'],
  'Audit Logs': ['audit_logs.read', 'audit_logs.export'],
  'Settings': ['settings.read', 'settings.write', 'settings.manage_system'],
  'Roles': ['roles.read', 'roles.write', 'roles.delete', 'roles.manage_permissions'],
};

const roleSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  permissions: z.array(z.string()).min(1, 'At least one permission is required'),
});

type RoleFormData = z.infer<typeof roleSchema>;

export function Roles() {
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [viewingPermissions, setViewingPermissions] = useState<any>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['roles', search],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      return rolesApi.list(params);
    },
  });

  const roles = data?.data?.items || [];
  const totalItems = data?.data?.total || roles.length;

  // Create/Edit Role Form
  const form = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: '',
      description: '',
      permissions: [],
    },
  });

  const onSubmit = async (data: RoleFormData) => {
    setIsCreating(true);
    try {
      if (editingRole) {
        await rolesApi.update(editingRole.id, data);
        toast({ title: 'Role updated', description: 'The role has been updated successfully' });
      } else {
        await rolesApi.create(data);
        toast({ title: 'Role created', description: 'The role has been created successfully' });
      }
      setIsCreating(false);
      form.reset();
      setEditingRole(null);
      refetch();
    } catch {
      toast({ title: 'Error', description: editingRole ? 'Failed to update role' : 'Failed to create role', variant: 'destructive' });
      setIsCreating(false);
    }
  };

  const handleEdit = (role: any) => {
    form.reset({
      name: role.name,
      description: role.description || '',
      permissions: role.permissions || [],
    });
    setEditingRole(role);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this role?')) return;
    try {
      await rolesApi.delete(id);
      toast({ title: 'Role deleted', description: 'The role has been deleted successfully' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete role', variant: 'destructive' });
    }
  };

  const handleViewPermissions = (role: any) => {
    setViewingPermissions(role);
  };

  const formatPermission = (perm: string) => {
    const [resource, action] = perm.split('.');
    return `${resource.charAt(0).toUpperCase() + resource.slice(1)}: ${action.charAt(0).toUpperCase() + action.slice(1)}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-dbi-elevated rounded w-1/4" />
        <div className="h-64 bg-dbi-elevated rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">Roles & Permissions</h1>
          <p className="text-dbi-textSecondary">Manage role-based access control</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button onClick={() => { form.reset(); setEditingRole(null); }}>
              <Plus className="mr-2 h-4 w-4" />
              New Role
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRole ? 'Edit Role' : 'Create New Role'}</DialogTitle>
              <DialogDescription>
                {editingRole ? 'Modify the role details and permissions below.' : 'Define a new role with specific permissions.'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., SECURITY_ANALYST" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input placeholder="Role description" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="permissions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Permissions</FormLabel>
                      <div className="space-y-4">
                        {Object.entries(permissionCategories).map(([category, permissions]) => (
                          <div key={category} className="space-y-2">
                            <h4 className="text-sm font-medium text-dbi-textSecondary uppercase tracking-wider">{category}</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {permissions.map((perm) => (
                                <label key={perm} className="flex items-center gap-2 p-2 bg-dbi-elevated/50 rounded-lg hover:bg-dbi-elevated cursor-pointer transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={field.value.includes(perm)}
                                    onChange={(e) => {
                                      const newValue = e.target.checked
                                        ? [...field.value, perm]
                                        : field.value.filter((p: string) => p !== perm);
                                      field.onChange(newValue);
                                    }}
                                    className="h-4 w-4 rounded border-dbi-border text-dbi-cyan focus:ring-dbi-cyan"
                                  />
                                  <span className="text-sm text-dbi-textPrimary">{formatPermission(perm)}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => { form.reset(); setEditingRole(null); }}>Cancel</Button>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {editingRole ? 'Update Role' : 'Create Role'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>All Roles ({totalItems})</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
              <Input
                placeholder="Search roles..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-10 w-64 bg-dbi-elevated border-dbi-border"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-center py-8 text-dbi-critical">Failed to load roles</div>
          ) : roles.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto h-16 w-16 text-dbi-textSecondary">
                <Shield className="h-16 w-16" />
              </div>
              <p className="mt-4 text-dbi-textSecondary">No roles found</p>
              <Button onClick={() => { form.reset(); setEditingRole(null); }} className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Create First Role
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>System</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role: any) => (
                    <TableRow key={role.id} className="hover:bg-dbi-elevated/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-dbi-indigo/20 flex items-center justify-center">
                            <Shield className="h-5 w-5 text-dbi-indigo" />
                          </div>
                          <div>
                            <Link to={`/roles/${role.id}`} className="font-medium text-dbi-textPrimary hover:text-dbi-cyan">
                              {role.name}
                            </Link>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-dbi-textSecondary max-w-xs truncate">
                        {role.description || 'No description'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(role.permissions || []).slice(0, 4).map((perm: string) => (
                            <Badge key={perm} variant="secondary" className="text-xs h-5 px-2">
                              {formatPermission(perm)}
                            </Badge>
                          ))}
                          {(role.permissions || []).length > 4 && (
                            <Badge variant="outline" className="text-xs h-5 px-2">
                              +{(role.permissions || []).length - 4} more
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-dbi-textSecondary">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {role._count?.users || 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={role.isSystem ? 'secondary' : 'outline'} className="text-xs">
                          {role.isSystem ? 'System' : 'Custom'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleViewPermissions(role)} title="View Permissions">
                            <Key className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(role)} title="Edit">
                            <Edit className="h-4 w-4" />
                          </Button>
                          {!role.isSystem && (
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(role.id)} className="text-dbi-critical hover:text-dbi-critical" title="Delete">
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

      {/* Permissions Detail Dialog */}
      <Dialog open={!!viewingPermissions} onOpenChange={open => !open && setViewingPermissions(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Permissions for {viewingPermissions?.name}</DialogTitle>
            <DialogDescription>All permissions assigned to this role</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {Object.entries(permissionCategories).map(([category, permissions]) => (
              <div key={category}>
                <h4 className="text-sm font-medium text-dbi-textSecondary uppercase tracking-wider mb-2">{category}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {permissions.map((perm) => (
                    <div
                      key={perm}
                      className={`flex items-center gap-2 p-2 rounded-lg ${viewingPermissions?.permissions?.includes(perm)
                        ? 'bg-dbi-success/10 text-dbi-success'
                        : 'bg-dbi-elevated/50 text-dbi-textSecondary'}`}
                    >
                      {viewingPermissions?.permissions?.includes(perm) ? (
                        <Check className="h-4 w-4 flex-shrink-0" />
                      ) : (
                        <X className="h-4 w-4 flex-shrink-0" />
                      )}
                      <span className="text-sm">{formatPermission(perm)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}