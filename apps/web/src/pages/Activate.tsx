import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Shield, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { accessApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { TotpEnroll, RecoveryCodes } from '@/components/auth/TotpEnroll';

type Stage =
  | { name: 'loading' }
  | { name: 'invalid'; message: string }
  | { name: 'password'; email: string; fullName: string; requiresMfa: boolean }
  | { name: 'enroll'; qrDataUrl: string; secret: string }
  | { name: 'recovery'; codes: string[] }
  | { name: 'done' };

const apiMessage = (e: any, fallback: string) => e?.response?.data?.error?.message || fallback;

// Opened from the invitation email: choose a password (and, for admins, set up the authenticator)
export function Activate() {
  const { token = '' } = useParams();
  const [stage, setStage] = useState<Stage>({ name: 'loading' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    accessApi
      .getInvite(token)
      .then((res) => {
        const d = res.data.data;
        setStage({ name: 'password', email: d.email, fullName: d.fullName, requiresMfa: d.requiresMfa });
      })
      .catch((e) => setStage({ name: 'invalid', message: apiMessage(e, 'This link is invalid or has expired.') }));
  }, [token]);

  const mismatch = confirm.length > 0 && password !== confirm;
  const strong = password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await accessApi.setInvitePassword(token, password);
      const d = res.data.data;
      setStage(d.activated ? { name: 'done' } : { name: 'enroll', qrDataUrl: d.qrDataUrl, secret: d.secret });
    } catch (err) {
      toast({ title: 'Could not set password', description: apiMessage(err, 'Please try again'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (code: string) => {
    setBusy(true);
    try {
      const res = await accessApi.confirmInvite(token, code);
      setStage({ name: 'recovery', codes: res.data.data.recoveryCodes });
    } catch (err) {
      toast({ title: 'Code not accepted', description: apiMessage(err, 'Invalid code'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-dbi-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-dbi-cyan/10">
            <Shield className="h-7 w-7 text-dbi-cyan" />
          </div>
          <CardTitle className="text-2xl">Activate your account</CardTitle>
          <CardDescription>DBI Security Center</CardDescription>
        </CardHeader>
        <CardContent>
          {stage.name === 'loading' && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-dbi-cyan" />
            </div>
          )}

          {stage.name === 'invalid' && (
            <div className="space-y-4 text-center">
              <AlertTriangle className="mx-auto h-10 w-10 text-dbi-warning" />
              <p className="text-sm text-dbi-textSecondary">{stage.message}</p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">Go to sign in</Link>
              </Button>
            </div>
          )}

          {stage.name === 'password' && (
            <form onSubmit={submitPassword} className="space-y-4">
              <p className="text-sm text-dbi-textSecondary">
                Hi {stage.fullName}, choose a password for <span className="font-medium text-dbi-textPrimary">{stage.email}</span>.
                {stage.requiresMfa && ' Next you will set up an authenticator app.'}
              </p>
              <div className="space-y-2">
                <Label htmlFor="pw">New password</Label>
                <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} autoFocus />
                <p className={`text-xs ${password && !strong ? 'text-dbi-critical' : 'text-dbi-textSecondary'}`}>
                  At least 10 characters, with a letter and a number.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Confirm password</Label>
                <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} />
                {mismatch && <p className="text-xs text-dbi-critical">Passwords do not match.</p>}
              </div>
              <Button type="submit" className="w-full" disabled={busy || !strong || password !== confirm}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {stage.requiresMfa ? 'Continue' : 'Activate account'}
              </Button>
            </form>
          )}

          {stage.name === 'enroll' && (
            <TotpEnroll qrDataUrl={stage.qrDataUrl} secret={stage.secret} busy={busy} onConfirm={confirmCode} submitLabel="Verify and activate" />
          )}

          {stage.name === 'recovery' && (
            <RecoveryCodes codes={stage.codes} doneLabel="Continue to sign in" onDone={() => setStage({ name: 'done' })} />
          )}

          {stage.name === 'done' && (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-dbi-success" />
              <p className="text-sm text-dbi-textSecondary">Your account is active. You can sign in now.</p>
              <Button asChild className="w-full">
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
