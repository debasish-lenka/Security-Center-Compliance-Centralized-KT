import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usersApi, accessApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Search, Edit, Eye, UserPlus, Loader2, Mail, User, KeyRound, Send, ShieldOff, UserX, UserCheck } from 'lucide-react';
import { getStatusColor, formatDateTimeIST } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const statusOptions = ['ALL', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'];
// Mirrors the API's UserRole enum, so the dropdown never depends on a request succeeding
const ROLES = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SECURITY_ADMIN', label: 'Security Admin' },
  { value: 'SECURITY_ANALYST', label: 'Security Analyst' },
  { value: 'COMPLIANCE_OFFICER', label: 'Compliance Officer' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'USER', label: 'User' },
  { value: 'VIEWER', label: 'Viewer' },
];
const roleOptions = ['ALL', ...ROLES.map((r) => r.value)];

const userSchema = z.object({
  email: z.string().email('Invalid email address'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.string().min(1, 'Role is required'),
  department: z.string().optional(),
  authType: z.enum(['PASSWORD', 'INVITE', 'MICROSOFT']),
  password: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.authType === 'PASSWORD' && !(v.password && v.password.length >= 10 && /[A-Za-z]/.test(v.password) && /\d/.test(v.password))) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: 'At least 10 characters, with a letter and a number' });
  }
});

type UserFormData = z.infer<typeof userSchema>;

