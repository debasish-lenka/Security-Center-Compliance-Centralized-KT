import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { knowledgeBooksApi, documentsApi, projectsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Search, Plus, Download, Edit, Trash2, FileText, Loader2, BookOpen, ArrowDownUp, Shield, ExternalLink } from 'lucide-react';
import { formatDateTimeIST } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { generateKnowledgeBookPdf, createKnowledgeBookFromProject, KnowledgeBookConfig } from '@/lib/pdfGenerator';

const statusOptions = ['ALL', 'GENERATING', 'COMPLETED', 'FAILED', 'ARCHIVED'];

interface Project {
  id: string;
  name: string;
  description?: string;
}

interface Document {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  type: string;
  size: number;
  createdAt: string;
  uploadedBy: { fullName: string };
  description: string;
  url: string;
  tags?: string[];
}

export function KnowledgeBooks() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [selectedBook, setSelectedBook] = useState<any>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [formData, setFormData] = useState({ projectId: '', name: '', description: '', tags: [] as string[], status: 'COMPLETED' });

  // Project-scoped generation state
  const [isGenerateFromProjectOpen, setIsGenerateFromProjectOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [generateConfig, setGenerateConfig] = useState<Partial<KnowledgeBookConfig>>({
    includeWatermark: true,
    watermarkText: 'CONFIDENTIAL',
    includeToc: true,
    includePageNumbers: true,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['knowledge-books', search, statusFilter, currentPage, pageSize],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      params.page = String(currentPage);
      params.limit = String(pageSize);
      return knowledgeBooksApi.list(params);
    },
  });

  // Fetch projects for project-scoped generation
  const { data: projectsData } = useQuery({
    queryKey: ['projects-for-kb'],
    queryFn: () => projectsApi.list({ limit: '100' }),
  });

  // Fetch documents for selected project
  const { data: projectDocsData, refetch: refetchProjectDocs } = useQuery({
    queryKey: ['project-documents', selectedProject?.id],
    queryFn: async () => {
      if (!selectedProject?.id) return { data: { items: [] as Document[] } };
      const response = await documentsApi.list({ projectId: selectedProject.id, limit: '100' });
      return response;
    },
    enabled: !!selectedProject?.id,
  });

  const books = data?.data?.items || [];
  const totalItems = data?.data?.total || books.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const projects: Project[] = (projectsData?.data?.items ?? []) as Project[];
  const documents = projectDocsData?.data?.items || [];

  // Create a Map for O(1) project lookup
  // const projectMap = new Map<string, Project>(projects.map(p => [p.id, p]));

  // Helper to find project by id
  const findProjectById = (id: string): Project | undefined => {
    for (const p of projects) {
      if (p.id === id) return p;
    }
    return undefined;
  };

  const sortedBooks = useMemo(() => {
    if (!sortConfig) return books;
    return [...books].sort((a, b) => {
      let aVal = a[sortConfig.key as keyof typeof a];
      let bVal = b[sortConfig.key as keyof typeof b];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [books, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await knowledgeBooksApi.create(formData);
      toast({ title: 'Success', description: 'Knowledge Book created successfully' });
      setIsCreateOpen(false);
      setFormData({ projectId: '', name: '', description: '', tags: [], status: 'COMPLETED' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to create Knowledge Book', variant: 'destructive' });
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBook) return;
    try {
      await knowledgeBooksApi.update(selectedBook.id, formData);
      toast({ title: 'Success', description: 'Knowledge Book updated successfully' });
      setIsEditOpen(false);
      setSelectedBook(null);
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to update Knowledge Book', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Knowledge Book?')) return;
    try {
      await knowledgeBooksApi.delete(id);
      toast({ title: 'Success', description: 'Knowledge Book deleted successfully' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete Knowledge Book', variant: 'destructive' });
    }
  };

  // 'open' shows the PDF in a new tab; only 'download' saves it
  const handleGeneratePdf = async (book: any, mode: 'open' | 'download' = 'open') => {
    setIsGeneratingPdf(true);
    const tab = mode === 'open' ? window.open('', '_blank') : null; // opened inside the click so the browser allows it
    try {
      const response = await knowledgeBooksApi.generatePdf(book.id);
      const raw = response instanceof Blob ? response : response.data;
      const blob = new Blob([raw], { type: 'application/pdf' }); // so the browser shows it instead of saving it
      const url = window.URL.createObjectURL(blob);
      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${book.name.replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => window.URL.revokeObjectURL(url), 10_000);
        toast({ title: 'Success', description: 'PDF downloaded' });
      } else if (tab) {
        tab.location.href = url;
        setTimeout(() => window.URL.revokeObjectURL(url), 5 * 60_000);
      } else {
        window.open(url, '_blank');
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate PDF', variant: 'destructive' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleGenerateFromProject = async () => {
    if (!selectedProject || selectedDocIds.length === 0) {
      toast({ title: 'Error', description: 'Please select a project and at least one document', variant: 'destructive' });
      return;
    }

    setIsGeneratingPdf(true);
    try {
      // Convert selected documents to DocumentContent format
      const selectedDocs = documents
        .filter((d: Document) => selectedDocIds.includes(d.id))
        .map((doc: Document, index: number) => ({
          id: doc.id,
          title: doc.name,
          content: doc.description || `${doc.name} - ${doc.tags?.join(', ') || 'No description'}`,
          type: doc.type,
          author: doc.uploadedBy?.fullName,
          createdAt: doc.createdAt,
          updatedAt: doc.createdAt,
          tags: doc.tags,
          order: index,
        }));

      // Create knowledge book from project
      const bookData = createKnowledgeBookFromProject(
        selectedProject.name,
        selectedProject.id,
        selectedDocs,
        {
          ...generateConfig,
          title: generateConfig.title || `${selectedProject.name} Knowledge Book`,
          author: generateConfig.author,
          contributors: generateConfig.contributors,
        }
      );

      // Generate PDF
      const blob = await generateKnowledgeBookPdf(bookData);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bookData.config.title.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: 'Success', description: 'Project Knowledge Book PDF generated and downloaded' });
      setIsGenerateFromProjectOpen(false);
      setSelectedProject(null);
      setSelectedDocIds([]);
    } catch (err) {
      console.error('PDF generation error:', err);
      toast({ title: 'Error', description: 'Failed to generate PDF', variant: 'destructive' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleProjectSelect = (project: Project) => {
    setSelectedProject(project);
    setSelectedDocIds([]);
    refetchProjectDocs();
  };

  const toggleDocSelect = (id: string) => {
    setSelectedDocIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedDocIds.length === documents.length) {
      setSelectedDocIds([]);
    } else {
      setSelectedDocIds(documents.map((d: Document) => d.id));
    }
  };

  const openEditDialog = (book: any) => {
    setSelectedBook(book);
    setFormData({
      projectId: book.projectId || '',
      name: book.name,
      description: book.description || '',
      tags: book.tags || [],
      status: book.status
    });
    setIsEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">Knowledge Books</h1>
          <p className="text-dbi-textSecondary">Create and manage compiled knowledge books with PDF export</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => { setSelectedProject(null); setSelectedDocIds([]); setIsGenerateFromProjectOpen(true); }}>
            <BookOpen className="mr-2 h-4 w-4" />
            Generate from Project
          </Button>
          <Button onClick={() => { setFormData({ projectId: '', name: '', description: '', tags: [], status: 'COMPLETED' }); setIsCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Create Knowledge Book
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>All Knowledge Books ({totalItems})</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
                <Input
                  placeholder="Search knowledge books..."
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
            <div className="text-center py-8 text-dbi-critical">Failed to load knowledge books</div>
          ) : books.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto h-16 w-16 text-dbi-textSecondary">
                <FileText className="h-16 w-16" />
              </div>
              <p className="mt-4 text-dbi-textSecondary">No knowledge books found</p>
              <div className="mt-4 flex gap-3 justify-center">
                <Button onClick={() => { setFormData({ projectId: '', name: '', description: '', tags: [], status: 'COMPLETED' }); setIsCreateOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Knowledge Book
                </Button>
                <Button variant="outline" onClick={() => { setSelectedProject(null); setSelectedDocIds([]); setIsGenerateFromProjectOpen(true); }}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Generate from Project
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        { key: 'name', label: 'Knowledge Book' },
                        { key: 'status', label: 'Status' },
                        { key: 'tags', label: 'Tags' },
                        { key: 'createdAt', label: 'Created' },
                        { key: 'updatedAt', label: 'Updated' },
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
                    {sortedBooks.map((book: any) => (
                      <TableRow key={book.id} className="hover:bg-dbi-elevated/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-dbi-purple/20 flex items-center justify-center flex-shrink-0">
                              <FileText className="h-5 w-5 text-dbi-purple" />
                            </div>
                            <div>
                              <p className="font-medium text-dbi-textPrimary">{book.name}</p>
                              <p className="text-sm text-dbi-textSecondary line-clamp-1">{book.description}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            book.status === 'PUBLISHED' ? 'bg-dbi-success/20 text-dbi-success' :
                            book.status === 'DRAFT' ? 'bg-dbi-textSecondary/20 text-dbi-textSecondary' :
                            'bg-dbi-warning/20 text-dbi-warning'
                          }>
                            {book.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {book.tags?.map((tag: string) => (
                              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">{book.createdAt ? formatDateTimeIST(book.createdAt) : 'N/A'}</TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">{book.updatedAt ? formatDateTimeIST(book.updatedAt) : 'N/A'}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleGeneratePdf(book, 'open')} title="Open PDF in a new tab" className="text-dbi-cyan hover:text-dbi-cyan" disabled={isGeneratingPdf}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleGeneratePdf(book, 'download')} title="Download PDF" className="text-dbi-cyan hover:text-dbi-cyan" disabled={isGeneratingPdf}>
                              {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(book)} title="Edit" className="text-dbi-cyan hover:text-dbi-cyan">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(book.id)} className="text-dbi-critical hover:text-dbi-critical" title="Delete">
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
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} knowledge books
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

      {/* Create Knowledge Book Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Knowledge Book</DialogTitle>
            <DialogDescription>Compiles the project's documents into a PDF knowledge book</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="kb-project" className="text-sm font-medium text-dbi-textSecondary">Project *</label>
              <select
                id="kb-project"
                required
                value={formData.projectId}
                onChange={e => setFormData({ ...formData, projectId: e.target.value })}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">{projects.length ? 'Select a project' : 'No projects available'}</option>
                {projects.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-dbi-textSecondary">Name</label>
              <Input
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Security Policies Handbook"
                required
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-dbi-textSecondary">Description</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what this knowledge book covers..."
                className="mt-1 w-full p-2 bg-dbi-elevated border-dbi-border rounded-lg text-dbi-textPrimary"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Knowledge Book Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { if (!open) { setIsEditOpen(false); setSelectedBook(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Knowledge Book</DialogTitle>
            <DialogDescription>Update knowledge book details</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-dbi-textSecondary">Name</label>
              <Input
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-dbi-textSecondary">Description</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="mt-1 w-full p-2 bg-dbi-elevated border-dbi-border rounded-lg text-dbi-textPrimary"
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-dbi-textSecondary">Status</label>
              <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="w-full bg-dbi-elevated border-dbi-border mt-1">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setIsEditOpen(false); setSelectedBook(null); }}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generate from Project Dialog */}
      <Dialog open={isGenerateFromProjectOpen} onOpenChange={(open) => {
        if (!open) {
          setIsGenerateFromProjectOpen(false);
          setSelectedProject(null);
          setSelectedDocIds([]);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-dbi-purple" />
              Generate Knowledge Book from Project
            </DialogTitle>
            <DialogDescription>Select a project and documents to compile into a knowledge book with cover page, table of contents, and unified page numbering</DialogDescription>
          </DialogHeader>

          {!selectedProject ? (
            // Project Selection Step
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium text-dbi-textSecondary">Select Project</label>
                <Select value={''} onValueChange={(v: string) => {
                  const project = findProjectById(v);
                  if (project) handleProjectSelect(project);
                }}>
                  <SelectTrigger className="w-full bg-dbi-elevated border-dbi-border mt-1">
                    <SelectValue placeholder="Choose a project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects as Project[]).map((p: Project) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-dbi-textSecondary">Choose a project to load its documents for inclusion in the knowledge book.</p>
            </div>
          ) : (
            // Document Selection & Configuration Step
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              {/* Project Info */}
              <div className="p-3 bg-dbi-purple/10 border border-dbi-purple/20 rounded-lg">
                <p className="font-medium text-dbi-purple">{selectedProject.name}</p>
                <p className="text-sm text-dbi-textSecondary">{documents.length} documents available</p>
              </div>

              {/* Document Selection */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-dbi-textSecondary">Select Documents ({selectedDocIds.length}/{documents.length})</label>
                  <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
                    {selectedDocIds.length === documents.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-2 border border-dbi-border rounded-lg p-3">
                  {documents.length === 0 ? (
                    <p className="text-center text-dbi-textSecondary py-8">No documents found in this project</p>
                  ) : (
                    documents.map((doc: Document) => (
                      <label key={doc.id} className="flex items-center gap-3 p-2 hover:bg-dbi-elevated/50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedDocIds.includes(doc.id)}
                          onChange={() => toggleDocSelect(doc.id)}
                          className="h-4 w-4 rounded border-dbi-border text-dbi-cyan focus:ring-dbi-cyan"
                        />
                        <div className="h-8 w-8 rounded bg-dbi-cyan/20 flex items-center justify-center flex-shrink-0">
                          <FileText className="h-4 w-4 text-dbi-cyan" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-dbi-textPrimary truncate">{doc.name}</p>
                          <p className="text-xs text-dbi-textSecondary">{doc.type.toUpperCase()} • {formatDateTimeIST(doc.createdAt)}</p>
                        </div>
                        <Badge variant="secondary" className="text-xs">{doc.projectName}</Badge>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Generation Configuration */}
              <div className="border-t pt-4">
                <h4 className="font-medium text-dbi-textPrimary mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  PDF Generation Options
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-dbi-textSecondary">Knowledge Book Title</label>
                    <Input
                      value={generateConfig.title || ''}
                      onChange={e => setGenerateConfig({ ...generateConfig, title: e.target.value })}
                      placeholder={`${selectedProject.name} Knowledge Book`}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-dbi-textSecondary">Author</label>
                    <Input
                      value={generateConfig.author || ''}
                      onChange={e => setGenerateConfig({ ...generateConfig, author: e.target.value })}
                      placeholder="Author name"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-dbi-textSecondary">Contributors (comma separated)</label>
                    <Input
                      value={generateConfig.contributors?.join(', ') || ''}
                      onChange={e => setGenerateConfig({ ...generateConfig, contributors: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                      placeholder="Contributor names"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-dbi-textSecondary">Watermark Text</label>
                    <Input
                      value={generateConfig.watermarkText || 'CONFIDENTIAL'}
                      onChange={e => setGenerateConfig({ ...generateConfig, watermarkText: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={generateConfig.includeWatermark ?? true}
                      onChange={e => setGenerateConfig({ ...generateConfig, includeWatermark: e.target.checked })}
                      className="h-4 w-4 rounded border-dbi-border text-dbi-cyan focus:ring-dbi-cyan"
                    />
                    <span className="text-sm text-dbi-textSecondary">Include Watermark</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={generateConfig.includeToc ?? true}
                      onChange={e => setGenerateConfig({ ...generateConfig, includeToc: e.target.checked })}
                      className="h-4 w-4 rounded border-dbi-border text-dbi-cyan focus:ring-dbi-cyan"
                    />
                    <span className="text-sm text-dbi-textSecondary">Include Table of Contents</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={generateConfig.includePageNumbers ?? true}
                      onChange={e => setGenerateConfig({ ...generateConfig, includePageNumbers: e.target.checked })}
                      className="h-4 w-4 rounded border-dbi-border text-dbi-cyan focus:ring-dbi-cyan"
                    />
                    <span className="text-sm text-dbi-textSecondary">Include Page Numbers</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      className="h-4 w-4 rounded border-dbi-border text-dbi-cyan focus:ring-dbi-cyan"
                    />
                    <span className="text-sm text-dbi-textSecondary">Cover Page (Always Included)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {!selectedProject ? (
              <>
                <Button variant="outline" onClick={() => setIsGenerateFromProjectOpen(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => { setSelectedProject(null); setSelectedDocIds([]); }}>
                  <ArrowDownUp className="mr-2 h-4 w-4" />
                  Change Project
                </Button>
                <Button onClick={handleGenerateFromProject} disabled={isGeneratingPdf || selectedDocIds.length === 0}>
                  {isGeneratingPdf ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Generate & Download PDF
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}