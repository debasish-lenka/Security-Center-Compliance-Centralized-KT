import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Search, Check, CheckCheck, Trash2, Mail, AlertCircle, Info, RefreshCw } from 'lucide-react';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useNotifications } from '@/hooks/useNotifications';

const readOptions = ['ALL', 'UNREAD', 'READ'];

export function Notifications() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [readFilter, setReadFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, _setPageSize] = useState(10);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    notifications: allNotifications,
    unreadCount,
    isLoading,
    error,
    isConnected,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refetch
  } = useNotifications({ pollInterval: 30000 });

  // the types that really occur (they differ per kind of event)
  const typeOptions = ['ALL', ...Array.from(new Set(allNotifications.map(n => n.type)))];

  // Filter notifications based on search and filters
  const filteredNotifications = useMemo(() => {
    let result = [...allNotifications];

    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(n =>
        n.title.toLowerCase().includes(searchLower) ||
        n.message.toLowerCase().includes(searchLower)
      );
    }

    if (typeFilter !== 'ALL') {
      result = result.filter(n => n.type === typeFilter);
    }

    if (readFilter === 'UNREAD') {
      result = result.filter(n => !n.read);
    } else if (readFilter === 'READ') {
      result = result.filter(n => n.read);
    }

    return result;
  }, [allNotifications, search, typeFilter, readFilter]);

  const totalItems = filteredNotifications.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedNotifications = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredNotifications.slice(start, start + pageSize);
  }, [filteredNotifications, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, typeFilter, readFilter]);

  const sortedNotifications = useMemo(() => {
    if (!sortConfig) return paginatedNotifications;
    return [...paginatedNotifications].sort((a, b) => {
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
  }, [paginatedNotifications, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === sortedNotifications.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(sortedNotifications.map(n => n.id));
    }
  };

  const handleMarkRead = async (ids: string[]) => {
    setIsMarkingRead(true);
    try {
      for (const id of ids) {
        await markAsRead(id);
      }
      toast({ title: 'Success', description: `${ids.length} notification(s) marked as read` });
      setSelectedIds([]);
    } catch {
      toast({ title: 'Error', description: 'Failed to mark as read', variant: 'destructive' });
    }
    setIsMarkingRead(false);
  };

  const handleMarkAllRead = async () => {
    setIsMarkingRead(true);
    try {
      await markAllAsRead();
      toast({ title: 'Success', description: 'All notifications marked as read' });
      setSelectedIds([]);
    } catch {
      toast({ title: 'Error', description: 'Failed to mark all as read', variant: 'destructive' });
    }
    setIsMarkingRead(false);
  };

  const handleDelete = async (ids: string[]) => {
    if (!confirm(`Delete ${ids.length} notification(s)?`)) return;
    setIsDeleting(true);
    try {
      for (const id of ids) {
        await deleteNotification(id);
      }
      toast({ title: 'Success', description: `${ids.length} notification(s) deleted` });
      setSelectedIds([]);
    } catch {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    }
    setIsDeleting(false);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'SECURITY_ALERT': return <AlertCircle className="h-4 w-4 text-dbi-critical" />;
      case 'SUCCESS': return <CheckCheck className="h-4 w-4 text-dbi-success" />;
      case 'WARNING': return <AlertCircle className="h-4 w-4 text-dbi-warning" />;
      case 'ERROR': return <AlertCircle className="h-4 w-4 text-dbi-critical" />;
      case 'INFO': return <Info className="h-4 w-4 text-dbi-cyan" />;
      default: return <AlertCircle className="h-4 w-4 text-dbi-indigo" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'SECURITY_ALERT': return 'bg-rose-500/20 text-rose-300';
      case 'SUCCESS': return 'bg-emerald-500/20 text-emerald-300';
      case 'WARNING': return 'bg-amber-500/20 text-amber-300';
      case 'ERROR': return 'bg-rose-500/20 text-rose-300';
      case 'INFO': return 'bg-cyan-500/20 text-cyan-300';
      default: return 'bg-indigo-500/20 text-indigo-300';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">Notifications</h1>
          <p className="text-dbi-textSecondary">Stay updated with system alerts and activities</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" onClick={handleMarkAllRead} disabled={isMarkingRead}>
              <Check className="mr-2 h-4 w-4" />
              Mark All Read ({unreadCount})
            </Button>
          )}
        </div>
      </div>

      {/* Connection Status Indicator */}
      <div className="flex items-center gap-2 text-xs text-dbi-textSecondary">
        <span className={`flex h-2 w-2 rounded-full ${isConnected ? 'bg-dbi-success' : 'bg-dbi-critical'}`} />
        <span>{isConnected ? 'Real-time connected' : 'Connecting...'}</span>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-dbi-cyan/10 border border-dbi-cyan/20 rounded-lg">
          <span className="text-sm text-dbi-cyan">{selectedIds.length} selected</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => handleMarkRead(selectedIds)} disabled={isMarkingRead}>
              <Check className="mr-1 h-3 w-3" />
              Mark Read
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleDelete(selectedIds)} disabled={isDeleting} className="text-dbi-critical border-dbi-critical/20 hover:bg-dbi-critical/10">
              <Trash2 className="mr-1 h-3 w-3" />
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>All Notifications ({totalItems})</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
                <Input
                  placeholder="Search notifications..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                  className="pl-9 pr-10 w-64 bg-dbi-elevated border-dbi-border"
                />
              </div>
              <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-40 bg-dbi-elevated border-dbi-border">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={readFilter} onValueChange={v => { setReadFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-32 bg-dbi-elevated border-dbi-border">
                  <SelectValue placeholder="Read" />
                </SelectTrigger>
                <SelectContent>
                  {readOptions.map(r => <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && allNotifications.length === 0 ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse bg-dbi-elevated rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-dbi-critical">Failed to load notifications</div>
          ) : sortedNotifications.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto h-16 w-16 text-dbi-textSecondary">
                <AlertCircle className="h-16 w-16" />
              </div>
              <p className="mt-4 text-dbi-textSecondary">No notifications found</p>
              <p className="text-sm text-dbi-textSecondary">You're all caught up!</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <input
                          type="checkbox"
                          checked={selectedIds.length === sortedNotifications.length && sortedNotifications.length > 0}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-dbi-border text-dbi-cyan focus:ring-dbi-cyan"
                        />
                      </TableHead>
                      {[
                        { key: 'type', label: 'Type' },
                        { key: 'title', label: 'Title' },
                        { key: 'message', label: 'Message' },
                        { key: 'read', label: 'Status' },
                        { key: 'createdAt', label: 'Time' },
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
                    {sortedNotifications.map((notification: any) => (
                      <TableRow
                        key={notification.id}
                        className={`hover:bg-dbi-elevated/50 ${!notification.read ? 'bg-dbi-cyan/5' : ''}`}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(notification.id)}
                            onChange={() => toggleSelect(notification.id)}
                            className="h-4 w-4 rounded border-dbi-border text-dbi-cyan focus:ring-dbi-cyan"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${getTypeColor(notification.type)}`}>
                              {getTypeIcon(notification.type)}
                            </div>
                            <Badge variant="secondary" className={getTypeColor(notification.type)}>
                              {notification.type.replace('_', ' ')}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className={!notification.read ? 'font-medium' : ''}>
                          <Link
                            to={notification.link || '#'}
                            onClick={() => !notification.read && markAsRead(notification.id)}
                            className="text-dbi-textPrimary hover:text-dbi-cyan"
                          >
                            {notification.title}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary max-w-md truncate">
                          {notification.message}
                        </TableCell>
                        <TableCell>
                          <Badge variant={notification.read ? 'secondary' : 'default'} className={notification.read ? '' : 'bg-dbi-cyan/20 text-dbi-cyan'}>
                            {notification.read ? (
                              <>
                                <CheckCheck className="mr-1 h-3 w-3" />
                                Read
                              </>
                            ) : (
                              <>
                                <Mail className="mr-1 h-3 w-3" />
                                Unread
                              </>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">
                          <div>{formatRelativeTime(notification.createdAt)}</div>
                          <div className="text-xs">{formatDate(notification.createdAt)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {!notification.read && (
                              <Button variant="ghost" size="icon" onClick={() => markAsRead(notification.id)} title="Mark as read">
                                <Check className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => handleDelete([notification.id])} className="text-dbi-critical hover:text-dbi-critical" title="Delete">
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
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} notifications
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
    </div>
  );
}