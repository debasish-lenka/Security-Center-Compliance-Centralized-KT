import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { documentsApi, auditLogsApi } from '@/lib/api';
import { AlertTriangle, Eye, Download, Shield, Wifi, WifiOff, TrendingUp, Users, FileText, X, Loader2, Filter } from 'lucide-react';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface MonitorEvent {
  id: string;
  documentId: string;
  documentName: string;
  projectId?: string;
  projectName?: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: 'VIEW' | 'DOWNLOAD' | 'EDIT' | 'SHARE' | 'DELETE' | 'UPLOAD' | 'PRINT' | 'PREVIEW' | 'COMMENT' | 'PERMISSION_CHANGE';
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  location?: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  flags: string[];
  metadata?: Record<string, any>;
}

interface AdminMonitoringProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function AdminDocumentMonitoring({ autoRefresh = true, refreshInterval = 10000 }: AdminMonitoringProps) {
  const [timeRange, setTimeRange] = useState<'5m' | '15m' | '1h' | '6h' | '24h'>('15m');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'INFO' | 'WARNING' | 'CRITICAL'>('ALL');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [isConnected] = useState(true);
  const [paused, setPaused] = useState(false);
  const [stickyAlerts, setStickyAlerts] = useState<MonitorEvent[]>([]);

