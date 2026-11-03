import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { documentsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, RotateCcw, FileText, User, AlertTriangle } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface VersionHistoryDialogProps {
  documentId: string;
  documentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DocumentVersion {
  id: string;
  version: number;
  size: number;
  createdAt: string;
  uploader: {
    fullName: string;
  };
  storageKey: string;
}

export function VersionHistoryDialog({ documentId, documentName, open, onOpenChange }: VersionHistoryDialogProps) {
  const [selectedVersion] = useState<DocumentVersion | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const { data } = useQuery({
    queryKey: ['document-versions', documentId],
    queryFn: () => documentsApi.getVersions(documentId),
    enabled: open && !!documentId,
  });

  const versions = data?.data?.items || [];

  const { user } = useAuth();
  const handleRollback = async (version: DocumentVersion) => {
    // an admin may change any document but must say why; the super admins are told
    let reason: string | undefined;
    if (user?.role === 'ADMIN') {
      reason = (window.prompt('Reason for this change (required, at least 5 characters):') ?? '').trim();
      if (reason.length < 5) return;
    }
    if (!confirm(`Are you sure you want to rollback to version ${version.version}? This will create a new version with the content from version ${version.version}.`)) {
      return;
    }

    try {
      await documentsApi.rollback(documentId, version.version, reason);
      onOpenChange(false);
      // The parent component will refetch
      window.dispatchEvent(new CustomEvent('document-updated'));
    } catch (error) {
      console.error('Rollback failed:', error);
      alert('Failed to rollback. Please try again.');
    }
  };

  const getVersionStatus = (_version: DocumentVersion, index: number) => {
    if (index === 0) return 'current';
    return 'historical';
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Version History: {documentName}</DialogTitle>
          <DialogDescription>
            View and manage document versions. Current version: v{versions[0]?.version || 1}
          </DialogDescription>
        </DialogHeader>

        {showDiff && selectedVersion && (
          <VersionDiffViewer
            documentId={documentId}
            version={selectedVersion}
            onClose={() => setShowDiff(false)}
            onRollback={handleRollback}
          />
        )}

        {!showDiff && (
          <>
            <div className="space-y-4">
              {/* Version List */}
              <Card>
                <CardHeader>
                  <CardTitle>Version History ({versions.length} versions)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Version</TableHead>
                          <TableHead className="w-32">Size</TableHead>
                          <TableHead className="w-40">Date</TableHead>
                          <TableHead>Uploaded By</TableHead>
                          <TableHead className="w-32">Status</TableHead>
                          <TableHead className="w-48">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {versions.map((version: DocumentVersion, index: number) => (
                          <TableRow key={version.id} className={index === 0 ? 'bg-dbi-cyan/10' : 'hover:bg-dbi-elevated/50'}>
                            <TableCell className="font-mono font-medium">
                              v{version.version} {index === 0 && <Badge variant="default" className="ml-1">Current</Badge>}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{formatSize(version.size)}</TableCell>
                            <TableCell className="text-sm">{formatDate(version.createdAt)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <User className="h-3.5 w-3.5 text-dbi-textSecondary" />
                                <span className="text-sm">{version.uploader?.fullName || 'Unknown'}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getVersionStatus(version, index) === 'current' ? 'default' : 'secondary'}>
                                {getVersionStatus(version, index) === 'current' ? 'Current' : 'Historical'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                {index !== 0 && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRollback(version)}
                                    title={`Rollback to v${version.version}`}
                                    className="text-dbi-warning hover:text-dbi-warning"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>

                  {versions.length === 0 && (
                    <div className="text-center py-8 text-dbi-textSecondary">
                      <FileText className="mx-auto h-12 w-12 mb-2 opacity-50" />
                      <p>No version history available</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Retention Policy Info */}
              <Card className="border-dbi-cyan/30 bg-dbi-cyan/5">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-dbi-cyan mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-medium text-dbi-cyan">Retention Policy</h4>
                      <p className="text-sm text-dbi-textSecondary mt-1">
                        Document versions are retained indefinitely by default.
                        Administrators can configure retention policies in the Admin Control Center.
                        Versions can be manually deleted by document owners or project leads.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VersionDiffViewer({
  documentId,
  version,
  onClose,
  onRollback
}: {
  documentId: string;
  version: DocumentVersion;
  onClose: () => void;
  onRollback: (version: DocumentVersion) => void;
}) {
  const [diffView, setDiffView] = useState<'unified' | 'split'>('unified');
  const [diffData, setDiffData] = useState<{ oldContent: string; newContent: string; changes: any[] } | null>(null);

  interface DiffData {
    oldContent: string;
    newContent: string;
    changes: Array<{ added: boolean; removed: boolean; value: string }>;
  }

  interface ApiResponse<T> {
    data: T;
    status: number;
    statusText: string;
    headers: any;
    config: any;
  }

  const { data, isLoading, isError } = useQuery<ApiResponse<DiffData>>({
    queryKey: ['document-diff', documentId, version.version],
    queryFn: async () => {
      const response = await documentsApi.getDiff(documentId, version.version);
      return response as ApiResponse<DiffData>;
    },
    enabled: !!documentId && !!version.version,
    staleTime: 0,
    gcTime: 0,
  });

  // Update diffData when query result changes
  if (data?.data) {
    setDiffData(data.data);
  }

  if (isLoading) {
    return (
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Loading Diff...</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dbi-cyan" />
        </div>
      </DialogContent>
    );
  }

  if (isError) {
    return (
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Error Loading Diff</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center h-64 text-dbi-critical">
          Failed to load diff data
        </div>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-w-4xl max-h-[85vh]">
      <DialogHeader>
        <div className="flex items-center justify-between">
          <div>
            <DialogTitle>Version Diff: v{version.version}</DialogTitle>
            <DialogDescription>Comparing with current version</DialogDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
      </DialogHeader>

      <div className="space-y-4">
        {/* Diff Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Tabs value={diffView} onValueChange={(value) => setDiffView(value as 'unified' | 'split')}>
              <TabsList>
                <TabsTrigger value="unified">Unified</TabsTrigger>
                <TabsTrigger value="split">Split</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onRollback(version)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Rollback to This Version
          </Button>
        </div>

        {/* Diff Content */}
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-300px)] min-h-[400px]">
              <pre className="p-4 font-mono text-sm overflow-x-auto whitespace-pre-wrap">
                {diffData ? (
                  <>
                    <span className="text-dbi-critical">- Removed in v{version.version}</span>
                    {'\n'}
                    <span className="text-dbi-success">+ Added in current version</span>
                    {'\n\n'}
                    {diffData.changes.map((change: any, i: number) => (
                      <span key={i} className={change.added ? 'text-dbi-success' : change.removed ? 'text-dbi-critical' : 'text-dbi-textSecondary'}>
                        {change.value}
                      </span>
                    ))}
                  </>
                ) : (
                  <span className="text-dbi-textSecondary">Diff data not available for binary files. Content preview unavailable.</span>
                )}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to History
        </Button>
        <Button onClick={() => onRollback(version)}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Rollback to v{version.version}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}