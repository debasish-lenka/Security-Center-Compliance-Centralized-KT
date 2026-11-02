import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { documentsApi, projectsApi } from '@/lib/api';
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
import { Search, Trash2, Download, ExternalLink, FileText, Upload, X, Clock, MessageSquare } from 'lucide-react';
import { formatDate, getStatusColor } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { VersionHistoryDialog } from '@/components/VersionHistoryDialog';
import { ReviewDialog } from '@/components/ReviewDialog';
import { WatermarkSettings } from '@/components/WatermarkSettings';

const statusOptions = ['ALL', 'DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED'];
const typeOptions = ['ALL', 'PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'PPT', 'PPTX', 'TXT', 'MD', 'CSV', 'JSON', 'XML', 'ZIP', 'IMAGE', 'VIDEO', 'OTHER'];

export function Documents() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');
  const urlSearch = searchParams.get('search') || '';
  const [search, setSearch] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [projectFilter, setProjectFilter] = useState(projectId || 'ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, _setPageSize] = useState(10);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [versionHistoryDoc, setVersionHistoryDoc] = useState<{ id: string; name: string } | null>(null);
  const [reviewDialogDoc, setReviewDialogDoc] = useState<{ id: string; name: string; projectId: string; reviewStatus: string | null; reviewerId?: string } | null>(null);

  const { data: projectsData } = useQuery({
    queryKey: ['projects-for-filter'],
    queryFn: () => projectsApi.list({ limit: '100' }),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['documents', search, statusFilter, typeFilter, projectFilter, currentPage, pageSize],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (typeFilter !== 'ALL') params.type = typeFilter;
      if (projectFilter !== 'ALL') params.projectId = projectFilter;
      return documentsApi.list(params);
    },
  });

  const documents = data?.data?.items || [];
  const totalItems = data?.data?.total || documents.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const projects = projectsData?.data?.items || [];

  const sortedDocuments = useMemo(() => {
    if (!sortConfig) return documents;
    return [...documents].sort((a, b) => {
      let aVal = a[sortConfig.key as keyof typeof a];
      let bVal = b[sortConfig.key as keyof typeof b];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [documents, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      await documentsApi.delete(id);
      toast({ title: 'Document deleted', description: 'The document has been deleted successfully' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete document', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">Document Vault</h1>
          <p className="text-dbi-textSecondary">Secure document storage and management</p>
        </div>
        <Button onClick={() => setIsUploadOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Upload Document
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>All Documents ({totalItems})</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
                <Input
                  placeholder="Search documents..."
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
              <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-36 bg-dbi-elevated border-dbi-border">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={projectFilter} onValueChange={v => { setProjectFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-48 bg-dbi-elevated border-dbi-border">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Projects</SelectItem>
                  {projects.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
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
            <div className="text-center py-8 text-dbi-critical">Failed to load documents</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto h-16 w-16 text-dbi-textSecondary">
                <FileText className="h-16 w-16" />
              </div>
              <p className="mt-4 text-dbi-textSecondary">No documents found</p>
              <Button onClick={() => setIsUploadOpen(true)} className="mt-4">
                <Upload className="mr-2 h-4 w-4" />
                Upload First Document
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        { key: 'name', label: 'Document' },
                        { key: 'project', label: 'Project' },
                        { key: 'type', label: 'Type' },
                        { key: 'size', label: 'Size' },
                        { key: 'status', label: 'Status' },
                        { key: 'uploadedBy', label: 'Uploaded By' },
                        { key: 'createdAt', label: 'Date' },
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
                    {sortedDocuments.map((doc: any) => (
                      <TableRow key={doc.id} className="hover:bg-dbi-elevated/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-dbi-cyan/20 flex items-center justify-center flex-shrink-0">
                              <FileText className="h-5 w-5 text-dbi-cyan" />
                            </div>
                            <div>
                              <Button
                                variant="ghost"
                                className="font-medium text-dbi-textPrimary hover:text-dbi-cyan p-0 h-auto w-auto justify-start"
                                onClick={() => setSelectedDoc(doc)}
                              >
                                {doc.name}
                              </Button>
                              <p className="text-sm text-dbi-textSecondary line-clamp-1">{doc.description}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {doc.project ? (
                            <Link to={`/projects/${doc.project.id}`} className="text-sm text-dbi-cyan hover:underline">
                              {doc.project.name}
                            </Link>
                          ) : (
                            <span className="text-sm text-dbi-textSecondary">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{(doc.type || 'unknown').toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">
                          {(doc.size ? doc.size / 1024 : 0).toFixed(1)} KB
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(doc.status || 'UNKNOWN')}>
                            {(doc.status || 'UNKNOWN').replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">{doc.uploadedBy?.fullName || 'Unknown'}</TableCell>
                        <TableCell className="text-sm text-dbi-textSecondary">{doc.createdAt ? formatDate(doc.createdAt) : 'N/A'}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {doc.url && (
                              <>
                                <Button variant="ghost" size="icon" asChild>
                                  <a href={doc.url} target="_blank" rel="noopener noreferrer" title="Open">
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </Button>
                                <Button variant="ghost" size="icon" asChild>
                                  <a href={doc.url} download title="Download">
                                    <Download className="h-4 w-4" />
                                  </a>
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => setVersionHistoryDoc({ id: doc.id, name: doc.name })} title="Version History" className="text-dbi-cyan hover:text-dbi-cyan">
                              <Clock className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setReviewDialogDoc({
                                id: doc.id,
                                name: doc.name,
                                projectId: doc.project?.id || '',
                                reviewStatus: doc.reviewStatus || null,
                                reviewerId: doc.reviewerId
                              })}
                              title="Review"
                              className="text-dbi-purple hover:text-dbi-purple"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(doc.id)} className="text-dbi-critical hover:text-dbi-critical" title="Delete">
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
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} documents
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

      {/* Document Detail Dialog */}
      <Dialog open={!!selectedDoc} onOpenChange={(open) => !open && setSelectedDoc(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedDoc?.name}</DialogTitle>
            <DialogDescription>Document details and actions</DialogDescription>
          </DialogHeader>
          {selectedDoc && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-dbi-textSecondary">Type</label>
                  <p className="text-sm text-dbi-textPrimary">{(selectedDoc.type || 'unknown').toUpperCase()}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-dbi-textSecondary">Size</label>
                  <p className="text-sm text-dbi-textPrimary">{(selectedDoc.size ? selectedDoc.size / 1024 : 0).toFixed(1)} KB</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-dbi-textSecondary">Status</label>
                  <p className="text-sm text-dbi-textPrimary">
                    <Badge className={getStatusColor(selectedDoc.status || 'UNKNOWN')}>
                      {(selectedDoc.status || 'UNKNOWN').replace('_', ' ')}
                    </Badge>
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-dbi-textSecondary">Project</label>
                  <p className="text-sm text-dbi-textPrimary">
                    {selectedDoc.project?.name || 'N/A'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-dbi-textSecondary">Uploaded By</label>
                  <p className="text-sm text-dbi-textPrimary">{selectedDoc.uploadedBy?.fullName || 'Unknown'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-dbi-textSecondary">Date</label>
                  <p className="text-sm text-dbi-textPrimary">{selectedDoc.createdAt ? formatDate(selectedDoc.createdAt) : 'N/A'}</p>
                </div>
              </div>
              {selectedDoc.description && (
                <div>
                  <label className="text-xs font-medium text-dbi-textSecondary">Description</label>
                  <p className="text-sm text-dbi-textPrimary mt-1">{selectedDoc.description}</p>
                </div>
              )}
              <WatermarkSettings
                documentId={selectedDoc.id}
                documentName={selectedDoc.name}
                userName={selectedDoc.uploadedBy?.fullName || 'Unknown'}
                userEmail={selectedDoc.uploadedBy?.email || 'unknown@example.com'}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedDoc(null)}>
                  <X className="mr-2 h-4 w-4" />
                  Close
                </Button>
                {selectedDoc.url && (
                  <>
                    <Button variant="ghost" asChild>
                      <a href={selectedDoc.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open
                      </a>
                    </Button>
                    <Button variant="ghost" asChild>
                      <a href={selectedDoc.url} download>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </a>
                    </Button>
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>Select a file to upload to the Document Vault</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const file = formData.get('file') as File;
              if (!file) {
                toast({ title: 'Error', description: 'Please select a file', variant: 'destructive' });
                return;
              }
              setIsUploading(true);
              try {
                await documentsApi.upload({ file, projectId: projectFilter !== 'ALL' ? projectFilter : undefined, name: file.name, description: '', type: file.type || 'OTHER' });
                toast({ title: 'Success', description: 'Document uploaded successfully' });
                setIsUploadOpen(false);
                e.currentTarget.reset();
              } catch {
                toast({ title: 'Error', description: 'Failed to upload document', variant: 'destructive' });
              } finally {
                setIsUploading(false);
              }
            }}
            className="space-y-4"
          >
            <div>
              <label className="text-sm font-medium text-dbi-textSecondary">File</label>
              <input
                type="file"
                name="file"
                required
                className="mt-1 block w-full text-sm text-dbi-textPrimary bg-dbi-elevated border-dbi-border rounded-lg p-2"
                disabled={isUploading}
              />
            </div>
            {projectFilter !== 'ALL' && (
              <input type="hidden" name="projectId" value={projectFilter} />
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)} disabled={isUploading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isUploading}>
                {isUploading ? 'Uploading...' : 'Upload'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <VersionHistoryDialog
        documentId={versionHistoryDoc?.id || ''}
        documentName={versionHistoryDoc?.name || ''}
        open={!!versionHistoryDoc}
        onOpenChange={(open) => {
          if (!open) setVersionHistoryDoc(null);
        }}
      />

      {/* Review Dialog */}
      <ReviewDialog
        documentId={reviewDialogDoc?.id || ''}
        documentName={reviewDialogDoc?.name || ''}
        projectId={reviewDialogDoc?.projectId || ''}
        reviewStatus={reviewDialogDoc?.reviewStatus || null}
        reviewerId={reviewDialogDoc?.reviewerId}
        isReviewer={false} // TODO: Check if current user is the reviewer
        canSubmitForReview={true} // TODO: Check if current user can submit for review
        open={!!reviewDialogDoc}
        onOpenChange={(open) => {
          if (!open) setReviewDialogDoc(null);
        }}
        onReviewComplete={() => refetch()}
      />
    </div>
  );
}