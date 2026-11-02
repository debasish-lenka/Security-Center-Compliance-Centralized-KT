import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ssoSettingsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';

const errorText = (e: any, fallback: string) => e?.response?.data?.error?.message || fallback;

export function SsoSettings() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [hasSecret, setHasSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sso-settings'],
    queryFn: async () => (await ssoSettingsApi.get()).data?.data,
    enabled: user?.role === 'SUPER_ADMIN',
  });

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setTenantId(data.tenantId);
    setClientId(data.clientId);
    setHasSecret(data.hasClientSecret);
  }, [data]);

  if (user?.role !== 'SUPER_ADMIN') {
    return <p className="text-dbi-textSecondary">Only a super admin can change sign-in settings.</p>;
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await ssoSettingsApi.save({ enabled, tenantId, clientId, clientSecret });
      toast({ title: 'Sign-in settings saved' });
      setClientSecret('');
      await refetch();
    } catch (err) {
      toast({ title: 'Could not save', description: errorText(err, 'Check the fields and try again'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight dbi-gradient-text">Microsoft Sign-in</h1>
          <p className="text-dbi-textSecondary">Let people sign in with their Microsoft 365 work account.</p>
        </div>
        <Badge className={enabled && hasSecret ? 'bg-dbi-success/15 text-dbi-success' : 'bg-dbi-warning/15 text-dbi-warning'}>
          {enabled && hasSecret ? 'Enabled' : 'Off'}
        </Badge>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-dbi-cyan" />
        </div>
      ) : (
        <>
          <Card className="dbi-accent-top">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-dbi-cyan" /> 1. Register the app in Microsoft Entra ID</CardTitle>
              <CardDescription>Entra admin center → App registrations → New registration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-dbi-textSecondary">
              <ol className="list-decimal space-y-1 pl-5">
                <li>Supported account types: <b>this organizational directory only</b>.</li>
                <li>Platform: <b>Web</b>, and paste this Redirect URI exactly:</li>
              </ol>
              <div className="flex items-center gap-2 rounded-md bg-dbi-elevated px-3 py-2">
                <code className="flex-1 break-all text-xs text-dbi-textPrimary">{data?.redirectUri}</code>
                <button
                  type="button"
                  className="text-dbi-cyan"
                  aria-label="Copy redirect URI"
                  onClick={() => { navigator.clipboard?.writeText(data?.redirectUri ?? ''); toast({ title: 'Copied' }); }}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <ol start={3} className="list-decimal space-y-1 pl-5">
                <li>Certificates &amp; secrets → New client secret. Copy the <b>value</b> (shown once).</li>
                <li>Copy the Directory (tenant) ID and Application (client) ID from Overview.</li>
              </ol>
              <p className="text-xs">
                Microsoft only accepts HTTPS redirect URIs. If it refuses an IP address, give the server an internal DNS name and use that in
                the server's <code>.env</code> (<code>PUBLIC_HOST</code>, <code>CORS_ORIGIN</code>).
              </p>
            </CardContent>
          </Card>

          <form onSubmit={save}>
            <Card>
              <CardHeader>
                <CardTitle>2. Enter the details</CardTitle>
                <CardDescription>
                  Only people you add under Team &amp; Users as "Microsoft 365 account" can sign in. There is no automatic sign-up.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tenant">Directory (tenant) ID</Label>
                    <Input id="tenant" placeholder="00000000-0000-0000-0000-000000000000" value={tenantId} onChange={(e) => setTenantId(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="client">Application (client) ID</Label>
                    <Input id="client" placeholder="00000000-0000-0000-0000-000000000000" value={clientId} onChange={(e) => setClientId(e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secret">Client secret</Label>
                  <Input
                    id="secret"
                    type="password"
                    autoComplete="new-password"
                    placeholder={hasSecret ? 'Saved (leave empty to keep)' : ''}
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-dbi-textPrimary">
                  <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                  Show "Sign in with Microsoft" on the login page
                </label>
                <div className="flex justify-end">
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </>
      )}
    </div>
  );
}
