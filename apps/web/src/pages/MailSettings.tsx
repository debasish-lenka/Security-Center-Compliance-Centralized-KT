import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Mail, Send, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { mailSettingsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Provider = 'SMTP' | 'GRAPH';

interface FormState {
  provider: Provider;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

const empty: FormState = {
  provider: 'SMTP',
  fromName: 'DBI Security Center',
  fromEmail: '',
  smtpHost: 'smtp.office365.com',
  smtpPort: '587',
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  tenantId: '',
  clientId: '',
  clientSecret: '',
};

const errorText = (e: any, fallback: string) => e?.response?.data?.error?.message || fallback;

export function MailSettings() {
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [hasSmtpPassword, setHasSmtpPassword] = useState(false);
  const [hasClientSecret, setHasClientSecret] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mail-settings'],
    queryFn: async () => (await mailSettingsApi.get()).data?.data,
    enabled: user?.role === 'SUPER_ADMIN',
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      ...empty,
      provider: data.provider,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      smtpHost: data.smtpHost,
      smtpPort: String(data.smtpPort ?? 587),
      smtpSecure: data.smtpSecure,
      smtpUser: data.smtpUser,
      tenantId: data.tenantId,
      clientId: data.clientId,
    });
    setHasSmtpPassword(data.hasSmtpPassword);
    setHasClientSecret(data.hasClientSecret);
  }, [data]);

  if (user?.role !== 'SUPER_ADMIN') {
    return <p className="text-dbi-textSecondary">Only a super admin can change mail settings.</p>;
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await mailSettingsApi.save({
        provider: form.provider,
        fromName: form.fromName,
        fromEmail: form.fromEmail,
        smtpHost: form.smtpHost,
        smtpPort: Number(form.smtpPort),
        smtpSecure: form.smtpSecure,
        smtpUser: form.smtpUser,
        smtpPassword: form.smtpPassword,
        tenantId: form.tenantId,
        clientId: form.clientId,
        clientSecret: form.clientSecret,
      });
      toast({ title: 'Mail settings saved' });
      setForm((f) => ({ ...f, smtpPassword: '', clientSecret: '' }));
      await refetch();
    } catch (err) {
      toast({ title: 'Could not save', description: errorText(err, 'Check the fields and try again'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      await mailSettingsApi.sendTest(testTo);
      toast({ title: 'Test email sent', description: `Check the inbox of ${testTo}` });
    } catch (err) {
      toast({ title: 'Test failed', description: errorText(err, 'Sending failed'), variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const providerButton = (value: Provider, label: string, hint: string) => (
    <button
      type="button"
      onClick={() => set('provider', value)}
      className={cn(
        'flex-1 rounded-lg border p-4 text-left transition-colors',
        form.provider === value ? 'border-dbi-cyan bg-dbi-cyan/10' : 'border-dbi-border hover:bg-dbi-elevated'
      )}
    >
      <p className="font-medium text-dbi-textPrimary">{label}</p>
      <p className="text-xs text-dbi-textSecondary">{hint}</p>
    </button>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight dbi-gradient-text">Mail Settings</h1>
          <p className="text-dbi-textSecondary">Used to email account activation links to new users.</p>
        </div>
        {data && (
          <Badge className={data.configured ? 'bg-dbi-success/15 text-dbi-success' : 'bg-dbi-warning/15 text-dbi-warning'}>
            {data.configured ? 'Configured' : 'Not configured'}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-dbi-cyan" />
        </div>
      ) : (
        <form onSubmit={save} className="space-y-6">
          <Card className="dbi-accent-top">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-dbi-cyan" /> Delivery method</CardTitle>
              <CardDescription>Choose how the server sends email through Office 365.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                {providerButton('SMTP', 'SMTP', 'Mailbox username and password (smtp.office365.com)')}
                {providerButton('GRAPH', 'Enterprise app (Microsoft Graph)', 'Entra ID app registration, no mailbox password')}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fromName">Sender name</Label>
                  <Input id="fromName" value={form.fromName} onChange={(e) => set('fromName', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fromEmail">Sender email</Label>
                  <Input id="fromEmail" type="email" placeholder="noreply@yourcompany.com" value={form.fromEmail} onChange={(e) => set('fromEmail', e.target.value)} required />
                </div>
              </div>
            </CardContent>
          </Card>

          {form.provider === 'SMTP' ? (
            <Card>
              <CardHeader>
                <CardTitle>SMTP</CardTitle>
                <CardDescription>
                  Office 365 defaults: smtp.office365.com, port 587 (STARTTLS). The mailbox needs "Authenticated SMTP" enabled, and the
                  tenant must allow SMTP AUTH.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="smtpHost">Server</Label>
                    <Input id="smtpHost" value={form.smtpHost} onChange={(e) => set('smtpHost', e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpPort">Port</Label>
                    <Input id="smtpPort" type="number" value={form.smtpPort} onChange={(e) => set('smtpPort', e.target.value)} required />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-dbi-textSecondary">
                  <input type="checkbox" checked={form.smtpSecure} onChange={(e) => set('smtpSecure', e.target.checked)} />
                  Use implicit SSL/TLS (port 465). Leave off for port 587.
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="smtpUser">Username</Label>
                    <Input id="smtpUser" autoComplete="off" value={form.smtpUser} onChange={(e) => set('smtpUser', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpPassword">Password</Label>
                    <Input
                      id="smtpPassword"
                      type="password"
                      autoComplete="new-password"
                      placeholder={hasSmtpPassword ? 'Saved (leave empty to keep)' : ''}
                      value={form.smtpPassword}
                      onChange={(e) => set('smtpPassword', e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Enterprise app (Microsoft Graph)</CardTitle>
                <CardDescription>
                  In Entra ID, register an app, add the <b>Mail.Send</b> application permission, grant admin consent, and create a client
                  secret. The sender email must be a real mailbox in your tenant.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tenantId">Directory (tenant) ID</Label>
                    <Input id="tenantId" value={form.tenantId} onChange={(e) => set('tenantId', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clientId">Application (client) ID</Label>
                    <Input id="clientId" value={form.clientId} onChange={(e) => set('clientId', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientSecret">Client secret</Label>
                  <Input
                    id="clientSecret"
                    type="password"
                    autoComplete="new-password"
                    placeholder={hasClientSecret ? 'Saved (leave empty to keep)' : ''}
                    value={form.clientSecret}
                    onChange={(e) => set('clientSecret', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs text-dbi-textSecondary">
              <ShieldCheck className="h-4 w-4 text-dbi-success" /> Passwords and secrets are stored encrypted and never shown again.
            </p>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save settings
            </Button>
          </div>
        </form>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Send a test email</CardTitle>
          <CardDescription>Uses the saved settings. Save first if you changed anything.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input type="email" placeholder="you@yourcompany.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <Button type="button" variant="outline" onClick={sendTest} disabled={testing || !testTo}>
              {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send test
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
