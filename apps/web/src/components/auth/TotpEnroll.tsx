import { useState } from 'react';
import { Loader2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

// Shows the QR code and asks for the first 6-digit code to prove the app works
export function TotpEnroll({
  qrDataUrl,
  secret,
  busy,
  onConfirm,
  submitLabel = 'Confirm',
}: {
  qrDataUrl: string;
  secret: string;
  busy: boolean;
  onConfirm: (code: string) => void;
  submitLabel?: string;
}) {
  const [code, setCode] = useState('');

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(code.trim());
      }}
    >
      <ol className="list-decimal space-y-1 pl-5 text-sm text-dbi-textSecondary">
        <li>Open Microsoft Authenticator or Google Authenticator.</li>
        <li>Add an account and scan this QR code.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="flex justify-center rounded-lg bg-white p-3">
        <img src={qrDataUrl} alt="Authenticator QR code" className="h-44 w-44" />
      </div>
      <div className="flex items-center justify-between gap-2 rounded-md bg-dbi-elevated px-3 py-2 text-xs">
        <span className="truncate font-mono text-dbi-textSecondary">Can't scan? Key: {secret}</span>
        <button
          type="button"
          className="text-dbi-cyan"
          onClick={() => {
            navigator.clipboard?.writeText(secret);
            toast({ title: 'Key copied' });
          }}
          aria-label="Copy key"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2">
        <Label htmlFor="totp-code">6-digit code</Label>
        <Input
          id="totp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={busy}
          autoFocus
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy || code.replace(/\s/g, '').length !== 6}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}

// Recovery codes are shown once; the user must keep them somewhere safe
export function RecoveryCodes({ codes, onDone, doneLabel }: { codes: string[]; onDone: () => void; doneLabel: string }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm text-dbi-textSecondary">
        Save these one-time recovery codes. If you lose your phone, each code lets you sign in once. They will not be shown again.
      </p>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-dbi-elevated p-3 font-mono text-sm text-dbi-textPrimary">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => {
          navigator.clipboard?.writeText(codes.join('\n'));
          toast({ title: 'Recovery codes copied' });
        }}
      >
        <Copy className="mr-2 h-4 w-4" /> Copy codes
      </Button>
      <label className="flex items-center gap-2 text-sm text-dbi-textSecondary">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I have saved these codes
      </label>
      <Button className="w-full" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}
