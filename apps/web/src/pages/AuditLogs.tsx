import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditLogsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Eye, FileText, AlertTriangle, User, Download, Shield, Database, Loader2 } from 'lucide-react';
import { formatDateTimeIST, formatRelativeTime, getStatusColor } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

const outcomeOptions = ['ALL', 'SUCCESS', 'FAILURE'];

export function AuditLogs() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [resourceFilter, setResourceFilter] = useState('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'createdAt', direction: 'desc' });
  const [viewingLog, setViewingLog] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Filter choices come from what is really in the log
  const { data: actions = [] } = useQuery({ queryKey: ['audit-actions'], queryFn: async () => ((await auditLogsApi.getActions()).data?.data ?? []) as string[] });
  const { data: resourceTypes = [] } = useQuery({ queryKey: ['audit-resource-types'], queryFn: async () => ((await auditLogsApi.getResourceTypes()).data?.data ?? []) as string[] });

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-logs', search, actionFilter, resourceFilter, outcomeFilter, startDate, endDate, currentPage, pageSize, sortConfig],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (actionFilter !== 'ALL') params.action = actionFilter;
      if (resourceFilter !== 'ALL') params.resourceType = resourceFilter;
      if (outcomeFilter !== 'ALL') params.outcome = outcomeFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      params.page = String(currentPage);
      params.limit = String(pageSize);
      if (sortConfig?.key) params.sortBy = sortConfig.key;
      if (sortConfig?.direction) params.sortOrder = sortConfig.direction;
      return auditLogsApi.list(params);
    },
  });

  const logs = data?.data?.items || [];
  const totalItems = data?.data?.total || logs.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  const sortedLogs = useMemo(() => {
    if (!sortConfig) return logs;
    return [...logs].sort((a, b) => {
      let aVal = a[sortConfig.key as keyof typeof a];
      let bVal = b[sortConfig.key as keyof typeof b];
      if (aVal instanceof Date) aVal = aVal.getTime();
      if (bVal instanceof Date) bVal = bVal.getTime();
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [logs, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (actionFilter !== 'ALL') params.action = actionFilter;
      if (resourceFilter !== 'ALL') params.resourceType = resourceFilter;
      if (outcomeFilter !== 'ALL') params.outcome = outcomeFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const response = await auditLogsApi.export(params);
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: 'Exported', description: 'Audit logs exported successfully' });
    } catch {
      toast({ title: 'Error', description: 'Failed to export audit logs', variant: 'destructive' });
    }
    setIsExporting(false);
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      CREATE: 'bg-emerald-500/20 text-emerald-300',
      READ: 'bg-cyan-500/20 text-cyan-300',
      UPDATE: 'bg-amber-500/20 text-amber-300',
      DELETE: 'bg-rose-500/20 text-rose-300',
      LOGIN: 'bg-indigo-500/20 text-indigo-300',
      LOGOUT: 'bg-slate-500/20 text-slate-300',
      EXPORT: 'bg-purple-500/20 text-purple-300',
      IMPORT: 'bg-purple-500/20 text-purple-300',
      APPROVE: 'bg-emerald-500/20 text-emerald-300',
      REJECT: 'bg-rose-500/20 text-rose-300',
      ASSIGN: 'bg-cyan-500/20 text-cyan-300',
      UNASSIGN: 'bg-amber-500/20 text-amber-300',
      ARCHIVE: 'bg-slate-500/20 text-slate-300',
      RESTORE: 'bg-emerald-500/20 text-emerald-300',
    };
    return colors[action] || 'bg-dbi-textSecondary/20 text-dbi-textSecondary';
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'CREATE': return <FileText className="h-3 w-3" />;
      case 'DELETE': return <AlertTriangle className="h-3 w-3" />;
      case 'LOGIN': return <User className="h-3 w-3" />;
      case 'EXPORT': return <Download className="h-3 w-3" />;
      case 'APPROVE': case 'REJECT': return <Shield className="h-3 w-3" />;
      default: return <Database className="h-3 w-3" />;
    }
  };

  const getResourceIcon = (resource: string) => {
    switch (resource.toUpperCase()) {
      case 'USER': return <User className="h-3 w-3" />;
      case 'PROJECT': return <FileText className="h-3 w-3" />;
      case 'DOCUMENT': return <FileText className="h-3 w-3" />;
      case 'KT_REPORT': return <FileText className="h-3 w-3" />;
      case 'COMPLIANCE_CONTROL': return <Shield className="h-3 w-3" />;
      case 'ROLE': return <Shield className="h-3 w-3" />;
      case 'SETTING': return <Database className="h-3 w-3" />;
      default: return <Database className="h-3 w-3" />;
    }
  };

  const formatDetails = (details: any) => {
    if (!details) return 'No details';
    if (typeof details === 'string') return details;
    return JSON.stringify(details, null, 2);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">Audit Logs</h1>
          <p className="text-dbi-textSecondary">Track all system activities and security events</p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={isExporting}>
          <Download className="mr-2 h-4 w-4" />
          {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Export CSV'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Audit Logs ({totalItems})</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
                <Input
                  placeholder="Search logs..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                  className="pl-9 pr-10 w-64 bg-dbi-elevated border-dbi-border"
                />
              </div>
              <Select value={actionFilter} onValueChange={v => { setActionFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-36 bg-dbi-elevated border-dbi-border">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  {['ALL', ...actions].map(a => <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={resourceFilter} onValueChange={v => { setResourceFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-40 bg-dbi-elevated border-dbi-border">
                  <SelectValue placeholder="Resource" />
                </SelectTrigger>
                <SelectContent>
                  {['ALL', ...resourceTypes].map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={outcomeFilter} onValueChange={v => { setOutcomeFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-32 bg-dbi-elevated border-dbi-border">
                  <SelectValue placeholder="Outcome" />
                </SelectTrigger>
                <SelectContent>
                  {outcomeOptions.map(s => <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>)}
                </SelectContent>
              </Select>
              <input type="date" aria-label="From date" title="From date" value={startDate} max={endDate || undefined} onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }} className="h-10 rounded-md border border-dbi-border bg-dbi-elevated px-3 text-sm text-dbi-textPrimary" />
              <input type="date" aria-label="To date" title="To date" value={endDate} min={startDate || undefined} onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }} className="h-10 rounded-md border border-dbi-border bg-dbi-elevated px-3 text-sm text-dbi-textPrimary" />
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
            <div className="text-center py-8 text-dbi-critical">Failed to load audit logs</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto h-16 w-16 text-dbi-textSecondary">
                <FileText className="h-16 w-16" />
              </div>
              <p className="mt-4 text-dbi-textSecondary">No audit logs found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        { key: 'createdAt', label: 'Timestamp' },
                        { key: 'actor', label: 'Actor' },
                        { key: 'action', label: 'Action' },
                        { key: 'resourceType', label: 'Resource' },
                        { key: 'resourceId', label: 'Resource ID' },
                        { key: 'outcome', label: 'Outcome' },
                        { key: 'ipAddress', label: 'IP Address' },
                        { key: 'actions', label: 'Details', sortable: false },
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
                    {sortedLogs.map((log: any) => (
                      <TableRow key={log.id} className="hover:bg-dbi-elevated/50">
                        <TableCell className="text-sm text-dbi-textSecondary whitespace-nowrap">
                          <div>{formatRelativeTime(log.createdAt)}</div>
                          <div className="text-xs">{formatDateTimeIST(log.createdAt)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-dbi-indigo/20 flex items-center justify-center">
                              <span className="text-sm font-medium text-dbi-indigo">
                                {log.actor?.fullName?.charAt(0).toUpperCase() || 'U'}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-dbi-textPrimary">{log.actor?.fullName}</p>
                              <p className="text-xs text-dbi-textSecondary">{log.actor?.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${getActionColor(log.action)}`}>
                              {getActionIcon(log.action)}
                            </div>
                            <Badge className={getActionColor(log.action)}>
                              {log.action}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-lg bg-dbi-cyan/20 flex items-center justify-center">
                              {getResourceIcon(log.resourceType)}
                            </div>
                            <span className="text-sm font-medium">{log.resourceType.replace('_', ' ')}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-dbi-textSecondary max-w-xs truncate">
                          {log.resourceId}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(log.outcome)}>
                            {log.outcome}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary font-mono">
                          {log.ipAddress || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setViewingLog(log)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-dbi-textSecondary">
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} logs
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

      {/* Log Detail Dialog */}
      <Dialog open={!!viewingLog} onOpenChange={open => !open && setViewingLog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-dbi-textSecondary">Log ID</p>
                <p className="font-mono text-dbi-textPrimary">{viewingLog?.id}</p>
              </div>
              <div>
                <p className="text-dbi-textSecondary">Timestamp</p>
                <p className="font-mono text-dbi-textPrimary">{formatDateTimeIST(viewingLog?.createdAt)}</p>
              </div>
              <div>
                <p className="text-dbi-textSecondary">Action</p>
                <Badge className={getActionColor(viewingLog?.action)}>{viewingLog?.action}</Badge>
              </div>
              <div>
                <p className="text-dbi-textSecondary">Resource</p>
                <p className="text-dbi-textPrimary">{viewingLog?.resourceType.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-dbi-textSecondary">Resource ID</p>
                <p className="font-mono text-dbi-textPrimary">{viewingLog?.resourceId}</p>
              </div>
              <div>
                <p className="text-dbi-textSecondary">Outcome</p>
                <Badge className={getStatusColor(viewingLog?.outcome)}>{viewingLog?.outcome}</Badge>
              </div>
              <div>
                <p className="text-dbi-textSecondary">IP Address</p>
                <p className="font-mono text-dbi-textPrimary">{viewingLog?.ipAddress || 'N/A'}</p>
              </div>
              <div>
                <p className="text-dbi-textSecondary">User Agent</p>
                <p className="text-dbi-textSecondary truncate max-w-xs">{viewingLog?.userAgent || 'N/A'}</p>
              </div>
            </div>
            <div>
              <p className="text-dbi-textSecondary">Actor</p>
              <p className="text-dbi-textPrimary">{viewingLog?.actor?.fullName} ({viewingLog?.actor?.email})</p>
            </div>
            <div>
              <p className="text-dbi-textSecondary">Details</p>
              <pre className="mt-2 p-3 bg-dbi-elevated rounded-lg text-xs overflow-x-auto font-mono text-dbi-textPrimary">
                {formatDetails(viewingLog?.details)}
              </pre>
            </div>
            {viewingLog?.metadata && (
              <div>
                <p className="text-dbi-textSecondary">Metadata</p>
                <pre className="mt-2 p-3 bg-dbi-elevated rounded-lg text-xs overflow-x-auto font-mono text-dbi-textPrimary">
                  {JSON.stringify(viewingLog.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}