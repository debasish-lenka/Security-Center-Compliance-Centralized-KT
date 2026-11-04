import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { auditLogsApi } from '@/lib/api';
import { Shield, Filter, Search, ChevronDown, ChevronUp, FileText, Clock, User, Globe, Database, BookOpen, Bell, Download } from 'lucide-react';
import { formatRelativeTime, formatDateTimeIST } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface AuditEvent {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  action: string;
  resourceType: 'DOCUMENT' | 'PROJECT' | 'KT_REPORT' | 'USER' | 'COMPLIANCE_CONTROL' | 'TASK' | 'NOTIFICATION' | 'AUDIT_LOG' | 'DASHBOARD' | 'KNOWLEDGE_BOOK';
  resourceId: string;
  resourceName: string;
  projectId?: string;
  projectName?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  location?: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  tags: string[];
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
}

interface AdvancedAuditTimelineProps {
  documentId?: string;
  projectId?: string;
  userId?: string;
}

export function AdvancedAuditTimeline({ documentId, projectId, userId }: AdvancedAuditTimelineProps) {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [resourceFilter, setResourceFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [dateRange, setDateRange] = useState<'1h' | '24h' | '7d' | '30d' | '90d'>('24h');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);

  const params: Record<string, string> = {
    timeRange: dateRange,
    limit: String(pageSize),
    page: String(currentPage),
  };
  if (documentId) params.documentId = documentId;
  if (projectId) params.projectId = projectId;
  if (userId) params.userId = userId;

  const { data, isLoading, error: _error, refetch } = useQuery({
    queryKey: ['advanced-audit-timeline', documentId, projectId, userId, dateRange, actionFilter, resourceFilter, severityFilter, search, currentPage],
    queryFn: () => auditLogsApi.list(params),
    refetchInterval: 30000,
  });

  const events = data?.data?.items || [];
  const totalItems = data?.data?.total || events.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  const { data: actionsData } = useQuery({
    queryKey: ['audit-actions'],
    queryFn: () => auditLogsApi.getActions(),
  });

  const { data: resourcesData } = useQuery({
    queryKey: ['audit-resources'],
    queryFn: () => auditLogsApi.getResourceTypes(),
  });

  const actions = actionsData?.data?.items || [
    'CREATE', 'UPDATE', 'DELETE', 'VIEW', 'DOWNLOAD', 'UPLOAD', 'APPROVE', 'REJECT',
    'SUBMIT', 'ASSIGN', 'COMMENT', 'SHARE', 'UNSHARE', 'PERMISSION_CHANGE', 'LOGIN', 'LOGOUT', 'EXPORT', 'PRINT', 'PREVIEW'
  ];

  const resources = resourcesData?.data?.items || [
    'DOCUMENT', 'PROJECT', 'KT_REPORT', 'USER', 'COMPLIANCE_CONTROL', 'TASK',
    'NOTIFICATION', 'AUDIT_LOG', 'DASHBOARD', 'KNOWLEDGE_BOOK'
  ];

  const filteredEvents = events.filter((event: AuditEvent) => {
    if (actionFilter !== 'ALL' && event.action !== actionFilter) return false;
    if (resourceFilter !== 'ALL' && event.resourceType !== resourceFilter) return false;
    if (severityFilter !== 'ALL' && event.severity !== severityFilter) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      if (!event.resourceName.toLowerCase().includes(searchLower) &&
          !event.userName.toLowerCase().includes(searchLower) &&
          !event.userEmail.toLowerCase().includes(searchLower) &&
          !event.action.toLowerCase().includes(searchLower)) return false;
    }
    return true;
  });

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'DOCUMENT': return <FileText className="h-4 w-4 text-dbi-cyan" />;
      case 'PROJECT': return <Database className="h-4 w-4 text-dbi-purple" />;
      case 'KT_REPORT': return <FileText className="h-4 w-4 text-dbi-indigo" />;
      case 'USER': return <User className="h-4 w-4 text-dbi-green" />;
      case 'COMPLIANCE_CONTROL': return <Shield className="h-4 w-4 text-dbi-amber" />;
      case 'TASK': return <Clock className="h-4 w-4 text-dbi-blue" />;
      case 'NOTIFICATION': return <Bell className="h-4 w-4 text-dbi-pink" />;
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

  const toggleExpand = (id: string) => {
    setExpandedRow(prev => prev === id ? null : id);
  };

  const exportData = async () => {
    try {
      const response = await auditLogsApi.export({ documentId: documentId || '', projectId: projectId || '', userId: userId || '', timeRange: dateRange, format: 'csv' });
      const blob = response instanceof Blob ? response : response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-timeline-${documentId || projectId || userId || 'all'}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: 'Success', description: 'Audit timeline exported successfully' });
    } catch {
      toast({ title: 'Error', description: 'Failed to export timeline', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-dbi-textPrimary">Advanced Audit Timeline</h2>
          <p className="text-dbi-textSecondary">Comprehensive audit trail with detailed change tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={v => { setDateRange(v as any); setCurrentPage(1); }}>
            <SelectTrigger className="w-36 bg-dbi-elevated border-dbi-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
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
              <SelectValue placeholder="Resource Type" />
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
            <Input
              placeholder="Search events..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              className="pl-9 pr-10 w-64 bg-dbi-elevated border-dbi-border"
            />
          </div>
          <Button variant="outline" onClick={exportData}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <Filter className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Timeline View */}
      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline">Timeline View</TabsTrigger>
          <TabsTrigger value="table">Table View</TabsTrigger>
          <TabsTrigger value="changes">Change Details</TabsTrigger>
        </TabsList>

        {/* Timeline View - Visual timeline */}
        <TabsContent value="timeline">
          <Card>
            <CardContent className="pt-0">
              {isLoading && events.length === 0 ? (
                <div className="space-y-4 p-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-20 animate-pulse bg-dbi-elevated rounded-lg" />
                  ))}
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="mx-auto h-16 w-16 text-dbi-textSecondary" />
                  <p className="mt-4 text-dbi-textSecondary">No audit events found</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Vertical timeline line */}
                  <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-dbi-border" />

                  <div className="space-y-6 pl-4">
                    {filteredEvents.map((event: AuditEvent, _index: number) => (
                      <div key={event.id} className="relative">
                        {/* Timeline dot */}
                        <div className="absolute left-4 -translate-x-1/2 flex items-center justify-center">
                          <div className={`w-3 h-3 rounded-full border-2 ${
                            event.severity === 'CRITICAL' ? 'bg-dbi-critical border-dbi-critical' :
                            event.severity === 'WARNING' ? 'bg-dbi-warning border-dbi-warning' :
                            'bg-dbi-cyan border-dbi-cyan'
                          }`} />
                        </div>

                        {/* Event card */}
                        <Card className={`ml-12 ${event.severity === 'CRITICAL' ? 'border-dbi-critical/30' : event.severity === 'WARNING' ? 'border-dbi-warning/30' : ''} transition-all hover:shadow-lg`}>
                          <CardContent className="p-4">
                            <div className="flex items-start gap-4">
                              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-dbi-elevated flex items-center justify-center">
                                {getResourceIcon(event.resourceType)}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <Badge variant="secondary" className={getActionColor(event.action)}>
                                    {event.action}
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

                                <div className="mt-2 text-xs text-dbi-textSecondary">
                                  {formatRelativeTime(event.timestamp)} • {formatDateTimeIST(event.timestamp)}
                                  {event.ipAddress && <span className="ml-2">• {event.ipAddress}</span>}
                                </div>

                                {/* Expandable details */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2 text-dbi-cyan hover:text-dbi-cyan"
                                  onClick={() => toggleExpand(event.id)}
                                >
                                  {expandedRow === event.id ? (
                                    <>
                                      <ChevronUp className="mr-1 h-4 w-4" />
                                      Hide Details
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="mr-1 h-4 w-4" />
                                      Show Details
                                    </>
                                  )}
                                </Button>
                              </div>

                              <div className="text-right text-sm text-dbi-textSecondary">
                                {event.timestamp}
                              </div>
                            </div>

                            {/* Expanded details */}
                            {expandedRow === event.id && (
                              <div className="mt-4 pt-4 border-t animate-slide-down">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <h4 className="font-medium text-dbi-textSecondary mb-2">Previous State</h4>
                                    <pre className="bg-dbi-elevated p-3 rounded text-xs overflow-x-auto max-h-48">
                                      {event.previousState ? JSON.stringify(event.previousState, null, 2) : 'No previous state recorded'}
                                    </pre>
                                  </div>
                                  <div>
                                    <h4 className="font-medium text-dbi-textSecondary mb-2">New State</h4>
                                    <pre className="bg-dbi-elevated p-3 rounded text-xs overflow-x-auto max-h-48">
                                      {event.newState ? JSON.stringify(event.newState, null, 2) : 'No new state recorded'}
                                    </pre>
                                  </div>
                                  <div className="md:col-span-2">
                                    <h4 className="font-medium text-dbi-textSecondary mb-2">Event Details</h4>
                                    <pre className="bg-dbi-elevated p-3 rounded text-xs overflow-x-auto max-h-48">
                                      {JSON.stringify(event.details, null, 2)}
                                    </pre>
                                  </div>
                                  <div className="md:col-span-2">
                                    <h4 className="font-medium text-dbi-textSecondary mb-2">Metadata</h4>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                      <div><span className="text-dbi-textSecondary">User:</span> <span className="ml-2">{event.userName} ({event.userEmail})</span></div>
                                      <div><span className="text-dbi-textSecondary">Role:</span> <span className="ml-2">{event.userRole}</span></div>
                                      <div><span className="text-dbi-textSecondary">IP:</span> <span className="ml-2">{event.ipAddress || 'N/A'}</span></div>
                                      <div><span className="text-dbi-textSecondary">Location:</span> <span className="ml-2">{event.location || 'N/A'}</span></div>
                                      <div><span className="text-dbi-textSecondary">User Agent:</span> <span className="ml-2 truncate block">{event.userAgent || 'N/A'}</span></div>
                                      <div><span className="text-dbi-textSecondary">Resource ID:</span> <span className="ml-2 font-mono">{event.resourceId}</span></div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
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
        </TabsContent>

        {/* Table View */}
        <TabsContent value="table">
          <Card>
            <CardContent className="pt-0">
              {isLoading && events.length === 0 ? (
                <div className="space-y-4 p-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-12 animate-pulse bg-dbi-elevated rounded-lg" />
                  ))}
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="mx-auto h-16 w-16 text-dbi-textSecondary" />
                  <p className="mt-4 text-dbi-textSecondary">No audit events found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">Severity</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Resource</TableHead>
                        <TableHead>Resource Name</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>IP/Location</TableHead>
                        <TableHead className="w-24">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEvents.map((event: AuditEvent) => (
                        <TableRow
                          key={event.id}
                          className={event.severity === 'CRITICAL' ? 'bg-dbi-critical/5' : event.severity === 'WARNING' ? 'bg-dbi-warning/5' : 'hover:bg-dbi-elevated/50'}
                        >
                          <TableCell>
                            <Badge variant="secondary" className={getSeverityColor(event.severity)}>
                              {event.severity}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-dbi-textSecondary">
                            <div>{formatRelativeTime(event.timestamp)}</div>
                            <div className="text-xs">{formatDateTimeIST(event.timestamp)}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={getActionColor(event.action)}>
                              {event.action}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getResourceIcon(event.resourceType)}
                              <span className="text-xs text-dbi-textSecondary">{event.resourceType}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-dbi-textPrimary max-w-xs truncate">{event.resourceName}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm text-dbi-textPrimary">{event.userName}</p>
                              <p className="text-xs text-dbi-textSecondary">{event.userEmail}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-dbi-textSecondary">{event.projectName || 'N/A'}</TableCell>
                          <TableCell className="text-sm text-dbi-textSecondary">
                            {event.location || event.ipAddress || 'Unknown'}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => toggleExpand(event.id)} className="text-dbi-cyan hover:text-dbi-cyan">
                              {expandedRow === event.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
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
        </TabsContent>

        {/* Change Details View */}
        <TabsContent value="changes">
          <Card>
            <CardHeader>
              <CardTitle>State Changes</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && events.length === 0 ? (
                <div className="space-y-4 p-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-20 animate-pulse bg-dbi-elevated rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredEvents
                    .filter((e: AuditEvent) => e.previousState || e.newState)
                    .map((event: AuditEvent) => (
                      <Card key={event.id} className={event.severity === 'CRITICAL' ? 'border-dbi-critical/30' : ''}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-dbi-elevated flex items-center justify-center">
                                {getResourceIcon(event.resourceType)}
                              </div>
                              <div>
                                <p className="font-medium text-dbi-textPrimary">{event.resourceName}</p>
                                <p className="text-sm text-dbi-textSecondary">{event.action} • {formatDateTimeIST(event.timestamp)}</p>
                              </div>
                            </div>
                            <Badge variant="secondary" className={getSeverityColor(event.severity)}>
                              {event.severity}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {event.previousState && (
                              <div>
                                <h5 className="font-medium text-dbi-critical mb-2">Previous State</h5>
                                <pre className="bg-dbi-elevated p-3 rounded text-xs overflow-x-auto max-h-64">
                                  {JSON.stringify(event.previousState, null, 2)}
                                </pre>
                              </div>
                            )}
                            {event.newState && (
                              <div>
                                <h5 className="font-medium text-dbi-success mb-2">New State</h5>
                                <pre className="bg-dbi-elevated p-3 rounded text-xs overflow-x-auto max-h-64">
                                  {JSON.stringify(event.newState, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  {filteredEvents.filter((e: AuditEvent) => e.previousState || e.newState).length === 0 && (
                    <div className="text-center py-12">
                      <Database className="mx-auto h-16 w-16 text-dbi-textSecondary" />
                      <p className="mt-4 text-dbi-textSecondary">No state changes recorded in this period</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

