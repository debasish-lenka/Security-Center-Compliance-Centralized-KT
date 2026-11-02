import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { documentsApi } from '@/lib/api';
import { Download, TrendingUp, TrendingDown, AlertTriangle, Users, FileText, Clock, Eye, MousePointer } from 'lucide-react';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface AccessEvent {
  id: string;
  documentId: string;
  documentName: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: 'VIEW' | 'DOWNLOAD' | 'EDIT' | 'SHARE' | 'COMMENT' | 'PRINT' | 'PREVIEW';
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  location?: string;
  duration?: number;
  watermarkApplied?: boolean;
}

interface DocumentAccessAnalyticsProps {
  documentId?: string;
  projectId?: string;
}

export function DocumentAccessAnalytics({ documentId, projectId }: DocumentAccessAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | '90d'>('7d');
  const [actionFilter, setActionFilter] = useState<string>('ALL');

  const params: Record<string, string> = {
    timeRange,
    limit: '1000',
  };
  if (documentId) params.documentId = documentId;
  if (projectId) params.projectId = projectId;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['document-access-analytics', documentId, projectId, timeRange],
    queryFn: () => documentsApi.getAccessAnalytics(params),
    refetchInterval: 30000,
  });

  const events = data?.data?.items || [];
  const summary = data?.data?.summary || {
    totalViews: 0,
    totalDownloads: 0,
    uniqueUsers: 0,
    avgDuration: 0,
    anomalyCount: 0,
  };

  const filteredEvents = actionFilter === 'ALL'
    ? events
    : events.filter((e: AccessEvent) => e.action === actionFilter);

  const actions = ['ALL', 'VIEW', 'DOWNLOAD', 'EDIT', 'SHARE', 'COMMENT', 'PRINT', 'PREVIEW'];

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'VIEW': return <Eye className="h-4 w-4 text-dbi-cyan" />;
      case 'DOWNLOAD': return <Download className="h-4 w-4 text-dbi-success" />;
      case 'EDIT': return <FileText className="h-4 w-4 text-dbi-warning" />;
      case 'SHARE': return <Users className="h-4 w-4 text-dbi-purple" />;
      case 'PRINT': return <MousePointer className="h-4 w-4 text-dbi-indigo" />;
      default: return <FileText className="h-4 w-4 text-dbi-textSecondary" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'VIEW': return 'bg-dbi-cyan/20 text-dbi-cyan';
      case 'DOWNLOAD': return 'bg-dbi-success/20 text-dbi-success';
      case 'EDIT': return 'bg-dbi-warning/20 text-dbi-warning';
      case 'SHARE': return 'bg-dbi-purple/20 text-dbi-purple';
      case 'PRINT': return 'bg-dbi-indigo/20 text-dbi-indigo';
      case 'COMMENT': return 'bg-dbi-pink/20 text-dbi-pink';
      case 'PREVIEW': return 'bg-dbi-blue/20 text-dbi-blue';
      default: return 'bg-dbi-textSecondary/20 text-dbi-textSecondary';
    }
  };

  const exportData = async () => {
    try {
      const response = await documentsApi.exportAccessLog({
        documentId,
        projectId,
        timeRange,
        format: 'csv'
      });
      const blob = response instanceof Blob ? response : response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `access-analytics-${documentId || projectId || 'all'}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: 'Success', description: 'Analytics exported successfully' });
    } catch {
      toast({ title: 'Error', description: 'Failed to export analytics', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-dbi-textPrimary">Document Access Analytics</h2>
          <p className="text-dbi-textSecondary">Monitor document access patterns and detect anomalies</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={v => setTimeRange(v as '24h' | '7d' | '30d' | '90d')}>
            <SelectTrigger className="w-36 bg-dbi-elevated border-dbi-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-36 bg-dbi-elevated border-dbi-border">
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              {actions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportData}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <TrendingUp className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-dbi-cyan/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dbi-textSecondary">Total Views</p>
                <p className="text-3xl font-bold text-dbi-cyan">{summary.totalViews.toLocaleString()}</p>
              </div>
              <Eye className="h-12 w-12 text-dbi-cyan/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-dbi-success/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dbi-textSecondary">Total Downloads</p>
                <p className="text-3xl font-bold text-dbi-success">{summary.totalDownloads.toLocaleString()}</p>
              </div>
              <Download className="h-12 w-12 text-dbi-success/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-dbi-purple/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dbi-textSecondary">Unique Users</p>
                <p className="text-3xl font-bold text-dbi-purple">{summary.uniqueUsers.toLocaleString()}</p>
              </div>
              <Users className="h-12 w-12 text-dbi-purple/30" />
            </div>
          </CardContent>
        </Card>
        <Card className={summary.anomalyCount > 0 ? 'border-dbi-critical/30' : 'border-dbi-success/30'}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dbi-textSecondary">Anomalies Detected</p>
                <p className={`text-3xl font-bold ${summary.anomalyCount > 0 ? 'text-dbi-critical' : 'text-dbi-success'}`}>
                  {summary.anomalyCount}
                </p>
              </div>
              <AlertTriangle className={`h-12 w-12 ${summary.anomalyCount > 0 ? 'text-dbi-critical/30' : 'text-dbi-success/30'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Anomaly Alert Banner */}
      {summary.anomalyCount > 0 && (
        <Card className="border-dbi-critical/50 bg-dbi-critical/5 animate-pulse">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-dbi-critical" />
              <div className="flex-1">
                <p className="font-medium text-dbi-critical">Security Alert: {summary.anomalyCount} anomalous access pattern(s) detected</p>
                <p className="text-sm text-dbi-textSecondary">Review the access log below for flagged entries. Consider revoking access or investigating further.</p>
              </div>
              <Button variant="outline" className="border-dbi-critical text-dbi-critical hover:bg-dbi-critical/10" size="sm">
                View Anomalies
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Access Log Table */}
      <Card>
        <CardHeader>
          <CardTitle>Access Log ({filteredEvents.length} events)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse bg-dbi-elevated rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-dbi-critical">Failed to load access analytics</div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-16 w-16 text-dbi-textSecondary" />
              <p className="mt-4 text-dbi-textSecondary">No access events found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Location/IP</TableHead>
                    <TableHead>Watermark</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.map((event: AccessEvent) => (
                    <TableRow
                      key={event.id}
                      className={event.action === 'DOWNLOAD' ? 'bg-dbi-success/5' : 'hover:bg-dbi-elevated/50'}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className={getActionColor(event.action)}>
                            {getActionIcon(event.action)}
                            <span className="ml-1">{event.action}</span>
                          </Badge>
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
                        <div>{formatRelativeTime(event.timestamp)}</div>
                        <div className="text-xs">{formatDate(event.timestamp)}</div>
                      </TableCell>
                      <TableCell className="text-sm text-dbi-textSecondary">
                        {event.duration ? `${Math.round(event.duration / 60)}m ${event.duration % 60}s` : 'N/A'}
                      </TableCell>
                      <TableCell className="text-sm text-dbi-textSecondary">
                        {event.location || event.ipAddress || 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={event.watermarkApplied ? 'default' : 'secondary'}
                          className={event.watermarkApplied ? 'bg-dbi-success/20 text-dbi-success' : 'bg-dbi-textSecondary/20 text-dbi-textSecondary'}>
                          {event.watermarkApplied ? 'Applied' : 'None'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {event.action === 'DOWNLOAD' && (
                          <Badge variant="default" className="bg-dbi-warning/20 text-dbi-warning">
                            <TrendingDown className="mr-1 h-3 w-3" />
                            Sensitive
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Heatmap/Charts Placeholder */}
      <Tabs defaultValue="heatmap" className="space-y-4">
        <TabsList>
          <TabsTrigger value="heatmap">Access Heatmap</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="users">Top Users</TabsTrigger>
          <TabsTrigger value="geography">Geography</TabsTrigger>
        </TabsList>

        <TabsContent value="heatmap">
          <Card>
            <CardHeader>
              <CardTitle>Access Time Heatmap</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-dbi-elevated rounded-lg flex items-center justify-center">
                <div className="text-center text-dbi-textSecondary">
                  <TrendingUp className="mx-auto h-12 w-12 mb-2 opacity-50" />
                  <p>Heatmap visualization would be rendered here</p>
                  <p className="text-sm">Shows access frequency by hour of day and day of week</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Access Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-dbi-elevated rounded-lg flex items-center justify-center">
                <div className="text-center text-dbi-textSecondary">
                  <Clock className="mx-auto h-12 w-12 mb-2 opacity-50" />
                  <p>Timeline chart would be rendered here</p>
                  <p className="text-sm">Shows access volume over time with anomaly markers</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Top Users by Access</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Views</TableHead>
                      <TableHead>Downloads</TableHead>
                      <TableHead>Avg Duration</TableHead>
                      <TableHead>Last Access</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* User aggregation would be computed from events */}
                    <TableRow>
                      <TableCell className="text-center text-dbi-textSecondary" colSpan={6}>
                        User aggregation data would be displayed here
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="geography">
          <Card>
            <CardHeader>
              <CardTitle>Geographic Access Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-dbi-elevated rounded-lg flex items-center justify-center">
                <div className="text-center text-dbi-textSecondary">
                  <Users className="mx-auto h-12 w-12 mb-2 opacity-50" />
                  <p>World map visualization would be rendered here</p>
                  <p className="text-sm">Shows access locations with intensity indicators</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}