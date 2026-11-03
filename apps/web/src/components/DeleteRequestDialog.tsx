import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deleteRequestsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';

// "Delete" never removes a document on the spot. The user explains why, a manager of the project
// approves, and only then the document moves to the recycle bin.
export function DeleteRequestDialog({
  doc,
  open,
  onOpenChange,
  onDone,
}: {
  doc: { id: string; name: string; projectId: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setReason(''); }, [open]);

  const valid = reason.trim().length >= 5;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc || !valid) return;
    setBusy(true);
    try {
      const res = await deleteRequestsApi.request(doc.projectId, doc.id, reason.trim(), isSuperAdmin);
      const data = res.data?.data;
      toast(
        data?.deleted
          ? { title: 'Moved to the recycle bin', description: `"${doc.name}" is kept for 30 days` }
          : data?.escalated
            ? { title: 'Request sent to a super admin', description: 'You manage this project, so a super admin has to approve the deletion' }
            : { title: 'Delete request sent', description: `The project's managers were notified. "${doc.name}" stays until one of them approves.` }
      );
      onOpenChange(false);
      onDone();
    } catch (err: any) {
      toast({ title: 'Could not send the request', description: err?.response?.data?.error?.message || 'Please try again', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isSuperAdmin ? 'Delete document' : 'Request to delete this document'}</DialogTitle>
          <DialogDescription>
            {isSuperAdmin
              ? `"${doc?.name}" moves to the recycle bin and is removed for good after 30 days.`
              : `"${doc?.name}" is only deleted after a manager of the project approves. Until then it stays where it is.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="delete-reason" className="text-sm font-medium text-dbi-textSecondary">Reason *</label>
            <textarea
              id="delete-reason"
              rows={4}
              autoFocus
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why should this document be deleted?"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
            {reason.length > 0 && !valid && <p className="text-xs text-dbi-critical">Please write at least 5 characters.</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={!valid || busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSuperAdmin ? 'Delete' : 'Send request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
