import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { documentsApi, usersApi } from '@/lib/api';
import { Search, UserPlus, X, Link2, Clock, Shield } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface DocumentSharingDialogProps {
  documentId: string;
  documentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface User {
  id: string;
  fullName: string;
  email: string;
  role: string;
  department?: string;
}

interface SharePermission {
  userId: string;
  user: User;
  permission: 'VIEW' | 'EDIT' | 'COMMENT' | 'OWNER';
  sharedAt: string;
  sharedBy: string;
  expiresAt?: string;
  notifyOnAccess: boolean;
}

export function DocumentSharingDialog({ documentId, documentName, open, onOpenChange }: DocumentSharingDialogProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [permission, setPermission] = useState<'VIEW' | 'EDIT' | 'COMMENT'>('VIEW');
  const [expiresAt, setExpiresAt] = useState('');
  const [notifyOnAccess, setNotifyOnAccess] = useState(true);
  const [isSharing, setIsSharing] = useState(false);

  const { data: usersData } = useQuery({
    queryKey: ['users-for-sharing'],
    queryFn: () => usersApi.list({ limit: '100' }),
  });

  const { data: sharesData } = useQuery({
    queryKey: ['document-shares', documentId],
    queryFn: () => documentsApi.getShares(documentId),
    enabled: open && !!documentId,
  });

  const allUsers = usersData?.data?.items || [];
  const currentShares = sharesData?.data?.items || [];
  const filteredUsers = allUsers.filter((u: User) =>
    !currentShares.some((s: SharePermission) => s.userId === u.id) &&
    (u.fullName.toLowerCase().includes(search.toLowerCase()) ||
     u.email.toLowerCase().includes(search.toLowerCase()))
  );

  const addShareMutation = useMutation({
    mutationFn: async (data: { userId: string; permission: 'VIEW' | 'EDIT' | 'DOWNLOAD' | 'COMMENT' | 'FULL'; expiresAt?: string; notifyOnAccess: boolean }) => {
      return documentsApi.share(documentId, data);
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Document shared successfully' });
      queryClient.invalidateQueries({ queryKey: ['document-shares', documentId] });
      setSelectedUsers([]);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to share document', variant: 'destructive' });
    },
  });

  const removeShareMutation = useMutation({
    mutationFn: async (userId: string) => {
      return documentsApi.unshare(documentId, userId);
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Access removed' });
      queryClient.invalidateQueries({ queryKey: ['document-shares', documentId] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to remove access', variant: 'destructive' });
    },
  });

  const updatePermissionMutation = useMutation({
    mutationFn: async ({ userId, permission }: { userId: string; permission: 'VIEW' | 'EDIT' | 'DOWNLOAD' | 'COMMENT' | 'FULL' }) => {
      return documentsApi.updateSharePermission(documentId, userId, permission);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-shares', documentId] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update permission', variant: 'destructive' });
    },
  });

  const handleShare = async () => {
    if (selectedUsers.length === 0) {
      toast({ title: 'Error', description: 'Please select at least one user', variant: 'destructive' });
      return;
    }
    setIsSharing(true);
    try {
      for (const userId of selectedUsers) {
        await addShareMutation.mutateAsync({
          userId,
          permission,
          expiresAt: expiresAt || undefined,
          notifyOnAccess,
        });
      }
      setSelectedUsers([]);
    } finally {
      setIsSharing(false);
    }
  };

  const handleRemoveShare = (userId: string) => {
    if (confirm('Remove this user\'s access to the document?')) {
      removeShareMutation.mutate(userId);
    }
  };

  const handlePermissionChange = (userId: string, newPermission: 'VIEW' | 'EDIT' | 'DOWNLOAD' | 'COMMENT' | 'FULL') => {
    updatePermissionMutation.mutate({ userId, permission: newPermission });
  };

  const permissionOptions = [
    { value: 'VIEW', label: 'View Only', description: 'Can view and download' },
    { value: 'COMMENT', label: 'Comment', description: 'Can view, download, and add comments' },
    { value: 'EDIT', label: 'Edit', description: 'Can view, download, comment, and edit metadata' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-dbi-purple" />
            Share Document: {documentName}
          </DialogTitle>
          <DialogDescription>Manage who has access to this document and their permissions</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add New Shares Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Grant Access to Users
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
                <Input
                  placeholder="Search users by name or email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 pr-10 bg-dbi-elevated border-dbi-border"
                />
              </div>

              <ScrollArea className="max-h-40">
                {filteredUsers.length === 0 ? (
                  <p className="text-center text-dbi-textSecondary py-4">No users found or all users already have access</p>
                ) : (
                  <div className="space-y-2">
                    {filteredUsers.map((user: User) => (
                      <label key={user.id} className="flex items-center gap-3 p-2 hover:bg-dbi-elevated/50 rounded cursor-pointer">
                        <Checkbox
                          checked={selectedUsers.includes(user.id)}
                          onCheckedChange={checked =>
                            setSelectedUsers(prev => checked
                              ? [...prev, user.id]
                              : prev.filter(id => id !== user.id))
                          }
                        />
                        <div className="h-8 w-8 rounded-full bg-dbi-cyan/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-medium text-dbi-cyan">
                            {user.fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-dbi-textPrimary truncate">{user.fullName}</p>
                          <p className="text-xs text-dbi-textSecondary">{user.email}</p>
                        </div>
                        <Badge variant="secondary" className="text-xs">{user.role}</Badge>
                      </label>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {selectedUsers.length > 0 && (
                <div className="space-y-4 pt-4 border-t">
                  <div>
                    <Label>Permission Level</Label>
                    <Select value={permission} onValueChange={v => setPermission(v as 'VIEW' | 'EDIT' | 'COMMENT')}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {permissionOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex flex-col">
                              <span>{opt.label}</span>
                              <span className="text-xs text-dbi-textSecondary">{opt.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="expires-at">Expires At (Optional)</Label>
                      <Input
                        id="expires-at"
                        type="datetime-local"
                        value={expiresAt}
                        onChange={e => setExpiresAt(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                      <Checkbox
                        id="notify-access"
                        checked={notifyOnAccess}
                        onCheckedChange={(checked: boolean) => setNotifyOnAccess(checked)}
                      />
                      <Label htmlFor="notify-access" className="cursor-pointer text-sm">
                        Notify me when they access the document
                      </Label>
                    </div>
                  </div>

                  <Button onClick={handleShare} disabled={isSharing} className="w-full">
                    {isSharing ? 'Sharing...' : `Share with ${selectedUsers.length} user(s)`}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Current Shares Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Current Access ({currentShares.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentShares.length === 0 ? (
                <p className="text-center text-dbi-textSecondary py-8">No users have direct access to this document</p>
              ) : (
                <ScrollArea className="max-h-60">
                  <div className="space-y-3">
                    {currentShares.map((share: SharePermission) => (
                      <div key={share.userId} className="flex items-center justify-between p-3 bg-dbi-elevated/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-dbi-purple/20 flex items-center justify-center">
                            <span className="text-sm font-medium text-dbi-purple">
                              {share.user.fullName.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-sm text-dbi-textPrimary">{share.user.fullName}</p>
                            <p className="text-xs text-dbi-textSecondary">{share.user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Select
                            value={share.permission}
                            onValueChange={v => handlePermissionChange(share.userId, v as 'VIEW' | 'EDIT' | 'DOWNLOAD' | 'COMMENT' | 'FULL')}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="VIEW">View Only</SelectItem>
                              <SelectItem value="COMMENT">Comment</SelectItem>
                              <SelectItem value="EDIT">Edit</SelectItem>
                              <SelectItem value="FULL">Full Access</SelectItem>
                            </SelectContent>
                          </Select>
                          {share.expiresAt && (
                            <Badge variant="secondary" className="text-xs">
                              <Clock className="mr-1 h-3 w-3" />
                              Expires {formatDate(share.expiresAt)}
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveShare(share.userId)}
                            className="text-dbi-critical hover:text-dbi-critical"
                            title="Remove access"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Public Link Section */}
          <Card className="border-dbi-cyan/30 bg-dbi-cyan/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-dbi-cyan" />
                Public Share Link
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-dbi-textSecondary">
                Generate a secure link that anyone with the link can access (respects permission level).
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="https://dbi.example.com/share/..."
                  readOnly
                  className="flex-1 bg-dbi-elevated"
                />
                <Button variant="outline">Copy Link</Button>
                <Button variant="ghost" size="icon" title="Regenerate link">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <Select value={permission} onValueChange={v => setPermission(v as 'VIEW' | 'EDIT' | 'COMMENT')}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIEW">View Only</SelectItem>
                    <SelectItem value="COMMENT">Comment</SelectItem>
                  </SelectContent>
                </Select>
                <Label className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox
                    checked={notifyOnAccess}
                    onCheckedChange={(checked: boolean) => setNotifyOnAccess(checked)}
                  />
                  Notify on access
                </Label>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}