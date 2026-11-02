import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { complianceApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Plus, Search, Edit, Trash2, Eye, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { formatDate, getStatusColor } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

const statusOptions = ['ALL', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'AT_RISK'];
const frameworkOptions = ['ALL', 'NIST_CSF', 'ISO_27001', 'SOC2', 'PCI_DSS', 'GDPR', 'HIPAA', 'FEDRAMP', 'CIS_CONTROLS', 'MITRE_ATTACK', 'CUSTOM'];

export function Compliance() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [frameworkFilter, setFrameworkFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, _setPageSize] = useState(10);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['compliance', search, statusFilter, frameworkFilter, currentPage, pageSize],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (frameworkFilter !== 'ALL') params.framework = frameworkFilter;
      return complianceApi.list(params);
    },
  });

  const controls = data?.data?.items || [];
  const totalItems = data?.data?.total || controls.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  const sortedControls = useMemo(() => {
    if (!sortConfig) return controls;
    return [...controls].sort((a, b) => {
      let aVal = a[sortConfig.key as keyof typeof a];
      let bVal = b[sortConfig.key as keyof typeof b];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [controls, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this compliance control?')) return;
    try {
      await complianceApi.delete(id);
      toast({ title: 'Control deleted', description: 'The compliance control has been deleted successfully' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete control', variant: 'destructive' });
    }
  };

  const getFrameworkIcon = (framework: string) => {
    const icons: Record<string, React.ReactNode> = {
      NIST_CSF: <Shield className="h-4 w-4 text-blue-400" />,
      ISO_27001: <Shield className="h-4 w-4 text-green-400" />,
      SOC2: <Shield className="h-4 w-4 text-purple-400" />,
      PCI_DSS: <Shield className="h-4 w-4 text-orange-400" />,
      GDPR: <Shield className="h-4 w-4 text-red-400" />,
      HIPAA: <Shield className="h-4 w-4 text-teal-400" />,
      FEDRAMP: <Shield className="h-4 w-4 text-indigo-400" />,
      CIS_CONTROLS: <Shield className="h-4 w-4 text-cyan-400" />,
      MITRE_ATTACK: <Shield className="h-4 w-4 text-rose-400" />,
    };
    return icons[framework] || <Shield className="h-4 w-4 text-dbi-textSecondary" />;
  };

  const getStatusIcon = (status: string) => {
    if (status === 'COMPLETED') return <CheckCircle className="h-4 w-4 text-dbi-success" />;
    if (status === 'IN_PROGRESS') return <AlertTriangle className="h-4 w-4 text-dbi-warning" />;
    if (status === 'NOT_STARTED' || status === 'NOT_APPLICABLE') return <Shield className="h-4 w-4 text-dbi-textSecondary" />;
    return <AlertTriangle className="h-4 w-4 text-dbi-critical" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">Compliance Center</h1>
          <p className="text-dbi-textSecondary">Track and manage compliance controls across frameworks</p>
        </div>
        <Button onClick={() => navigate('/compliance/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Add Control
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Compliance Controls ({totalItems})</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
                <Input
                  placeholder="Search controls..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                  className="pl-9 pr-10 w-64 bg-dbi-elevated border-dbi-border"
                />
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-48 bg-dbi-elevated border-dbi-border">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={frameworkFilter} onValueChange={v => { setFrameworkFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-40 bg-dbi-elevated border-dbi-border">
                  <SelectValue placeholder="Framework" />
                </SelectTrigger>
                <SelectContent>
                  {frameworkOptions.map(f => <SelectItem key={f} value={f}>{f.replace('_', ' ')}</SelectItem>)}
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
            <div className="text-center py-8 text-dbi-critical">Failed to load compliance controls</div>
          ) : controls.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto h-16 w-16 text-dbi-textSecondary">
                <Shield className="h-16 w-16" />
              </div>
              <p className="mt-4 text-dbi-textSecondary">No compliance controls found</p>
              <Button onClick={() => navigate('/compliance/new')} className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Add First Control
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        { key: 'controlId', label: 'Control ID' },
                        { key: 'title', label: 'Title' },
                        { key: 'framework', label: 'Framework' },
                        { key: 'status', label: 'Status' },
                        { key: 'owner', label: 'Owner' },
                        { key: 'lastAssessed', label: 'Last Assessed' },
                        { key: 'nextReview', label: 'Next Review' },
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
                    {sortedControls.map((control: any) => (
                      <TableRow key={control.id} className="hover:bg-dbi-elevated/50">
                        <TableCell className="font-mono text-sm font-medium text-dbi-cyan">{control.controlId}</TableCell>
                        <TableCell>
                          <Link to={`/compliance/${control.id}`} className="font-medium text-dbi-textPrimary hover:text-dbi-cyan">
                            {control.title}
                          </Link>
                          <p className="text-sm text-dbi-textSecondary line-clamp-1 mt-1">{control.description}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getFrameworkIcon(control.framework)}
                            <span className="text-sm font-medium">{control.framework.replace('_', ' ')}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(control.status)}
                            <Badge className={getStatusColor(control.status)}>
                              {control.status.replace('_', ' ')}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">{control.owner?.fullName}</TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">
                          {control.lastAssessed ? formatDate(control.lastAssessed) : 'Never'}
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">
                          {control.nextReviewDate ? formatDate(control.nextReviewDate) : 'Not scheduled'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" asChild>
                              <Link to={`/compliance/${control.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="icon" asChild>
                              <Link to={`/compliance/${control.id}/edit`}>
                                <Edit className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(control.id)} className="text-dbi-critical hover:text-dbi-critical">
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
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} controls
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