import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ktReportsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Plus, Search, Edit, Trash2, Eye, FileText } from 'lucide-react';
import { getStatusColor, formatDateTimeIST } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

const statusOptions = ['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];

export function KTReports() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, _setPageSize] = useState(10);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['kt-reports', search, statusFilter, currentPage, pageSize],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      return ktReportsApi.list(params);
    },
  });

  const reports = data?.data?.items || [];
  const totalItems = data?.data?.total || reports.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  const sortedReports = useMemo(() => {
    if (!sortConfig) return reports;
    return [...reports].sort((a, b) => {
      let aVal = a[sortConfig.key as keyof typeof a];
      let bVal = b[sortConfig.key as keyof typeof b];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [reports, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this KT report?')) return;
    try {
      await ktReportsApi.delete(id);
      toast({ title: 'Report deleted', description: 'The KT report has been deleted successfully' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete report', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">KT Reports</h1>
          <p className="text-dbi-textSecondary">Knowledge Transfer & Security Documentation</p>
        </div>
        <Button onClick={() => navigate('/kt-reports/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New Report
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>All Reports ({totalItems})</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
                <Input
                  placeholder="Search reports..."
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
            <div className="text-center py-8 text-dbi-critical">Failed to load reports</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto h-16 w-16 text-dbi-textSecondary">
                <FileText className="h-16 w-16" />
              </div>
              <p className="mt-4 text-dbi-textSecondary">No KT reports found</p>
              <Button onClick={() => navigate('/kt-reports/new')} className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Create First Report
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        { key: 'title', label: 'Title' },
                        { key: 'project', label: 'Project' },
                        { key: 'author', label: 'Author' },
                        { key: 'status', label: 'Status' },
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
                    {sortedReports.map((report: any) => (
                      <TableRow key={report.id} className="hover:bg-dbi-elevated/50">
                        <TableCell>
                          <Link to={`/kt-reports/${report.id}`} className="font-medium text-dbi-textPrimary hover:text-dbi-cyan">
                            {report.title}
                          </Link>
                          <p className="text-sm text-dbi-textSecondary line-clamp-1 mt-1">{(report.workCompleted || report.detailedWork || '').substring(0, 100)}</p>
                        </TableCell>
                        <TableCell>
                          {report.project ? (
                            <Link to={`/projects/${report.project.id}`} className="text-sm text-dbi-cyan hover:underline">
                              {report.project.name}
                            </Link>
                          ) : (
                            <span className="text-sm text-dbi-textSecondary">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">{report.author?.fullName}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(report.status)}>
                            {report.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">{formatDateTimeIST(report.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" asChild>
                              <Link to={`/kt-reports/${report.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="icon" asChild>
                              <Link to={`/kt-reports/${report.id}/edit`}>
                                <Edit className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(report.id)} className="text-dbi-critical hover:text-dbi-critical">
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
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} reports
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