export function Users() {
  const { user: me } = useAuth();
  // Email invitations and Microsoft sign-in only appear once an admin has configured them
  const { data: signIn } = useQuery({
    queryKey: ['sign-in-options'],
    queryFn: async () => (await accessApi.signInOptions()).data?.data as { invite: boolean; microsoft: boolean },
  });
  const [pwUser, setPwUser] = useState<{ id: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const pwOk = newPassword.length >= 10 && /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword);

  const savePassword = async () => {
    if (!pwUser) return;
    setPwSaving(true);
    try {
      await accessApi.setPassword(pwUser.id, newPassword);
      toast({ title: 'Password updated', description: `Give the new password to ${pwUser.email}` });
      setPwUser(null);
      setNewPassword('');
      refetch();
    } catch (e: any) {
      toast({ title: 'Could not set password', description: e?.response?.data?.error?.message || 'Please try again', variant: 'destructive' });
    } finally {
      setPwSaving(false);
    }
  };
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, _setPageSize] = useState(10);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [isCreating, setIsCreating] = useState(false);

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
  // Only a super admin may create admin accounts (the API enforces this too)
  const assignableRoles = ROLES.filter((r) => me?.role === 'SUPER_ADMIN' || !['SUPER_ADMIN', 'ADMIN'].includes(r.value));

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

  // Accounts are never deleted (their history must stay); they are deactivated and can be reactivated
  const toggleActive = async (u: { id: string; fullName: string; status: string }) => {
    const activating = u.status !== 'ACTIVE';
    if (!activating && !confirm(`Deactivate ${u.fullName}? They are signed out at once and cannot log in until reactivated.`)) return;
    try {
      await usersApi.update(u.id, { status: activating ? 'ACTIVE' : 'INACTIVE' });
      toast({ title: activating ? 'Account reactivated' : 'Account deactivated' });
      refetch();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.error?.message || 'Could not change the status', variant: 'destructive' });
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
      authType: 'PASSWORD',
      password: '',
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
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
      const res = await usersApi.create({ ...data, password: data.authType === 'PASSWORD' ? data.password : undefined });
      const invite = res.data?.data?.invite ?? res.data?.invite;
      if (invite && !invite.emailed) {
        // Email isn't set up or failed: a super admin gets the link to pass on manually
        setInviteInfo({ email: data.email, url: invite.url, error: invite.error });
      } else {
        toast(
          data.authType === 'INVITE'
            ? { title: 'Invitation sent', description: `An activation link (valid 24 hours) was emailed to ${data.email}` }
            : data.authType === 'MICROSOFT'
              ? { title: 'User created', description: `${data.email} can now use "Sign in with Microsoft"` }
              : { title: 'User created', description: `Give ${data.email} the password you set. They can sign in right away.` }
        );
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
                          {assignableRoles.map((role) => (
                            <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
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
                <div className="space-y-2">
                  <FormLabel>How will this person sign in?</FormLabel>
                  <div className="grid gap-2">
                    {([
                      ['PASSWORD', 'Password set by me', 'I set a password now and hand it over'],
                      ['INVITE', 'Email invitation', 'They get a link (valid 24 hours) and choose their own password'],
                      ['MICROSOFT', 'Microsoft 365 account', 'They sign in with their company Microsoft account'],
                    ] as const).filter(([value]) => value === 'PASSWORD' || (value === 'INVITE' && signIn?.invite) || (value === 'MICROSOFT' && signIn?.microsoft)).map(([value, title, hint]) => (
                      <label
                        key={value}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                          form.watch('authType') === value ? 'border-dbi-cyan bg-dbi-cyan/10' : 'border-dbi-border hover:bg-dbi-elevated'
                        }`}
                      >
                        <input
                          type="radio"
                          className="mt-1"
                          checked={form.watch('authType') === value}
                          onChange={() => form.setValue('authType', value, { shouldValidate: true })}
                        />
                        <span>
                          <span className="block text-sm font-medium text-dbi-textPrimary">{title}</span>
                          <span className="block text-xs text-dbi-textSecondary">{hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                {form.watch('authType') === 'PASSWORD' && (
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="text" autoComplete="off" placeholder="At least 10 characters, a letter and a number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <p className="text-xs text-dbi-textSecondary">
                  Admin and Super Admin accounts that use a password also set up an authenticator app at first sign-in.
                  Microsoft 365 users are protected by your Microsoft security settings instead.
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
                  {roleOptions.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}
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
                          {user.lastLogin || user.lastActivityAt ? formatDateTimeIST(user.lastLogin || user.lastActivityAt) : 'Never'}
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">{formatDateTimeIST(user.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            {(me?.role === 'SUPER_ADMIN' || !['SUPER_ADMIN', 'ADMIN'].includes(user.role)) && (
                              <Button variant="ghost" size="icon" title="Set password" aria-label="Set password" onClick={() => { setPwUser(user); setNewPassword(''); }}>
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            )}
                            {user.status === 'PENDING' && (
                              <Button variant="ghost" size="icon" title="Resend invite" aria-label="Resend invite" onClick={() => resendInvite(user)}>
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                            {me?.role === 'SUPER_ADMIN' && ['ADMIN', 'SUPER_ADMIN'].includes(user.role) && user.status === 'ACTIVE' && (
                              <Button variant="ghost" size="icon" title="Reset 2FA" aria-label="Reset 2FA" onClick={() => resetMfa(user)}>
                                <ShieldOff className="h-4 w-4" />
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
                            {user.status !== 'PENDING' && user.id !== me?.id && (me?.role === 'SUPER_ADMIN' || !['SUPER_ADMIN', 'ADMIN'].includes(user.role)) && (
                              <Button variant="ghost" size="icon" onClick={() => toggleActive(user)} title={user.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'} aria-label={user.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'} className={user.status === 'ACTIVE' ? 'text-dbi-critical hover:text-dbi-critical' : 'text-dbi-success hover:text-dbi-success'}>
                                {user.status === 'ACTIVE' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                              </Button>
                            )}
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
    
      <Dialog open={!!pwUser} onOpenChange={(o) => { if (!o) { setPwUser(null); setNewPassword(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set a new password</DialogTitle>
            <DialogDescription>For {pwUser?.email}. Tell them the password yourself; it cannot be viewed again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input autoComplete="off" placeholder="At least 10 characters, a letter and a number" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            {newPassword && !pwOk && <p className="text-xs text-dbi-critical">At least 10 characters, with a letter and a number.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwUser(null)}>Cancel</Button>
            <Button onClick={savePassword} disabled={!pwOk || pwSaving}>
              {pwSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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