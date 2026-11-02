import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Shield, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { accessApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { TotpEnroll, RecoveryCodes } from '@/components/auth/TotpEnroll';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

type Step =
  | { name: 'credentials' }
  | { name: 'code'; mfaToken: string }
  | { name: 'enroll'; mfaToken: string; qrDataUrl: string; secret: string }
  | { name: 'recovery'; codes: string[]; user: any; token: string };

const apiMessage = (e: any, fallback: string) => e?.response?.data?.error?.message || fallback;

export function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>({ name: 'credentials' });
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const { login, completeLogin } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    const outcome = await login(data.email, data.password);
    if (outcome.status === 'ok') {
      navigate('/');
    } else if (outcome.status === 'mfa' && outcome.setupRequired) {
      // Admin without an authenticator yet: enroll before getting a session
      try {
        const res = await accessApi.mfaSetup(outcome.mfaToken);
        const { qrDataUrl, secret } = res.data.data;
        setStep({ name: 'enroll', mfaToken: outcome.mfaToken, qrDataUrl, secret });
      } catch (e) {
        toast({ title: 'Error', description: apiMessage(e, 'Could not start authenticator setup'), variant: 'destructive' });
      }
    } else if (outcome.status === 'mfa') {
      setCode('');
      setUseRecovery(false);
      setStep({ name: 'code', mfaToken: outcome.mfaToken });
    }
    setIsLoading(false);
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step.name !== 'code') return;
    setIsLoading(true);
    try {
      const res = await accessApi.verifyMfa({
        mfaToken: step.mfaToken,
        ...(useRecovery ? { recoveryCode: code.trim() } : { code: code.trim() }),
      });
      completeLogin(res.data.data.user, res.data.data.token);
      navigate('/');
    } catch (err) {
      toast({ title: 'Sign-in failed', description: apiMessage(err, 'Invalid code'), variant: 'destructive' });
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const confirmEnroll = async (value: string) => {
    if (step.name !== 'enroll') return;
    setIsLoading(true);
    try {
      const res = await accessApi.mfaConfirm(step.mfaToken, value);
      const { user, token, recoveryCodes } = res.data.data;
      setStep({ name: 'recovery', codes: recoveryCodes, user, token });
    } catch (err) {
      toast({ title: 'Code not accepted', description: apiMessage(err, 'Invalid code'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const titles: Record<Step['name'], { title: string; description: string }> = {
    credentials: {
      title: 'Welcome to DBI Security Center',
      description: 'Centralized Security Operations, Knowledge Transfer & Compliance Management',
    },
    code: { title: 'Two-step verification', description: 'Enter the code from your authenticator app' },
    enroll: { title: 'Set up your authenticator', description: 'Administrator accounts require two-step verification' },
    recovery: { title: 'Save your recovery codes', description: 'You are almost done' },
  };

  return (
    <div className="min-h-screen bg-dbi-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-dbi-cyan/10">
            <Shield className="h-7 w-7 text-dbi-cyan" />
          </div>
          <CardTitle className="text-2xl">{titles[step.name].title}</CardTitle>
          <CardDescription>{titles[step.name].description}</CardDescription>
        </CardHeader>
        <CardContent>
          {step.name === 'credentials' && (
            <>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@company.com" {...register('email')} disabled={isLoading} />
                  {errors.email && <p className="text-sm text-dbi-critical">{errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" placeholder="••••••••" {...register('password')} disabled={isLoading} />
                  {errors.password && <p className="text-sm text-dbi-critical">{errors.password.message}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Signing in...' : 'Sign in'}
                </Button>
              </form>
              {import.meta.env.DEV && (
                <p className="mt-6 text-center text-sm text-dbi-textSecondary">
                  Dev default: admin@dbi.example.com / Admin@123
                </p>
              )}
            </>
          )}

          {step.name === 'code' && (
            <form onSubmit={submitCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mfa-code">{useRecovery ? 'Recovery code' : '6-digit code'}</Label>
                <Input
                  id="mfa-code"
                  inputMode={useRecovery ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  placeholder={useRecovery ? 'a1b2-c3d4' : '123456'}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading || code.trim().length < 6}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify
              </Button>
              <div className="flex justify-between text-sm">
                <button type="button" className="text-dbi-cyan" onClick={() => { setUseRecovery(!useRecovery); setCode(''); }}>
                  {useRecovery ? 'Use authenticator code' : 'Use a recovery code'}
                </button>
                <button type="button" className="text-dbi-textSecondary" onClick={() => setStep({ name: 'credentials' })}>
                  Back
                </button>
              </div>
            </form>
          )}

          {step.name === 'enroll' && (
            <TotpEnroll qrDataUrl={step.qrDataUrl} secret={step.secret} busy={isLoading} onConfirm={confirmEnroll} submitLabel="Verify and continue" />
          )}

          {step.name === 'recovery' && (
            <RecoveryCodes
              codes={step.codes}
              doneLabel="Continue to dashboard"
              onDone={() => {
                completeLogin(step.user, step.token);
                navigate('/');
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
