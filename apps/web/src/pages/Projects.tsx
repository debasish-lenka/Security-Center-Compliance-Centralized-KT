import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Plus, Search, Edit, Trash2, Eye } from 'lucide-react';
import { formatDate, getStatusColor, getPriorityColor } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

const statusOptions = ['ALL', 'NOT_STARTED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'OVERDUE', 'AT_RISK'];
const priorityOptions = ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function Projects() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, _setPageSize] = useState(10);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [_isCreating, _setIsCreating] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['projects', search, statusFilter, priorityFilter, currentPage, pageSize],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (priorityFilter !== 'ALL') params.priority = priorityFilter;
      return projectsApi.list(params);
    },
  });

  const projects = data?.data?.items || [];
  const totalItems = data?.data?.total || projects.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  const sortedProjects = useMemo(() => {
    if (!sortConfig) return projects;
    return [...projects].sort((a, b) => {
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
  }, [projects, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      await projectsApi.delete(id);
      toast({ title: 'Project deleted', description: 'The project has been deleted successfully' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete project', variant: 'destructive' });
    }
  };

  const statusBadges: Record<string, string> = {
    NOT_STARTED: 'bg-slate-500/20 text-slate-300',
    ONGOING: 'bg-cyan-500/20 text-cyan-300',
    COMPLETED: 'bg-emerald-500/20 text-emerald-300',
    ON_HOLD: 'bg-amber-500/20 text-amber-300',
    OVERDUE: 'bg-rose-500/20 text-rose-300',
    AT_RISK: 'bg-orange-500/20 text-orange-300',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">All Projects</h1>
          <p className="text-dbi-textSecondary">Manage and monitor all security projects</p>
        </div>
        <Button onClick={() => navigate('/projects/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Projects ({totalItems})</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
                <Input
                  placeholder="Search projects..."
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
              <Select value={priorityFilter} onValueChange={v => { setPriorityFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-36 bg-dbi-elevated border-dbi-border">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
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
            <div className="text-center py-8 text-dbi-critical">Failed to load projects</div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto h-16 w-16 text-dbi-textSecondary">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-16 w-16">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h1.5M18 3v11.25A2.25 2.25 0 0115.75 18.75H15M18 3h.75M18 3h-.75A2.25 2.25 0 0015 5.25v11.25" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h-9M15 3v.75M3 3h18v.75H3V3z" />
                </svg>
              </div>
              <p className="mt-4 text-dbi-textSecondary">No projects found</p>
              <Button onClick={() => navigate('/projects/new')} className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Create First Project
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        { key: 'name', label: 'Project' },
                        { key: 'owner', label: 'Owner' },
                        { key: 'status', label: 'Status' },
                        { key: 'priority', label: 'Priority' },
                        { key: 'progress', label: 'Progress' },
                        { key: 'expectedCompletionDate', label: 'Deadline' },
                        { key: 'budget', label: 'Budget' },
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
                    {sortedProjects.map((project: any) => (
                      <TableRow key={project.id} className="hover:bg-dbi-elevated/50">
                        <TableCell>
                          <Link to={`/projects/${project.id}`} className="font-medium text-dbi-textPrimary hover:text-dbi-cyan">
                            {project.name}
                          </Link>
                          <p className="text-sm text-dbi-textSecondary line-clamp-1 mt-1">{project.description}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {project.tags?.slice(0, 3).map((tag: string) => (
                              <Badge key={tag} variant="secondary" className="text-xs h-4 px-2">{tag}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-dbi-cyan/20 flex items-center justify-center">
                              <span className="text-sm font-medium text-dbi-cyan">
                                {project.owner?.fullName?.charAt(0).toUpperCase() || 'U'}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-dbi-textPrimary">{project.owner?.fullName}</p>
                              <p className="text-xs text-dbi-textSecondary">{project.owner?.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusBadges[project.status] || getStatusColor(project.status)}>
                            {project.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getPriorityColor(project.priority)}>{project.priority}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="w-32">
                            <div className="h-2 bg-dbi-border rounded-full overflow-hidden">
                              <div
                                className="h-full bg-dbi-cyan transition-all"
                                style={{ width: `${project.progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-dbi-textSecondary">{project.progress}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">
                          {project.expectedCompletionDate ? formatDate(project.expectedCompletionDate) : 'Not set'}
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">
                          {project.budget ? `$${project.budget.toLocaleString()}` : 'N/A'}
                          {project.spent !== undefined && project.budget && (
                            <span className="text-dbi-cyan ml-1">({((project.spent / project.budget) * 100).toFixed(0)}%)</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" asChild>
                              <Link to={`/projects/${project.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="icon" asChild>
                              <Link to={`/projects/${project.id}/edit`}>
                                <Edit className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(project.id)} className="text-dbi-critical hover:text-dbi-critical">
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
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} projects
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