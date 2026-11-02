import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { complianceApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, getStatusColor } from '@/lib/utils';
import { ArrowLeft, Edit, Trash2, Shield, Calendar, User, Clock, AlertTriangle, CheckCircle, FileText, ExternalLink } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const statusBadges: Record<string, string> = {
  NOT_APPLICABLE: 'bg-slate-500/20 text-slate-300',
  NOT_IMPLEMENTED: 'bg-rose-500/20 text-rose-300',
  PARTIALLY_IMPLEMENTED: 'bg-amber-500/20 text-amber-300',
  IMPLEMENTED: 'bg-emerald-500/20 text-emerald-300',
  VERIFIED: 'bg-indigo-500/20 text-indigo-300',
  EXCEPTION_GRANTED: 'bg-violet-500/20 text-violet-300',
};

const frameworkIcons: Record<string, React.ReactNode> = {
  NIST_CSF: <Shield className="h-4 w-4 text-blue-400" />,
  ISO_27001: <Shield className="h-4 w-4 text-green-400" />,
  SOC2: <Shield className="h-4 w-4 text-purple-400" />,
  PCI_DSS: <Shield className="h-4 w-4 text-orange-400" />,
  GDPR: <Shield className="h-4 w-4 text-red-400" />,
  HIPAA: <Shield className="h-4 w-4 text-teal-400" />,
  FEDRAMP: <Shield className="h-4 w-4 text-indigo-400" />,
  CIS_CONTROLS: <Shield className="h-4 w-4 text-cyan-400" />,
  MITRE_ATTACK: <Shield className="h-4 w-4 text-rose-400" />,
  CUSTOM: <Shield className="h-4 w-4 text-dbi-textSecondary" />,
};

const getStatusIcon = (status: string) => {
  if (status === 'VERIFIED' || status === 'IMPLEMENTED') return <CheckCircle className="h-4 w-4 text-dbi-success" />;
  if (status === 'PARTIALLY_IMPLEMENTED') return <AlertTriangle className="h-4 w-4 text-dbi-warning" />;
  if (status === 'NOT_IMPLEMENTED' || status === 'NOT_APPLICABLE') return <Shield className="h-4 w-4 text-dbi-textSecondary" />;
  return <AlertTriangle className="h-4 w-4 text-dbi-critical" />;
};

