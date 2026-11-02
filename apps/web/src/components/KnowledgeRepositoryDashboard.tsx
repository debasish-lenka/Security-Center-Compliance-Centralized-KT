import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { knowledgeBooksApi, projectsApi } from '@/lib/api';
import { Search, BookOpen, FileText, TrendingUp, Users, Award, Download, Clock, PieChart } from 'lucide-react';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface KnowledgeBook {
  id: string;
  name: string;
  description?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  tags?: string[];
  createdAt: string;
  updatedAt?: string;
  projectId?: string;
  projectName?: string;
  documentCount?: number;
  downloadCount?: number;
  lastAccessed?: string;
}

export function KnowledgeRepositoryDashboard() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'alphabetical'>('recent');

  const { data: booksData } = useQuery({
    queryKey: ['knowledge-books', search, statusFilter, projectFilter, sortBy],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (projectFilter !== 'ALL') params.projectId = projectFilter;
      params.sortBy = sortBy;
      return knowledgeBooksApi.list(params);
    },
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects-for-kb-filter'],
    queryFn: () => projectsApi.list({ limit: '100' }),
  });

  const { data: statsData } = useQuery({
    queryKey: ['knowledge-repo-stats'],
    queryFn: () => knowledgeBooksApi.getStats(),
  });

  const books = booksData?.data?.items || [];
  const totalItems = booksData?.data?.total || books.length;
  const projects = projectsData?.data?.items || [];
  const stats = statsData?.data || {
    totalBooks: 0,
    publishedBooks: 0,
    totalDocuments: 0,
    totalDownloads: 0,
    activeProjects: 0,
    topContributors: [],
    recentActivity: [],
  };

  const statusOptions = ['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED'];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PUBLISHED': return <Badge className="bg-dbi-success/20 text-dbi-success">Published</Badge>;
      case 'DRAFT': return <Badge className="bg-dbi-textSecondary/20 text-dbi-textSecondary">Draft</Badge>;
      case 'ARCHIVED': return <Badge className="bg-dbi-warning/20 text-dbi-warning">Archived</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const exportReport = async () => {
    try {
      const response = await knowledgeBooksApi.exportReport({ format: 'pdf' });
      const blob = response instanceof Blob ? response : response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `knowledge-repository-report-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: 'Success', description: 'Report exported successfully' });
    } catch {
      toast({ title: 'Error', description: 'Failed to export report', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-dbi-textPrimary">Knowledge Repository</h2>
          <p className="text-dbi-textSecondary">Centralized knowledge management and document compilation</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={exportReport}>
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="border-dbi-cyan/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dbi-textSecondary">Total Books</p>
                <p className="text-3xl font-bold text-dbi-cyan">{stats.totalBooks}</p>
              </div>
              <BookOpen className="h-12 w-12 text-dbi-cyan/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-dbi-success/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dbi-textSecondary">Published</p>
                <p className="text-3xl font-bold text-dbi-success">{stats.publishedBooks}</p>
              </div>
              <Award className="h-12 w-12 text-dbi-success/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-dbi-purple/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dbi-textSecondary">Documents Compiled</p>
                <p className="text-3xl font-bold text-dbi-purple">{stats.totalDocuments}</p>
              </div>
              <FileText className="h-12 w-12 text-dbi-purple/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-dbi-indigo/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dbi-textSecondary">Total Downloads</p>
                <p className="text-3xl font-bold text-dbi-indigo">{stats.totalDownloads}</p>
              </div>
              <TrendingUp className="h-12 w-12 text-dbi-indigo/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-dbi-pink/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dbi-textSecondary">Active Projects</p>
                <p className="text-3xl font-bold text-dbi-pink">{stats.activeProjects}</p>
              </div>
              <Users className="h-12 w-12 text-dbi-pink/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-dbi-amber/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dbi-textSecondary">Avg Docs/Book</p>
                <p className="text-3xl font-bold text-dbi-amber">
                  {stats.totalBooks > 0 ? Math.round(stats.totalDocuments / stats.totalBooks) : 0}
                </p>
              </div>
              <PieChart className="h-12 w-12 text-dbi-amber/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
              <Input
                placeholder="Search knowledge books..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-10 bg-dbi-elevated border-dbi-border"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 bg-dbi-elevated border-dbi-border">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-48 bg-dbi-elevated border-dbi-border">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Projects</SelectItem>
                {projects.map((p: { id: string; name: string }) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={v => setSortBy(v as 'recent' | 'popular' | 'alphabetical')}>
              <SelectTrigger className="w-40 bg-dbi-elevated border-dbi-border">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recently Updated</SelectItem>
                <SelectItem value="popular">Most Downloaded</SelectItem>
                <SelectItem value="alphabetical">Alphabetical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different views */}
      <Tabs defaultValue="books" className="space-y-4">
        <TabsList>
          <TabsTrigger value="books">Knowledge Books ({totalItems})</TabsTrigger>
          <TabsTrigger value="stats">Repository Stats</TabsTrigger>
          <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          <TabsTrigger value="contributors">Top Contributors</TabsTrigger>
        </TabsList>

        {/* Knowledge Books Tab */}
        <TabsContent value="books">
          <Card>
            <CardContent className="pt-0">
              {books.length === 0 ? (
                <div className="text-center py-12">
                  <BookOpen className="mx-auto h-16 w-16 text-dbi-textSecondary" />
                  <p className="mt-4 text-dbi-textSecondary">No knowledge books found</p>
                  <p className="text-sm text-dbi-textSecondary">Create your first knowledge book to get started</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Knowledge Book</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Documents</TableHead>
                        <TableHead>Downloads</TableHead>
                        <TableHead>Last Access</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {books.map((book: KnowledgeBook) => (
                        <TableRow key={book.id} className="hover:bg-dbi-elevated/50">
                          <TableCell>
                            <div className="h-10 w-10 rounded-lg bg-dbi-purple/20 flex items-center justify-center">
                              <BookOpen className="h-5 w-5 text-dbi-purple" />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-dbi-textPrimary">{book.name}</p>
                              <p className="text-sm text-dbi-textSecondary line-clamp-1">{book.description || 'No description'}</p>
                              {book.tags && book.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {book.tags.slice(0, 3).map(tag => (
                                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                                  ))}
                                  {book.tags.length > 3 && (
                                    <Badge variant="secondary" className="text-xs">+{book.tags.length - 3} more</Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {book.projectName ? (
                              <span className="text-sm text-dbi-cyan">{book.projectName}</span>
                            ) : (
                              <span className="text-sm text-dbi-textSecondary">Global</span>
                            )}
                          </TableCell>
                          <TableCell>{getStatusBadge(book.status)}</TableCell>
                          <TableCell className="text-sm text-dbi-textSecondary">{book.documentCount || 0}</TableCell>
                          <TableCell className="text-sm text-dbi-textSecondary">
                            <TrendingUp className="inline h-3 w-3 mr-1 text-dbi-success" />
                            {book.downloadCount || 0}
                          </TableCell>
                          <TableCell className="text-sm text-dbi-textSecondary">
                            {book.lastAccessed ? formatRelativeTime(book.lastAccessed) : 'Never'}
                          </TableCell>
                          <TableCell className="text-sm text-dbi-textSecondary">{book.createdAt ? formatDate(book.createdAt) : 'N/A'}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="text-dbi-cyan hover:text-dbi-cyan" title="View">
                                <FileText className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-dbi-indigo hover:text-dbi-indigo" title="Generate PDF">
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-dbi-purple hover:text-dbi-purple" title="Duplicate">
                                <PieChart className="h-4 w-4" />
                              </Button>
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
        </TabsContent>

        {/* Repository Stats Tab */}
        <TabsContent value="stats">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Status Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 bg-dbi-elevated rounded-lg flex items-center justify-center">
                  <div className="text-center text-dbi-textSecondary">
                    <PieChart className="mx-auto h-12 w-12 mb-2 opacity-50" />
                    <p>Status distribution chart would be rendered here</p>
                    <p className="text-sm">Shows breakdown of books by status (Draft/Published/Archived)</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Downloads Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 bg-dbi-elevated rounded-lg flex items-center justify-center">
                  <div className="text-center text-dbi-textSecondary">
                    <TrendingUp className="mx-auto h-12 w-12 mb-2 opacity-50" />
                    <p>Downloads timeline chart would be rendered here</p>
                    <p className="text-sm">Shows download trends over the selected time period</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Documents per Book
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 bg-dbi-elevated rounded-lg flex items-center justify-center">
                  <div className="text-center text-dbi-textSecondary">
                    <FileText className="mx-auto h-12 w-12 mb-2 opacity-50" />
                    <p>Document count distribution chart would be rendered here</p>
                    <p className="text-sm">Shows how many documents are typically compiled per book</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Project Coverage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 bg-dbi-elevated rounded-lg flex items-center justify-center">
                  <div className="text-center text-dbi-textSecondary">
                    <Users className="mx-auto h-12 w-12 mb-2 opacity-50" />
                    <p>Project coverage chart would be rendered here</p>
                    <p className="text-sm">Shows which projects have knowledge books and their completeness</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Recent Activity Tab */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.recentActivity.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="mx-auto h-16 w-16 text-dbi-textSecondary" />
                  <p className="mt-4 text-dbi-textSecondary">No recent activity</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {stats.recentActivity.map((activity: { action: string; book: string; user: string; time: string }, index: number) => (
                    <div key={index} className="flex items-center gap-4 p-3 bg-dbi-elevated/50 rounded-lg">
                      <div className="h-8 w-8 rounded-full bg-dbi-cyan/20 flex items-center justify-center flex-shrink-0">
                        <Clock className="h-4 w-4 text-dbi-cyan" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-dbi-textPrimary">{activity.action}</p>
                        <p className="text-xs text-dbi-textSecondary">"{activity.book}" by {activity.user}</p>
                      </div>
                      <span className="text-xs text-dbi-textSecondary">{activity.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Contributors Tab */}
        <TabsContent value="contributors">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Top Contributors
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.topContributors.length === 0 ? (
                <div className="text-center py-12">
                  <Award className="mx-auto h-16 w-16 text-dbi-textSecondary" />
                  <p className="mt-4 text-dbi-textSecondary">No contributor data available</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Rank</TableHead>
                        <TableHead>Contributor</TableHead>
                        <TableHead>Books Created</TableHead>
                        <TableHead>Total Downloads</TableHead>
                        <TableHead>Avg Rating</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.topContributors.map((contributor: { name: string; count: number }, index: number) => (
                        <TableRow key={index} className="hover:bg-dbi-elevated/50">
                          <TableCell className="font-bold text-dbi-cyan">#{index + 1}</TableCell>
                          <TableCell className="font-medium text-dbi-textPrimary">{contributor.name}</TableCell>
                          <TableCell className="text-sm text-dbi-textSecondary">{contributor.count}</TableCell>
                          <TableCell className="text-sm text-dbi-textSecondary">—</TableCell>
                          <TableCell className="text-sm text-dbi-textSecondary">—</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}