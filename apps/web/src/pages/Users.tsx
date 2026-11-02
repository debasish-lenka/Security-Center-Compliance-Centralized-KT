import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usersApi, rolesApi, accessApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Search, Edit, Trash2, Eye, UserPlus, Loader2, Mail, User } from 'lucide-react';
import { formatDate, getStatusColor } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const statusOptions = ['ALL', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'];
const roleOptions = ['ALL', 'SUPER_ADMIN', 'SECURITY_ADMIN', 'COMPLIANCE_ADMIN', 'PROJECT_ADMIN', 'AUDITOR', 'ANALYST', 'VIEWER'];

const userSchema = z.object({
  email: z.string().email('Invalid email address'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.string().min(1, 'Role is required'),
  department: z.string().optional(),
});

type UserFormData = z.infer<typeof userSchema>;

export function Users() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, _setPageSize] = useState(10);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const response = await rolesApi.list();
      const body = response.data;
      const list = body?.data?.items ?? body?.data ?? body?.items ?? body;
      return Array.isArray(list) ? list : [];
    },
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', search, statusFilter, roleFilter, currentPage, pageSize],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (roleFilter !== 'ALL') params.role = roleFilter;
      return usersApi.list(params);
    },
  });

  const users = data?.data?.items || [];
  const totalItems = data?.data?.total || users.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const roles = rolesData || [];

  const sortedUsers = useMemo(() => {
    if (!sortConfig) return users;
    return [...users].sort((a, b) => {
      let aVal = a[sortConfig.key as keyof typeof a];
      let bVal = b[sortConfig.key as keyof typeof b];
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [users, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await usersApi.delete(id);
      toast({ title: 'User deleted', description: 'The user has been deleted successfully' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete user', variant: 'destructive' });
    }
  };

  // Create User Form
  const form = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      email: '',
      fullName: '',
      role: '',
      department: '',
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const { user: me } = useAuth();
  const [inviteInfo, setInviteInfo] = useState<{ email: string; url?: string; error?: string } | null>(null);

  const resendInvite = async (u: { id: string; email: string }) => {
    try {
      const res = await accessApi.resendInvite(u.id);
      const invite = res.data?.data ?? res.data;
      if (invite.emailed) toast({ title: 'Invitation sent', description: `A new link was emailed to ${u.email}` });
      else setInviteInfo({ email: u.email, url: invite.url, error: invite.error });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.error?.message || 'Could not resend invitation', variant: 'destructive' });
    }
  };

  const resetMfa = async (u: { id: string; email: string }) => {
    if (!confirm(`Reset the authenticator for ${u.email}? They will set up a new one at next login.`)) return;
    try {
      await accessApi.resetMfa(u.id);
      toast({ title: 'Authenticator reset', description: `${u.email} will enroll again at next login` });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.error?.message || 'Could not reset', variant: 'destructive' });
    }
  };

  const onSubmit = async (data: UserFormData) => {
    setIsCreating(true);
    try {
      const res = await usersApi.create(data);
      const invite = res.data?.data?.invite ?? res.data?.invite;
      if (invite && !invite.emailed) {
        // Email isn't set up or failed: a super admin gets the link to pass on manually
        setInviteInfo({ email: data.email, url: invite.url, error: invite.error });
      } else {
        toast({ title: 'Invitation sent', description: `An activation link (valid 24 hours) was emailed to ${data.email}` });
      }
      setIsCreating(false);
      form.reset();
      setCreateOpen(false);
      refetch();
    } catch (error: any) {
      const message = error?.response?.data?.error?.message || 'Failed to create user';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">User Management</h1>
          <p className="text-dbi-textSecondary">Manage user accounts and access control</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>Fill in the details below to create a new user account.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john@company.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {roles.map((role: any) => (
                            <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Security Operations" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <p className="text-sm text-dbi-textSecondary">
                  No password is needed: the user receives an email with a link (valid 24 hours) to set their own password.
                  Admins also set up an authenticator app.
                </p>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => form.reset()}>Cancel</Button>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create User
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
            <CardTitle>All Users ({totalItems})</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
                <Input
                  placeholder="Search users..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                  className="pl-9 pr-10 w-64 bg-dbi-elevated border-dbi-border"
                />
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-40 bg-dbi-elevated border-dbi-border">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-48 bg-dbi-elevated border-dbi-border">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map(r => <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse bg-dbi-elevated rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-dbi-critical">Failed to load users</div>
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto h-16 w-16 text-dbi-textSecondary">
                <User className="h-16 w-16" />
              </div>
              <p className="mt-4 text-dbi-textSecondary">No users found</p>
              <Button onClick={() => setCreateOpen(true)} className="mt-4">
                <UserPlus className="mr-2 h-4 w-4" />
                Add First User
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        { key: 'fullName', label: 'Name' },
                        { key: 'email', label: 'Email' },
                        { key: 'role', label: 'Role' },
                        { key: 'department', label: 'Department' },
                        { key: 'status', label: 'Status' },
                        { key: 'lastLogin', label: 'Last Login' },
                        { key: 'createdAt', label: 'Created' },
                        { key: 'actions', label: 'Actions', sortable: false },
                      ].map(col => (
                        <TableHead key={col.key} className={col.sortable === false ? '' : 'cursor-pointer hover:bg-dbi-elevated'}>
                          {col.sortable !== false ? (
                            <button onClick={() => handleSort(col.key)} className="flex items-center gap-1">
                              {col.label}
                              {sortConfig?.key === col.key && (
                                sortConfig.direction === 'asc' ? (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                ) : (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                                )
                              )}
                            </button>
                          ) : (
                            col.label
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedUsers.map((user: any) => (
                      <TableRow key={user.id} className="hover:bg-dbi-elevated/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-dbi-cyan/20 flex items-center justify-center">
                              <span className="text-sm font-medium text-dbi-cyan">
                                {user.fullName?.charAt(0).toUpperCase() || 'U'}
                              </span>
                            </div>
                            <div>
                              <Link to={`/users/${user.id}`} className="font-medium text-dbi-textPrimary hover:text-dbi-cyan">
                                {user.fullName}
                              </Link>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-dbi-textSecondary">
                            <Mail className="h-4 w-4" />
                            {user.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {user.role?.name || user.role?.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">{user.department || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(user.status)}>
                            {user.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">
                          {user.lastLogin || user.lastActivityAt ? formatDate(user.lastLogin || user.lastActivityAt) : 'Never'}
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">{formatDate(user.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            {user.status === 'PENDING' && (
                              <Button variant="outline" size="sm" onClick={() => resendInvite(user)}>
                                Resend invite
                              </Button>
                            )}
                            {me?.role === 'SUPER_ADMIN' && ['ADMIN', 'SUPER_ADMIN'].includes(user.role) && user.status === 'ACTIVE' && (
                              <Button variant="outline" size="sm" onClick={() => resetMfa(user)}>
                                Reset 2FA
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" asChild>
                              <Link to={`/users/${user.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="icon" asChild>
                              <Link to={`/users/${user.id}/edit`}>
                                <Edit className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id)} className="text-dbi-critical hover:text-dbi-critical">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-dbi-textSecondary">
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} users
                  </p>
                  <Pagination
                    totalPages={totalPages}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    
      <Dialog open={!!inviteInfo} onOpenChange={(o) => !o && setInviteInfo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Account created, email not sent</DialogTitle>
            <DialogDescription>
              {inviteInfo?.error ? `${inviteInfo.error} ` : ''}
              {inviteInfo?.url
                ? `Send this one-time link (valid 24 hours) to ${inviteInfo.email} yourself:`
                : 'Ask a super admin to configure email, then use "Resend invite".'}
            </DialogDescription>
          </DialogHeader>
          {inviteInfo?.url && (
            <div className="space-y-3">
              <Input readOnly value={inviteInfo.url} onFocus={(e) => e.currentTarget.select()} />
              <Button onClick={() => { navigator.clipboard?.writeText(inviteInfo.url!); toast({ title: 'Link copied' }); }}>
                Copy link
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}