export function ComplianceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['compliance-control', id],
    queryFn: () => complianceApi.getControl(id!),
    enabled: !!id,
  });

  const deleteMutation = async () => {
    if (!confirm('Are you sure you want to delete this compliance control? This action cannot be undone.')) return;
    try {
      await complianceApi.delete(id!);
      toast({ title: 'Control deleted', description: 'The compliance control has been deleted successfully' });
      navigate('/compliance');
    } catch {
      toast({ title: 'Error', description: 'Failed to delete control', variant: 'destructive' });
    }
  };

  const control = data?.data;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-dbi-elevated rounded w-1/4" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-dbi-elevated rounded-lg" />)}
        </div>
        <div className="h-64 bg-dbi-elevated rounded-lg" />
      </div>
    );
  }

  if (error || !control) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="mx-auto h-16 w-16 text-dbi-critical" />
        <h2 className="mt-4 text-2xl font-bold text-dbi-textPrimary">Control Not Found</h2>
        <p className="mt-2 text-dbi-textSecondary">The compliance control you're looking for doesn't exist or has been removed.</p>
        <Button asChild className="mt-4">
          <Link to="/compliance"><ArrowLeft className="mr-2 h-4 w-4" />Back to Compliance</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/compliance')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-dbi-textPrimary">{control.name}</h1>
            <p className="text-dbi-textSecondary">{control.controlId || control.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {frameworkIcons[control.framework]}
            <Badge variant="secondary">{control.framework.replace('_', ' ')}</Badge>
          </div>
          <Badge className={statusBadges[control.status] || 'bg-dbi-muted text-dbi-textSecondary'}>
            {control.status.replace('_', ' ')}
          </Badge>
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/compliance/${id}/edit`}>
              <Edit className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={deleteMutation} className="text-dbi-critical hover:text-dbi-critical">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-dbi-cyan/20 flex items-center justify-center">
                <Shield className="h-6 w-6 text-dbi-cyan" />
              </div>
              <div>
                <p className="text-sm text-dbi-textSecondary">Framework</p>
                <p className="text-xl font-bold text-dbi-textPrimary">{control.framework.replace('_', ' ')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-dbi-indigo/20 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-dbi-indigo" />
              </div>
              <div>
                <p className="text-sm text-dbi-textSecondary">Last Assessed</p>
                <p className="text-xl font-bold text-dbi-textPrimary">{control.lastAssessed ? formatDate(control.lastAssessed) : 'Never'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-dbi-success/20 flex items-center justify-center">
                <User className="h-6 w-6 text-dbi-success" />
              </div>
              <div>
                <p className="text-sm text-dbi-textSecondary">Owner</p>
                <p className="text-xl font-bold text-dbi-textPrimary">{control.owner?.fullName || control.owner || 'Unassigned'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-dbi-warning/20 flex items-center justify-center">
                <Clock className="h-6 w-6 text-dbi-warning" />
              </div>
              <div>
                <p className="text-sm text-dbi-textSecondary">Next Review</p>
                <p className="text-xl font-bold text-dbi-textPrimary">{control.nextReviewDate ? formatDate(control.nextReviewDate) : 'Not scheduled'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-invert max-w-none whitespace-pre-wrap text-dbi-textSecondary">
                {control.description || 'No description provided'}
              </div>
            </CardContent>
          </Card>

          {control.evidence && control.evidence.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Evidence & Attachments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {control.evidence.map((ev: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-dbi-elevated rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-dbi-cyan" />
                        <div>
                          <p className="font-medium text-dbi-textPrimary">{ev.name || ev.title || `Evidence ${idx + 1}`}</p>
                          <p className="text-sm text-dbi-textSecondary">{ev.description || ''}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" asChild>
                        <a href={ev.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
          </Card>
          )}

          {control.remediationTasks && control.remediationTasks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-dbi-warning" />
                  Remediation Tasks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {control.remediationTasks.map((task: any) => (
                    <div key={task.id} className="flex items-center justify-between p-3 bg-dbi-elevated rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-dbi-warning" />
                        <div>
                          <p className="font-medium text-dbi-textPrimary">{task.title}</p>
                          <p className="text-sm text-dbi-textSecondary">{task.description}</p>
                        </div>
                      </div>
                      <Badge variant="secondary">{task.status?.replace('_', ' ') || 'Pending'}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
          </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Control ID</p>
                <p className="font-mono text-sm text-dbi-textPrimary">{control.controlId || control.id}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Status</p>
                <div className="flex items-center gap-2">
                  {getStatusIcon(control.status)}
                  <Badge className={getStatusColor(control.status)}>
                    {control.status.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Framework</p>
                <div className="flex items-center gap-2">
                  {frameworkIcons[control.framework]}
                  <p className="text-sm text-dbi-textPrimary">{control.framework.replace('_', ' ')}</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Last Assessed</p>
                <p className="text-sm text-dbi-textPrimary">{control.lastAssessed ? formatDate(control.lastAssessed) : 'Never'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Next Review</p>
                <p className="text-sm text-dbi-textPrimary">{control.nextReviewDate ? formatDate(control.nextReviewDate) : 'Not scheduled'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Owner</p>
                <p className="text-sm text-dbi-textPrimary">{control.owner?.fullName || control.owner || 'Unassigned'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Created</p>
                <p className="text-sm text-dbi-textPrimary">{control.createdAt ? formatDate(control.createdAt) : 'Unknown'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-dbi-textSecondary">Updated</p>
                <p className="text-sm text-dbi-textPrimary">{control.updatedAt ? formatDate(control.updatedAt) : 'Unknown'}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-dbi-info">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-dbi-info" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to={`/compliance/${id}/edit`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Control
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to={`/compliance/${id}/remediation/new`}>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Add Remediation Task
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to={`/compliance/${id}/evidence/new`}>
                  <FileText className="mr-2 h-4 w-4" />
                  Add Evidence
                </Link>
              </Button>
              <Button variant="ghost" className="w-full justify-start text-dbi-critical hover:text-dbi-critical" onClick={deleteMutation}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Control
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}