  const params: Record<string, string> = {
    timeRange,
    limit: '500',
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-document-monitoring', timeRange, severityFilter, actionFilter],
    queryFn: () => documentsApi.getAdminMonitoring(params),
    refetchInterval: autoRefresh && !paused ? refreshInterval : false,
    refetchOnWindowFocus: false,
  });

  const events = data?.data?.items || [];
  const summary = data?.data?.summary || {
    totalEvents: 0,
    criticalCount: 0,
    warningCount: 0,
    uniqueUsers: 0,
    uniqueDocuments: 0,
  };

  const filteredEvents = events.filter((event: MonitorEvent) => {
    if (severityFilter !== 'ALL' && event.severity !== severityFilter) return false;
    if (actionFilter !== 'ALL' && event.action !== actionFilter) return false;
    if (search && !event.documentName.toLowerCase().includes(search.toLowerCase()) &&
        !event.userName.toLowerCase().includes(search.toLowerCase()) &&
        !event.userEmail.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Check for new critical events to add to sticky alerts
  useEffect(() => {
    const criticalEvents = events.filter((e: MonitorEvent) => e.severity === 'CRITICAL');
    if (criticalEvents.length > 0) {
      const latestCritical = criticalEvents[0];
      setStickyAlerts(prev => {
        if (prev.some(a => a.id === latestCritical.id)) return prev;
        return [latestCritical, ...prev.slice(0, 4)];
      });
    }
  }, [events]);

  const dismissStickyAlert = (id: string) => {
    setStickyAlerts(prev => prev.filter(a => a.id !== id));
  };

  const clearAllStickyAlerts = () => {
    setStickyAlerts([]);
  };

  const exportLog = async () => {
    try {
      const response = await auditLogsApi.export({ timeRange, format: 'csv' });
      const blob = response instanceof Blob ? response : response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `admin-monitoring-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: 'Success', description: 'Monitoring log exported' });
    } catch {
      toast({ title: 'Error', description: 'Failed to export log', variant: 'destructive' });
    }
  };

  // Sticky Critical Alerts Banner
  if (stickyAlerts.length > 0) {
    return (
      <div className="space-y-4">
        <div className="fixed top-4 right-4 z-50 w-96 space-y-2 animate-slide-in">
          {stickyAlerts.map(alert => (
            <Card key={alert.id} className="border-dbi-critical/50 bg-dbi-critical/5 shadow-lg">
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-dbi-critical mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dbi-critical text-sm">Critical Access Detected</p>
                    <p className="text-xs text-dbi-textSecondary mt-1">
                      {alert.userName} performed <strong>{alert.action}</strong> on "{alert.documentName}"
                    </p>
                    <p className="text-xs text-dbi-textSecondary">{formatRelativeTime(alert.timestamp)}</p>
                    {alert.flags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {alert.flags.map(flag => (
                          <Badge key={flag} variant="destructive" className="text-xs">{flag}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => dismissStickyAlert(alert.id)} className="text-dbi-critical">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {stickyAlerts.length > 1 && (
            <Button variant="outline" size="sm" onClick={clearAllStickyAlerts} className="w-full">
              Dismiss All ({stickyAlerts.length})
            </Button>
          )}
        </div>

        {/* Main Monitoring Dashboard */}
        <div className="space-y-6 pt-8">
          <MonitoringDashboardContent
            events={filteredEvents}
            summary={summary}
            isLoading={isLoading}
            error={error}
            isConnected={isConnected}
            paused={paused}
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            severityFilter={severityFilter}
            setSeverityFilter={setSeverityFilter}
            actionFilter={actionFilter}
            setActionFilter={setActionFilter}
            search={search}
            setSearch={setSearch}
            onRefresh={refetch}
            onExport={exportLog}
            setPaused={setPaused}
          />
        </div>
      </div>
    );
  }

  return (
    <MonitoringDashboardContent
      events={filteredEvents}
      summary={summary}
      isLoading={isLoading}
      error={error}
      isConnected={isConnected}
      paused={paused}
      timeRange={timeRange}
      setTimeRange={setTimeRange}
      severityFilter={severityFilter}
      setSeverityFilter={setSeverityFilter}
      actionFilter={actionFilter}
      setActionFilter={setActionFilter}
      search={search}
      setSearch={setSearch}
      onRefresh={refetch}
      onExport={exportLog}
      setPaused={setPaused}
    />
  );
}

function MonitoringDashboardContent({
  events,
  summary,
  isLoading,
  error,
  isConnected,
  paused,
  timeRange,
  setTimeRange,
  severityFilter,
  setSeverityFilter,
  actionFilter,
  setActionFilter,
  search,
  setSearch,
  onRefresh,
  onExport,
  setPaused,
}: {
  events: MonitorEvent[];
  summary: any;
  isLoading: boolean;
  error: any;
  isConnected: boolean;
  paused: boolean;
  timeRange: '5m' | '15m' | '1h' | '6h' | '24h';
  setTimeRange: (v: '5m' | '15m' | '1h' | '6h' | '24h') => void;
  severityFilter: 'ALL' | 'INFO' | 'WARNING' | 'CRITICAL';
  setSeverityFilter: (v: 'ALL' | 'INFO' | 'WARNING' | 'CRITICAL') => void;
  actionFilter: string;
  setActionFilter: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  onRefresh: () => void;
  onExport: () => void;
  setPaused: (v: boolean) => void;
}) {
  const actions = ['ALL', 'VIEW', 'DOWNLOAD', 'EDIT', 'SHARE', 'DELETE', 'UPLOAD', 'PRINT', 'PREVIEW', 'COMMENT', 'PERMISSION_CHANGE'];

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'DOWNLOAD': return <Download className="h-4 w-4 text-dbi-success" />;
      case 'DELETE': return <AlertTriangle className="h-4 w-4 text-dbi-critical" />;
      case 'SHARE': return <Users className="h-4 w-4 text-dbi-purple" />;
      case 'PERMISSION_CHANGE': return <Shield className="h-4 w-4 text-dbi-warning" />;
      case 'VIEW': return <Eye className="h-4 w-4 text-dbi-cyan" />;
      default: return <FileText className="h-4 w-4 text-dbi-textSecondary" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-dbi-critical/20 text-dbi-critical border-dbi-critical/30';
      case 'WARNING': return 'bg-dbi-warning/20 text-dbi-warning border-dbi-warning/30';
      default: return 'bg-dbi-cyan/20 text-dbi-cyan border-dbi-cyan/30';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-dbi-textPrimary">Admin Document Monitoring</h2>
          <p className="text-dbi-textSecondary">Real-time document access monitoring with anomaly detection</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isConnected && !paused ? 'bg-dbi-success' : 'bg-dbi-critical'}`} />
            <span className="text-sm text-dbi-textSecondary">
              {paused ? 'Paused' : isConnected ? 'Live' : 'Disconnected'}
            </span>
          </div>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32 bg-dbi-elevated border-dbi-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5m">Last 5 min</SelectItem>
              <SelectItem value="15m">Last 15 min</SelectItem>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="6h">Last 6 Hours</SelectItem>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
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
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-36 bg-dbi-elevated border-dbi-border">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              {actions.map((a: string) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-10 w-56 bg-dbi-elevated border-dbi-border"
            />
          </div>
          <Button variant="outline" onClick={onExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button variant={paused ? 'default' : 'outline'} onClick={() => setPaused(!paused)}>
            {paused ? <WifiOff className="mr-2 h-4 w-4" /> : <Wifi className="mr-2 h-4 w-4" />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-dbi-textSecondary/30">
          <CardContent className="p-4">
            <p className="text-sm text-dbi-textSecondary">Total Events</p>
            <p className="text-2xl font-bold text-dbi-textPrimary">{summary.totalEvents}</p>
          </CardContent>
        </Card>
        <Card className="border-dbi-critical/30">
          <CardContent className="p-4">
            <p className="text-sm text-dbi-textSecondary">Critical</p>
            <p className="text-2xl font-bold text-dbi-critical">{summary.criticalCount}</p>
          </CardContent>
        </Card>
        <Card className="border-dbi-warning/30">
          <CardContent className="p-4">
            <p className="text-sm text-dbi-textSecondary">Warnings</p>
            <p className="text-2xl font-bold text-dbi-warning">{summary.warningCount}</p>
          </CardContent>
        </Card>
        <Card className="border-dbi-purple/30">
          <CardContent className="p-4">
            <p className="text-sm text-dbi-textSecondary">Unique Users</p>
            <p className="text-2xl font-bold text-dbi-purple">{summary.uniqueUsers}</p>
          </CardContent>
        </Card>
        <Card className="border-dbi-cyan/30">
          <CardContent className="p-4">
            <p className="text-sm text-dbi-textSecondary">Unique Documents</p>
            <p className="text-2xl font-bold text-dbi-cyan">{summary.uniqueDocuments}</p>
          </CardContent>
        </Card>
      </div>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>Live Event Stream ({events.length} events)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && events.length === 0 ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse bg-dbi-elevated rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-dbi-critical">Failed to load monitoring data</div>
          ) : events.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="mx-auto h-16 w-16 text-dbi-textSecondary" />
              <p className="mt-4 text-dbi-textSecondary">No events matching current filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Severity</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Location/IP</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.slice(0, 100).map((event: MonitorEvent) => (
                    <TableRow
                      key={event.id}
                      className={event.severity === 'CRITICAL' ? 'bg-dbi-critical/5' : event.severity === 'WARNING' ? 'bg-dbi-warning/5' : 'hover:bg-dbi-elevated/50'}
                    >
                      <TableCell>
                        <Badge variant="secondary" className={getSeverityColor(event.severity)}>
                          {event.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getActionIcon(event.action)}
                          <span className="font-mono text-sm">{event.action}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-dbi-textPrimary">{event.documentName}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm text-dbi-textPrimary">{event.userName}</p>
                          <p className="text-xs text-dbi-textSecondary">{event.userEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-dbi-textSecondary">
                        {event.projectName || 'N/A'}
                      </TableCell>
                      <TableCell className="text-sm text-dbi-textSecondary">
                        <div>{formatRelativeTime(event.timestamp)}</div>
                        <div className="text-xs">{formatDate(event.timestamp)}</div>
                      </TableCell>
                      <TableCell className="text-sm text-dbi-textSecondary">
                        {event.location || event.ipAddress || 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {event.flags.map(flag => (
                            <Badge key={flag} variant={flag.includes('ANOMALY') ? 'destructive' : 'secondary'} className="text-xs">
                              {flag}
                            </Badge>
                          ))}
                          {event.flags.length === 0 && (
                            <span className="text-xs text-dbi-textSecondary">None</span>
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
    </div>
  );
}