import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { projectDeleteApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';

// "Delete" never removes a project on the spot. The person says why; a super admin decides.
// A super admin deleting also gives a reason, and a backup is taken first.
export function ProjectDeleteDialog({
  project,
  open,
  onOpenChange,
  onDone,
}: {
  project: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setReason(''); }, [open]);
  const valid = reason.trim().length >= 5;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !valid) return;
    setBusy(true);
    try {
      const res = await projectDeleteApi.request(project.id, reason.trim());
      const data = res.data?.data ?? res.data; // the client may or may not have unwrapped the envelope
      toast(
        data?.deleted
          ? { title: 'Project deleted', description: `"${project.name}" was deleted after a safety backup` }
          : { title: 'Delete request sent', description: `Delete pending at ${(data?.pendingWith ?? []).join(', ') || 'a super admin'}. "${project.name}" stays until it is approved.` }
      );
      queryClient.invalidateQueries({ queryKey: ['project-delete-requests'] }); // the cards update at once
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
          <DialogTitle>{isSuperAdmin ? 'Delete project' : 'Request to delete this project'}</DialogTitle>
          <DialogDescription>
            {isSuperAdmin
              ? `"${project?.name}" and everything in it (tasks, documents, reports) is deleted for good. A backup is taken first.`
              : `"${project?.name}" is only deleted after a super admin approves. Until then it stays as it is.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="project-delete-reason" className="text-sm font-medium text-dbi-textSecondary">Why do you want to delete it? *</label>
            <textarea
              id="project-delete-reason"
              rows={4}
              autoFocus
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Write the reason"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
            {reason.length > 0 && !valid && <p className="text-xs text-dbi-critical">Please write at least 5 characters.</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={!valid || busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSuperAdmin ? 'Delete project' : 'Send request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
