import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { auditLogsApi, projectsApi, usersApi } from '@/lib/api';
import { Pause, Play, Search, Download, Loader2, ChevronDown, TrendingUp, FileText, Database, User, Shield, Clock, Bell as BellIcon, BookOpen, Globe, Activity } from 'lucide-react';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface ActivityEvent {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName: string;
  projectId?: string;
  projectName?: string;
  details: Record<string, any>;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  tags: string[];
  ipAddress?: string;
  location?: string;
}

interface ActivityFeedProps {
  projectId?: string;
  userId?: string;
  documentId?: string;
}

export function ActivityFeed({ projectId, userId, documentId }: ActivityFeedProps) {
  const [paused, setPaused] = useState(false);
  const [timeRange, setTimeRange] = useState<'1m' | '5m' | '15m' | '1h' | '6h' | '24h'>('15m');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [resourceFilter, setResourceFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [projectFilter, setProjectFilter] = useState(projectId || 'ALL');
  const [userFilter, setUserFilter] = useState(userId || 'ALL');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [isConnected] = useState(true);
  const [notificationCount, setNotificationCount] = useState(0);

  const params: Record<string, string> = {
    timeRange,
    limit: String(pageSize),
    page: String(currentPage),
  };
  if (documentId) params.documentId = documentId;
  if (projectId) params.projectId = projectId;
  if (userId) params.userId = userId;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['activity-feed', documentId, projectId, userId, timeRange, actionFilter, resourceFilter, severityFilter, projectFilter, userFilter, search, currentPage],
    queryFn: () => auditLogsApi.getActivityFeed(params),
    refetchInterval: !paused ? 15000 : false,
    refetchOnWindowFocus: !paused,
  });

  const events = data?.data?.items || [];
  const totalItems = data?.data?.total || events.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  const { data: actionsData } = useQuery({
    queryKey: ['activity-actions'],
    queryFn: () => auditLogsApi.getActions(),
  });

  const { data: resourcesData } = useQuery({
    queryKey: ['activity-resources'],
    queryFn: () => auditLogsApi.getResourceTypes(),
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects-for-activity'],
    queryFn: () => projectsApi.list({ limit: '100' }),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-for-activity'],
    queryFn: () => usersApi.list({ limit: '100' }),
  });

  const actions = actionsData?.data?.items || [
    'CREATE', 'UPDATE', 'DELETE', 'VIEW', 'DOWNLOAD', 'UPLOAD', 'APPROVE', 'REJECT',
    'SUBMIT', 'ASSIGN', 'COMMENT', 'SHARE', 'UNSHARE', 'PERMISSION_CHANGE', 'LOGIN', 'LOGOUT', 'EXPORT', 'PRINT', 'PREVIEW'
  ];

  const resources = resourcesData?.data?.items || [
    'DOCUMENT', 'PROJECT', 'KT_REPORT', 'USER', 'COMPLIANCE_CONTROL', 'TASK',
    'NOTIFICATION', 'AUDIT_LOG', 'DASHBOARD', 'KNOWLEDGE_BOOK'
  ];

  const projects = projectsData?.data?.items || [];
  const users = usersData?.data?.items || [];

  const filteredEvents = events.filter((event: ActivityEvent) => {
    if (actionFilter !== 'ALL' && event.action !== actionFilter) return false;
    if (resourceFilter !== 'ALL' && event.resourceType !== resourceFilter) return false;
    if (severityFilter !== 'ALL' && event.severity !== severityFilter) return false;
    if (projectFilter !== 'ALL' && event.projectId !== projectFilter) return false;
    if (userFilter !== 'ALL' && event.userId !== userFilter) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      if (!event.resourceName.toLowerCase().includes(searchLower) &&
          !event.userName.toLowerCase().includes(searchLower) &&
          !event.userEmail.toLowerCase().includes(searchLower) &&
          !event.action.toLowerCase().includes(searchLower)) return false;
    }
    return true;
  });

  // Track new events for notifications
  const previousEventsRef = useRef<string[]>([]);
  useEffect(() => {
    if (!paused && events.length > 0) {
      const currentIds = events.map((e: ActivityEvent) => e.id);
      const newIds = currentIds.filter((id: string) => !previousEventsRef.current.includes(id));
      if (newIds.length > 0 && previousEventsRef.current.length > 0) {
        setNotificationCount(prev => prev + newIds.length);
      }
      previousEventsRef.current = currentIds;
    }
  }, [events, paused]);

  const clearNotifications = () => setNotificationCount(0);

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'DOCUMENT': return <FileText className="h-4 w-4 text-dbi-cyan" />;
      case 'PROJECT': return <Database className="h-4 w-4 text-dbi-purple" />;
      case 'KT_REPORT': return <FileText className="h-4 w-4 text-dbi-indigo" />;
      case 'USER': return <User className="h-4 w-4 text-dbi-green" />;
      case 'COMPLIANCE_CONTROL': return <Shield className="h-4 w-4 text-dbi-amber" />;
      case 'TASK': return <Clock className="h-4 w-4 text-dbi-blue" />;
      case 'NOTIFICATION': return <BellIcon className="h-4 w-4 text-dbi-pink" />;
      case 'KNOWLEDGE_BOOK': return <BookOpen className="h-4 w-4 text-dbi-purple" />;
      default: return <Globe className="h-4 w-4 text-dbi-textSecondary" />;
    }
  };

  const getActionColor = (action: string) => {
    const createActions = ['CREATE', 'UPLOAD', 'SUBMIT', 'ASSIGN'];
    const deleteActions = ['DELETE', 'REJECT', 'REMOVE'];
    const updateActions = ['UPDATE', 'APPROVE', 'PERMISSION_CHANGE', 'SHARE', 'UNSHARE'];
    const readActions = ['VIEW', 'DOWNLOAD', 'PREVIEW', 'PRINT', 'EXPORT'];

    if (createActions.includes(action)) return 'bg-dbi-success/20 text-dbi-success';
    if (deleteActions.includes(action)) return 'bg-dbi-critical/20 text-dbi-critical';
    if (updateActions.includes(action)) return 'bg-dbi-warning/20 text-dbi-warning';
    if (readActions.includes(action)) return 'bg-dbi-cyan/20 text-dbi-cyan';
    return 'bg-dbi-textSecondary/20 text-dbi-textSecondary';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-dbi-critical/20 text-dbi-critical border-dbi-critical/30';
      case 'WARNING': return 'bg-dbi-warning/20 text-dbi-warning border-dbi-warning/30';
      default: return 'bg-dbi-cyan/20 text-dbi-cyan border-dbi-cyan/30';
    }
  };

  const exportData = async () => {
    try {
      const response = await auditLogsApi.export({ documentId: documentId || '', projectId: projectId || '', userId: userId || '', timeRange, format: 'csv' });
      const blob = response instanceof Blob ? response : response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-feed-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: 'Success', description: 'Activity feed exported successfully' });
    } catch {
      toast({ title: 'Error', description: 'Failed to export feed', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-dbi-textPrimary">Activity Feed</h2>
            <p className="text-dbi-textSecondary">Real-time system activity with pause/filter controls</p>
          </div>

          {/* Connection status and pause control */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-dbi-elevated border">
              <span className={`h-2 w-2 rounded-full ${isConnected && !paused ? 'bg-dbi-success' : 'bg-dbi-critical'}`} />
              <span className="text-sm text-dbi-textSecondary">
                {paused ? 'Paused' : isConnected ? 'Live' : 'Disconnected'}
              </span>
            </div>

            <Button
              variant={paused ? 'default' : 'outline'}
              onClick={() => setPaused(!paused)}
              className="flex items-center gap-2"
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {paused ? 'Resume' : 'Pause'}
            </Button>

            {notificationCount > 0 && (
              <Button
                variant="outline"
                onClick={clearNotifications}
                className="flex items-center gap-2 border-dbi-cyan text-dbi-cyan"
              >
                <BellIcon className="h-4 w-4" />
                {notificationCount} new
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={timeRange} onValueChange={v => { setTimeRange(v as any); setCurrentPage(1); }}>
            <SelectTrigger className="w-32 bg-dbi-elevated border-dbi-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1m">Last Minute</SelectItem>
              <SelectItem value="5m">Last 5 Minutes</SelectItem>
              <SelectItem value="15m">Last 15 Minutes</SelectItem>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="6h">Last 6 Hours</SelectItem>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
            </SelectContent>
          </Select>

          <Select value={actionFilter} onValueChange={v => { setActionFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-36 bg-dbi-elevated border-dbi-border">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Actions</SelectItem>
              {actions.map((a: string) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={resourceFilter} onValueChange={v => { setResourceFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-40 bg-dbi-elevated border-dbi-border">
              <SelectValue placeholder="Resource" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Resources</SelectItem>
              {resources.map((r: string) => <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={severityFilter} onValueChange={v => { setSeverityFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-32 bg-dbi-elevated border-dbi-border">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="INFO">Info</SelectItem>
              <SelectItem value="WARNING">Warning</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
            </SelectContent>
          </Select>

          <Select value={projectFilter} onValueChange={v => { setProjectFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-40 bg-dbi-elevated border-dbi-border">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Projects</SelectItem>
              {projects.map((p: { id: string; name: string }) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={userFilter} onValueChange={v => { setUserFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-40 bg-dbi-elevated border-dbi-border">
              <SelectValue placeholder="User" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Users</SelectItem>
              {users.map((u: { id: string; fullName: string }) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              className="pl-9 pr-10 w-56 bg-dbi-elevated border-dbi-border"
            />
          </div>

          <Button variant="outline" onClick={exportData}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Feed */}
      <Card>
        <CardContent className="pt-0">
          {isLoading && events.length === 0 ? (
            <div className="space-y-4 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse bg-dbi-elevated rounded-lg" />
              ))}
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="mx-auto h-16 w-16 text-dbi-textSecondary" />
              <p className="mt-4 text-dbi-textSecondary">No activity events found</p>
              <p className="text-sm text-dbi-textSecondary">Adjust filters or wait for new events</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredEvents.map((event: ActivityEvent, _index: number) => (
                <div
                  key={event.id}
                  className={`p-4 hover:bg-dbi-elevated/30 transition-colors ${
                    event.severity === 'CRITICAL' ? 'bg-dbi-critical/5 border-l-4 border-dbi-critical' :
                    event.severity === 'WARNING' ? 'bg-dbi-warning/5 border-l-4 border-dbi-warning' :
                    ''
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Timeline indicator */}
                    <div className="flex flex-col items-center">
                      <div className={`w-2 h-2 rounded-full mt-1 ${
                        event.severity === 'CRITICAL' ? 'bg-dbi-critical' :
                        event.severity === 'WARNING' ? 'bg-dbi-warning' :
                        'bg-dbi-cyan'
                      }`} />
                      {_index < filteredEvents.length - 1 && (
                        <div className="w-0.5 h-full bg-dbi-border mt-1 flex-1" />
                      )}
                    </div>

                    {/* Event content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge variant="secondary" className={getActionColor(event.action)}>
                          {getResourceIcon(event.resourceType)}
                          <span className="ml-1">{event.action}</span>
                        </Badge>
                        <Badge variant="secondary" className={getSeverityColor(event.severity)}>
                          {event.severity}
                        </Badge>
                        {event.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>

                      <div className="mt-2 flex items-center gap-4 text-sm text-dbi-textSecondary flex-wrap">
                        <span className="font-medium text-dbi-textPrimary">{event.resourceName}</span>
                        <span>{event.projectName ? `in ${event.projectName}` : 'Global'}</span>
                        <span>by {event.userName} ({event.userRole})</span>
                      </div>

                      <div className="mt-1 text-xs text-dbi-textSecondary flex items-center gap-4 flex-wrap">
                        <span>{formatRelativeTime(event.timestamp)}</span>
                        <span>{formatDate(event.timestamp)}</span>
                        {event.ipAddress && <span>• {event.ipAddress}</span>}
                        {event.location && <span>• {event.location}</span>}
                      </div>

                      {/* Expandable details */}
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm text-dbi-cyan hover:text-dbi-cyan flex items-center gap-1">
                          <ChevronDown className="h-4 w-4" />
                          Show details
                        </summary>
                        <div className="mt-2 p-3 bg-dbi-elevated rounded text-xs overflow-x-auto">
                          <pre>{JSON.stringify(event.details, null, 2)}</pre>
                        </div>
                      </details>
                    </div>

                    {/* Timestamp */}
                    <div className="text-right text-xs text-dbi-textSecondary whitespace-nowrap">
                      {formatRelativeTime(event.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-dbi-textSecondary">
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} events
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

