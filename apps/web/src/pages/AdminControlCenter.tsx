import { formatDateTimeIST } from '@/lib/utils';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Save, Loader2, Plus, Search, Shield, ToggleLeft, ToggleRight, Key, Server, Database, Globe, Bell, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: 'core' | 'security' | 'ui' | 'integrations' | 'experimental';
  rolloutPercentage: number;
  createdAt: string;
  updatedAt: string;
}

interface SystemSetting {
  key: string;
  label: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  value: any;
  category: 'general' | 'security' | 'storage' | 'notifications' | 'performance' | 'integrations';
  sensitive?: boolean;
}

interface IntegrationConfig {
  id: string;
  name: string;
  type: 'sso' | 'storage' | 'email' | 'webhook' | 'api';
  status: 'connected' | 'disconnected' | 'error';
  config: Record<string, any>;
  lastSync?: string;
}

const mockFeatureFlags: FeatureFlag[] = [
  { id: 'ff-1', name: 'document_ai_processing', description: 'Enable AI-powered document analysis and extraction', enabled: true, category: 'core', rolloutPercentage: 100, createdAt: '2024-01-10T10:00:00Z', updatedAt: '2024-01-15T14:30:00Z' },
  { id: 'ff-2', name: 'realtime_collaboration', description: 'Allow real-time collaborative editing of documents', enabled: false, category: 'experimental', rolloutPercentage: 0, createdAt: '2024-01-12T09:00:00Z', updatedAt: '2024-01-12T09:00:00Z' },
  { id: 'ff-3', name: 'advanced_watermarking', description: 'Dynamic watermarks with user identity and timestamp', enabled: true, category: 'security', rolloutPercentage: 100, createdAt: '2024-01-08T11:00:00Z', updatedAt: '2024-01-14T16:00:00Z' },
  { id: 'ff-4', name: 'compliance_auto_scoring', description: 'Automated compliance control scoring based on evidence', enabled: true, category: 'core', rolloutPercentage: 75, createdAt: '2024-01-05T14:00:00Z', updatedAt: '2024-01-13T10:00:00Z' },
  { id: 'ff-5', name: 'dark_mode_enforced', description: 'Force dark mode for all users', enabled: false, category: 'ui', rolloutPercentage: 0, createdAt: '2024-01-11T08:00:00Z', updatedAt: '2024-01-11T08:00:00Z' },
  { id: 'ff-6', name: 'saml_sso', description: 'SAML 2.0 Single Sign-On integration', enabled: true, category: 'security', rolloutPercentage: 100, createdAt: '2024-01-03T12:00:00Z', updatedAt: '2024-01-16T09:00:00Z' },
  { id: 'ff-7', name: 'webhook_notifications', description: 'Send webhook notifications for critical events', enabled: true, category: 'integrations', rolloutPercentage: 50, createdAt: '2024-01-09T15:00:00Z', updatedAt: '2024-01-15T11:00:00Z' },
  { id: 'ff-8', name: 'knowledge_book_ai_summary', description: 'AI-generated summaries for knowledge books', enabled: false, category: 'experimental', rolloutPercentage: 25, createdAt: '2024-01-14T10:00:00Z', updatedAt: '2024-01-14T10:00:00Z' },
  { id: 'ff-9', name: 'audit_log_encryption', description: 'Encrypt audit logs at rest', enabled: true, category: 'security', rolloutPercentage: 100, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-10T13:00:00Z' },
  { id: 'ff-10', name: 'project_template_marketplace', description: 'Community project templates marketplace', enabled: false, category: 'experimental', rolloutPercentage: 10, createdAt: '2024-01-13T16:00:00Z', updatedAt: '2024-01-13T16:00:00Z' },
];

const mockSystemSettings: SystemSetting[] = [
  { key: 'app_name', label: 'Application Name', description: 'Display name for the application', type: 'string', value: 'DBI Security Center', category: 'general' },
  { key: 'max_file_size_mb', label: 'Max File Upload Size (MB)', description: 'Maximum allowed file size for uploads', type: 'number', value: 100, category: 'storage' },
  { key: 'allowed_file_types', label: 'Allowed File Types', description: 'Comma-separated list of allowed MIME types', type: 'string', value: 'application/pdf,image/*,text/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document', category: 'storage' },
  { key: 'session_timeout_min', label: 'Default Session Timeout (minutes)', description: 'Default session timeout for all users', type: 'number', value: 30, category: 'security' },
  { key: 'password_min_length', label: 'Minimum Password Length', description: 'Minimum required password length', type: 'number', value: 12, category: 'security' },
  { key: 'require_mfa', label: 'Require MFA for Admins', description: 'Enforce multi-factor authentication for admin users', type: 'boolean', value: true, category: 'security' },
  { key: 'audit_retention_days', label: 'Audit Log Retention (days)', description: 'Number of days to retain audit logs', type: 'number', value: 365, category: 'security' },
  { key: 'email_smtp_host', label: 'SMTP Host', description: 'SMTP server hostname for email delivery', type: 'string', value: 'smtp.example.com', category: 'notifications' },
  { key: 'email_smtp_port', label: 'SMTP Port', description: 'SMTP server port', type: 'number', value: 587, category: 'notifications' },
  { key: 'email_from_address', label: 'From Email Address', description: 'Default sender email address', type: 'string', value: 'noreply@dbi.example.com', category: 'notifications' },
  { key: 'webhook_retry_attempts', label: 'Webhook Retry Attempts', description: 'Number of retry attempts for failed webhooks', type: 'number', value: 3, category: 'integrations' },
  { key: 'webhook_timeout_ms', label: 'Webhook Timeout (ms)', description: 'Timeout for webhook requests in milliseconds', type: 'number', value: 10000, category: 'integrations' },
  { key: 'cache_ttl_seconds', label: 'Cache TTL (seconds)', description: 'Time-to-live for cached data', type: 'number', value: 300, category: 'performance' },
  { key: 'rate_limit_requests', label: 'Rate Limit (requests/minute)', description: 'Maximum requests per minute per IP', type: 'number', value: 100, category: 'performance' },
  { key: 'maintenance_mode', label: 'Maintenance Mode', description: 'Enable maintenance mode (read-only)', type: 'boolean', value: false, category: 'general' },
];

const mockIntegrations: IntegrationConfig[] = [
  { id: 'int-1', name: 'Okta SSO', type: 'sso', status: 'connected', config: { domain: 'dbi.okta.com', clientId: '***configured***', issuer: 'https://dbi.okta.com/oauth2/default' }, lastSync: '2024-01-16T08:30:00Z' },
  { id: 'int-2', name: 'AWS S3 Storage', type: 'storage', status: 'connected', config: { bucket: 'dbi-documents-prod', region: 'us-east-1', encryption: 'AES256' }, lastSync: '2024-01-16T09:00:00Z' },
  { id: 'int-3', name: 'SendGrid Email', type: 'email', status: 'connected', config: { apiKey: '***configured***', fromEmail: 'noreply@dbi.example.com', templates: 12 }, lastSync: '2024-01-16T07:00:00Z' },
  { id: 'int-4', name: 'Slack Notifications', type: 'webhook', status: 'connected', config: { webhookUrl: '***configured***', channels: ['#security-alerts', '#compliance-updates'] }, lastSync: '2024-01-16T09:15:00Z' },
  { id: 'int-5', name: 'Jira Integration', type: 'webhook', status: 'disconnected', config: { baseUrl: 'https://dbi.atlassian.net', apiToken: '***not configured***', projectKey: 'SEC' } },
  { id: 'int-6', name: 'REST API Access', type: 'api', status: 'connected', config: { rateLimit: 1000, apiKeys: 3, version: 'v1' }, lastSync: '2024-01-16T09:00:00Z' },
];

export function AdminControlCenter() {
  const [activeTab, setActiveTab] = useState<'features' | 'settings' | 'integrations' | 'maintenance'>('features');
  const [isSaving, setIsSaving] = useState(false);
  const [featureFlags] = useState<FeatureFlag[]>(mockFeatureFlags);
  const [systemSettings] = useState<SystemSetting[]>(mockSystemSettings);
  const [integrations] = useState<IntegrationConfig[]>(mockIntegrations);
  const [featureFilter, setFeatureFilter] = useState<'all' | 'core' | 'security' | 'ui' | 'integrations' | 'experimental'>('all');
  const [settingFilter, setSettingFilter] = useState<'all' | 'general' | 'security' | 'storage' | 'notifications' | 'performance'>('all');
  const [searchFeature, setSearchFeature] = useState('');
  const [searchSetting, setSearchSetting] = useState('');

  // Dialog states
  const [showFeatureDialog, setShowFeatureDialog] = useState(false);
  const [editingFeature, setEditingFeature] = useState<FeatureFlag | null>(null);
  const [featureForm, setFeatureForm] = useState({ name: '', description: '', category: 'core', rolloutPercentage: 0 });

  const [showSettingDialog, setShowSettingDialog] = useState(false);
  const [editingSetting, setEditingSetting] = useState<SystemSetting | null>(null);
  const [settingForm, setSettingForm] = useState({ key: '', label: '', description: '', type: 'string', value: '', category: 'general' });

  const [showIntegrationDialog, setShowIntegrationDialog] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<IntegrationConfig | null>(null);
  const [integrationForm, setIntegrationForm] = useState({ name: '', type: 'webhook', config: {} });

  const filteredFeatures = featureFlags.filter(f => {
    if (featureFilter !== 'all' && f.category !== featureFilter) return false;
    if (searchFeature && !f.name.toLowerCase().includes(searchFeature.toLowerCase()) && !f.description.toLowerCase().includes(searchFeature.toLowerCase())) return false;
    return true;
  });

  const filteredSettings = systemSettings.filter(s => {
    if (settingFilter !== 'all' && s.category !== settingFilter) return false;
    if (searchSetting && !s.label.toLowerCase().includes(searchSetting.toLowerCase()) && !s.description.toLowerCase().includes(searchSetting.toLowerCase())) return false;
    return true;
  });

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'core': return 'bg-dbi-cyan/20 text-dbi-cyan';
      case 'security': return 'bg-dbi-critical/20 text-dbi-critical';
      case 'ui': return 'bg-dbi-purple/20 text-dbi-purple';
      case 'integrations': return 'bg-dbi-amber/20 text-dbi-amber';
      case 'experimental': return 'bg-dbi-warning/20 text-dbi-warning';
      default: return 'bg-dbi-textSecondary/20 text-dbi-textSecondary';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected': return <Badge className="bg-dbi-success/20 text-dbi-success"><CheckCircle className="mr-1 h-3 w-3" />Connected</Badge>;
      case 'disconnected': return <Badge className="bg-dbi-textSecondary/20 text-dbi-textSecondary"><XCircle className="mr-1 h-3 w-3" />Disconnected</Badge>;
      case 'error': return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Error</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const toggleFeature = (flag: FeatureFlag) => {
    const updated = { ...flag, enabled: !flag.enabled, updatedAt: new Date().toISOString() };
    // In real app: await api.updateFeatureFlag(flag.id, updated)
    toast({ title: 'Feature flag updated', description: `${flag.name} is now ${updated.enabled ? 'enabled' : 'disabled'}` });
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    toast({ title: 'Settings saved', description: 'All configuration changes have been persisted' });
    setIsSaving(false);
  };

  const openFeatureDialog = (flag?: FeatureFlag) => {
    if (flag) {
      setEditingFeature(flag);
      setFeatureForm({ name: flag.name, description: flag.description, category: flag.category, rolloutPercentage: flag.rolloutPercentage });
    } else {
      setEditingFeature(null);
      setFeatureForm({ name: '', description: '', category: 'core', rolloutPercentage: 0 });
    }
    setShowFeatureDialog(true);
  };

  const openSettingDialog = (setting?: SystemSetting) => {
    if (setting) {
      setEditingSetting(setting);
      setSettingForm({ key: setting.key, label: setting.label, description: setting.description, type: setting.type, value: String(setting.value), category: setting.category });
    } else {
      setEditingSetting(null);
      setSettingForm({ key: '', label: '', description: '', type: 'string', value: '', category: 'general' });
    }
    setShowSettingDialog(true);
  };

  const openIntegrationDialog = (integration?: IntegrationConfig) => {
    if (integration) {
      setEditingIntegration(integration);
      setIntegrationForm({ name: integration.name, type: integration.type, config: integration.config });
    } else {
      setEditingIntegration(null);
      setIntegrationForm({ name: '', type: 'webhook', config: {} });
    }
    setShowIntegrationDialog(true);
  };

  const handleFeatureSubmit = () => {
    if (editingFeature) {
      toast({ title: 'Feature flag updated', description: `${featureForm.name} has been updated` });
    } else {
      toast({ title: 'Feature flag created', description: `${featureForm.name} has been created` });
    }
    setShowFeatureDialog(false);
  };

  const handleSettingSubmit = () => {
    if (editingSetting) {
      toast({ title: 'Setting updated', description: `${settingForm.label} has been updated` });
    } else {
      toast({ title: 'Setting created', description: `${settingForm.label} has been created` });
    }
    setShowSettingDialog(false);
  };

  const handleIntegrationSubmit = () => {
    if (editingIntegration) {
      toast({ title: 'Integration updated', description: `${integrationForm.name} has been updated` });
    } else {
      toast({ title: 'Integration added', description: `${integrationForm.name} has been added` });
    }
    setShowIntegrationDialog(false);
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-dbi-textPrimary">Admin Control Center</h1>
          <p className="text-dbi-textSecondary">Manage feature flags, system settings, and integrations</p>
        </div>
        <Button onClick={handleSaveAll} disabled={isSaving} className="w-full sm:w-auto">
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save All Changes
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v: 'features' | 'settings' | 'integrations' | 'maintenance') => setActiveTab(v)} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="features">Feature Flags</TabsTrigger>
          <TabsTrigger value="settings">System Settings</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
        </TabsList>

        {/* Feature Flags Tab */}
        <TabsContent value="features" className="space-y-6 mt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
              <Input placeholder="Search feature flags..." value={searchFeature} onChange={e => setSearchFeature(e.target.value)} className="pl-9 bg-dbi-elevated border-dbi-border" />
            </div>
            <Select value={featureFilter} onValueChange={(v: 'all' | 'core' | 'security' | 'ui' | 'integrations' | 'experimental') => setFeatureFilter(v)}>
              <SelectTrigger className="w-48 bg-dbi-elevated border-dbi-border">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="core">Core</SelectItem>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="ui">UI/UX</SelectItem>
                <SelectItem value="integrations">Integrations</SelectItem>
                <SelectItem value="experimental">Experimental</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => openFeatureDialog()} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Add Feature Flag
            </Button>
          </div>

          <Card>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Feature Flag</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="w-48">Rollout</TableHead>
                    <TableHead className="w-40">Status</TableHead>
                    <TableHead className="w-48">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFeatures.map((flag) => (
                    <TableRow key={flag.id} className="hover:bg-dbi-elevated/50">
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => toggleFeature(flag)} className={flag.enabled ? 'text-dbi-success' : 'text-dbi-textSecondary'}>
                          {flag.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-mono text-sm text-dbi-textPrimary">{flag.name}</p>
                          <p className="text-xs text-dbi-textSecondary">{flag.description}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-dbi-textSecondary capitalize">{flag.category}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={getCategoryColor(flag.category)}>
                          {flag.rolloutPercentage}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={flag.enabled ? 'default' : 'secondary'} className={flag.enabled ? 'bg-dbi-success/20 text-dbi-success' : 'bg-dbi-textSecondary/20 text-dbi-textSecondary'}>
                          {flag.enabled ? (
                            <> <CheckCircle className="mr-1 h-3 w-3" />Enabled </>
                          ) : (
                            <> <XCircle className="mr-1 h-3 w-3" />Disabled </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openFeatureDialog(flag)} title="Edit" className="text-dbi-cyan hover:text-dbi-cyan">
                          <Shield className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Settings Tab */}
        <TabsContent value="settings" className="space-y-6 mt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
              <Input placeholder="Search settings..." value={searchSetting} onChange={e => setSearchSetting(e.target.value)} className="pl-9 bg-dbi-elevated border-dbi-border" />
            </div>
            <Select value={settingFilter} onValueChange={(v: 'all' | 'general' | 'security' | 'storage' | 'notifications' | 'performance') => setSettingFilter(v)}>
              <SelectTrigger className="w-48 bg-dbi-elevated border-dbi-border">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="storage">Storage</SelectItem>
                <SelectItem value="notifications">Notifications</SelectItem>
                <SelectItem value="performance">Performance</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => openSettingDialog()} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Add Setting
            </Button>
          </div>

          <Card>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setting</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="w-48">Value</TableHead>
                    <TableHead className="w-48">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSettings.map((setting) => (
                    <TableRow key={setting.key} className="hover:bg-dbi-elevated/50">
                      <TableCell>
                        <div>
                          <p className="font-mono text-sm text-dbi-textPrimary">{setting.key}</p>
                          <p className="font-medium text-dbi-textPrimary">{setting.label}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-dbi-textSecondary">{setting.description}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={getCategoryColor(setting.category)}>
                          {setting.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {setting.type === 'boolean' ? (
                          <Switch checked={setting.value} onCheckedChange={() => {}} disabled />
                        ) : setting.type === 'number' ? (
                          <Input type="number" value={setting.value} onChange={() => {}} className="w-32" disabled />
                        ) : setting.sensitive ? (
                          <Input type="password" value="••••••••" className="w-48" disabled />
                        ) : (
                          <Input value={String(setting.value)} className="w-64" disabled />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openSettingDialog(setting)} title="Edit" className="text-dbi-cyan hover:text-dbi-cyan">
                          <Shield className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="space-y-6 mt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <Button onClick={() => openIntegrationDialog()} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Add Integration
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {integrations.map((integration) => (
              <Card key={integration.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      integration.type === 'sso' ? 'bg-dbi-purple/20 text-dbi-purple' :
                      integration.type === 'storage' ? 'bg-dbi-cyan/20 text-dbi-cyan' :
                      integration.type === 'email' ? 'bg-dbi-green/20 text-dbi-green' :
                      integration.type === 'webhook' ? 'bg-dbi-amber/20 text-dbi-amber' :
                      'bg-dbi-indigo/20 text-dbi-indigo'
                    }`}>
                      {integration.type === 'sso' && <Shield className="h-5 w-5" />}
                      {integration.type === 'storage' && <Database className="h-5 w-5" />}
                      {integration.type === 'email' && <Bell className="h-5 w-5" />}
                      {integration.type === 'webhook' && <Globe className="h-5 w-5" />}
                      {integration.type === 'api' && <Key className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="font-medium text-dbi-textPrimary">{integration.name}</p>
                      <p className="text-xs text-dbi-textSecondary capitalize">{integration.type}</p>
                    </div>
                  </div>
                  {getStatusBadge(integration.status)}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-dbi-textSecondary">
                    Last sync: {integration.lastSync ? formatDateTimeIST(integration.lastSync) : 'Never'}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openIntegrationDialog(integration)} className="flex-1">
                      Configure
                    </Button>
                    <Button variant="ghost" size="sm" className={integration.status === 'connected' ? 'text-dbi-critical' : 'text-dbi-success'}>
                      {integration.status === 'connected' ? 'Disconnect' : 'Connect'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Maintenance Tab */}
        <TabsContent value="maintenance" className="space-y-6 mt-6">
          <Card className="border-dbi-critical/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-dbi-critical" />
                Maintenance Mode
              </CardTitle>
              <CardDescription>Enable maintenance mode to restrict write access during system updates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-dbi-textPrimary">Maintenance Mode</p>
                  <p className="text-sm text-dbi-textSecondary">When enabled, all write operations are blocked and users see a maintenance banner</p>
                </div>
                <Switch
                  checked={systemSettings.find(s => s.key === 'maintenance_mode')?.value || false}
                  onCheckedChange={() => {}}
                />
              </div>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="maintenanceMessage">Maintenance Message</Label>
                  <Textarea id="maintenanceMessage" placeholder="System is undergoing maintenance. Please try again later." rows={3} className="bg-dbi-elevated border-dbi-border" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maintenanceETA">Estimated Completion</Label>
                  <Input id="maintenanceETA" type="datetime-local" className="bg-dbi-elevated border-dbi-border" />
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="destructive">Enable Maintenance Mode</Button>
                <Button variant="outline">Disable Maintenance Mode</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-dbi-cyan" />
                System Health
              </CardTitle>
              <CardDescription>Monitor system health and performance metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-dbi-success/30">
                  <CardContent className="p-4">
                    <p className="text-sm text-dbi-textSecondary">API Uptime</p>
                    <p className="text-3xl font-bold text-dbi-success">99.97%</p>
                  </CardContent>
                </Card>
                <Card className="border-dbi-cyan/30">
                  <CardContent className="p-4">
                    <p className="text-sm text-dbi-textSecondary">Avg Response Time</p>
                    <p className="text-3xl font-bold text-dbi-cyan">142ms</p>
                  </CardContent>
                </Card>
                <Card className="border-dbi-amber/30">
                  <CardContent className="p-4">
                    <p className="text-sm text-dbi-textSecondary">Error Rate</p>
                    <p className="text-3xl font-bold text-dbi-amber">0.03%</p>
                  </CardContent>
                </Card>
                <Card className="border-dbi-purple/30">
                  <CardContent className="p-4">
                    <p className="text-sm text-dbi-textSecondary">Active Users</p>
                    <p className="text-3xl font-bold text-dbi-purple">1,247</p>
                  </CardContent>
                </Card>
              </div>
              <Separator />
              <div className="flex gap-3">
                <Button variant="outline">View Detailed Metrics</Button>
                <Button variant="outline">Export Health Report</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-dbi-purple" />
                Database Management
              </CardTitle>
              <CardDescription>Database maintenance operations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Button variant="outline" className="h-24 flex-col gap-2">
                  <Database className="h-8 w-8 text-dbi-cyan" />
                  <span className="font-medium">Run Vacuum</span>
                  <span className="text-xs text-dbi-textSecondary">Reclaim storage</span>
                </Button>
                <Button variant="outline" className="h-24 flex-col gap-2">
                  <Key className="h-8 w-8 text-dbi-amber" />
                  <span className="font-medium">Rotate Keys</span>
                  <span className="text-xs text-dbi-textSecondary">Encryption keys</span>
                </Button>
                <Button variant="outline" className="h-24 flex-col gap-2">
                  <Globe className="h-8 w-8 text-dbi-purple" />
                  <span className="font-medium">Reindex</span>
                  <span className="text-xs text-dbi-textSecondary">Rebuild indexes</span>
                </Button>
              </div>
              <Separator />
              <p className="text-sm text-dbi-textSecondary">Last backup: 2024-01-16T02:00:00Z | Next scheduled: 2024-01-17T02:00:00Z</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Feature Flag Dialog */}
      <Dialog open={showFeatureDialog} onOpenChange={setShowFeatureDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingFeature ? 'Edit Feature Flag' : 'Create Feature Flag'}</DialogTitle>
            <DialogDescription>{editingFeature ? 'Modify an existing feature flag' : 'Create a new feature flag for gradual rollout'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="featureName">Name</Label>
              <Input id="featureName" value={featureForm.name} onChange={e => setFeatureForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., new_feature_name" disabled={!!editingFeature} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="featureDescription">Description</Label>
              <Textarea id="featureDescription" value={featureForm.description} onChange={e => setFeatureForm(prev => ({ ...prev, description: e.target.value }))} rows={3} placeholder="Describe what this feature does" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="featureCategory">Category</Label>
              <Select value={featureForm.category} onValueChange={v => setFeatureForm(prev => ({ ...prev, category: v }))}>
                <SelectTrigger id="featureCategory"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="core">Core</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="ui">UI/UX</SelectItem>
                  <SelectItem value="integrations">Integrations</SelectItem>
                  <SelectItem value="experimental">Experimental</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rolloutPercentage">Rollout Percentage</Label>
              <Input id="rolloutPercentage" type="range" min="0" max="100" step="5" value={featureForm.rolloutPercentage} onChange={e => setFeatureForm(prev => ({ ...prev, rolloutPercentage: parseInt(e.target.value) }))} />
              <p className="text-sm text-dbi-textSecondary">{featureForm.rolloutPercentage}% of users</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFeatureDialog(false)}>Cancel</Button>
            <Button onClick={handleFeatureSubmit}>{editingFeature ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Setting Dialog */}
      <Dialog open={showSettingDialog} onOpenChange={setShowSettingDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSetting ? 'Edit System Setting' : 'Create System Setting'}</DialogTitle>
            <DialogDescription>{editingSetting ? 'Modify an existing system setting' : 'Add a new system configuration setting'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settingKey">Key</Label>
              <Input id="settingKey" value={settingForm.key} onChange={e => setSettingForm(prev => ({ ...prev, key: e.target.value }))} placeholder="e.g., new_setting_key" disabled={!!editingSetting} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settingLabel">Label</Label>
              <Input id="settingLabel" value={settingForm.label} onChange={e => setSettingForm(prev => ({ ...prev, label: e.target.value }))} placeholder="Human-readable label" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settingDescription">Description</Label>
              <Textarea id="settingDescription" value={settingForm.description} onChange={e => setSettingForm(prev => ({ ...prev, description: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settingType">Type</Label>
              <Select value={settingForm.type} onValueChange={v => setSettingForm(prev => ({ ...prev, type: v }))}>
                <SelectTrigger id="settingType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="string">String</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="settingValue">Value</Label>
              <Input id="settingValue" value={settingForm.value} onChange={e => setSettingForm(prev => ({ ...prev, value: e.target.value }))} placeholder="Setting value" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settingCategory">Category</Label>
              <Select value={settingForm.category} onValueChange={v => setSettingForm(prev => ({ ...prev, category: v }))}>
                <SelectTrigger id="settingCategory"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="storage">Storage</SelectItem>
                  <SelectItem value="notifications">Notifications</SelectItem>
                  <SelectItem value="performance">Performance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingDialog(false)}>Cancel</Button>
            <Button onClick={handleSettingSubmit}>{editingSetting ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Integration Dialog */}
      <Dialog open={showIntegrationDialog} onOpenChange={setShowIntegrationDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingIntegration ? 'Edit Integration' : 'Add Integration'}</DialogTitle>
            <DialogDescription>{editingIntegration ? 'Modify an existing integration configuration' : 'Configure a new external integration'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="integrationName">Name</Label>
              <Input id="integrationName" value={integrationForm.name} onChange={e => setIntegrationForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Custom Webhook" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="integrationType">Type</Label>
              <Select value={integrationForm.type} onValueChange={v => setIntegrationForm(prev => ({ ...prev, type: v }))}>
                <SelectTrigger id="integrationType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sso">SSO Provider</SelectItem>
                  <SelectItem value="storage">Cloud Storage</SelectItem>
                  <SelectItem value="email">Email Service</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                  <SelectItem value="api">API Access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="integrationConfig">Configuration (JSON)</Label>
              <Textarea id="integrationConfig" value={JSON.stringify(integrationForm.config, null, 2)} onChange={e => setIntegrationForm(prev => ({ ...prev, config: JSON.parse(e.target.value || '{}') }))} rows={6} placeholder='{"key": "value"}' className="font-mono text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIntegrationDialog(false)}>Cancel</Button>
            <Button onClick={handleIntegrationSubmit}>{editingIntegration ? 'Update' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}