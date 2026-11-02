import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { documentsApi, projectsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { UserCheck, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ReviewDialogProps {
  documentId: string;
  documentName: string;
  projectId: string;
  reviewStatus: string | null;
  reviewerId?: string;
  isReviewer: boolean;
  canSubmitForReview: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReviewComplete: () => void;
}

export function ReviewDialog({
  documentId,
  documentName,
  projectId: _projectId,
  reviewStatus,
  reviewerId,
  isReviewer,
  canSubmitForReview,
  open,
  onOpenChange,
  onReviewComplete
}: ReviewDialogProps) {
  const queryClient = useQueryClient();
  const [selectedAction, setSelectedAction] = useState<'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'>('APPROVED');
  const [comments, setComments] = useState('');
  const [selectedReviewer, setSelectedReviewer] = useState<string>('');

  // Project members who can be asked to review (everyone except the person submitting)
  const { user: me } = useAuth();
  const { data: members = [] } = useQuery({
    queryKey: ['project-members', _projectId],
    queryFn: async () => ((await projectsApi.get(_projectId)).data?.members ?? []) as any[],
    enabled: open && !!_projectId,
  });
  const projectMembers = members
    .filter((m: any) => m.userId !== me?.id)
    .map((m: any) => ({ id: m.userId, fullName: m.user?.fullName ?? 'Unknown', email: m.user?.email ?? '', role: m.role }));

  const submitReviewMutation = useMutation({
    mutationFn: async (reviewerId: string) => {
      const response = await documentsApi.submitReview(documentId, reviewerId);
      return response as { data: any };
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Document submitted for review' });
      onOpenChange(false);
      onReviewComplete();
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to submit for review', variant: 'destructive' });
    },
  });

  const reviewDocumentMutation = useMutation({
    mutationFn: async ({ status, comments }: { status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'; comments?: string }) => {
      const response = await documentsApi.reviewDocument(documentId, status, comments);
      return response as { data: any };
    },
    onSuccess: () => {
      toast({ title: 'Success', description: `Document ${selectedAction.toLowerCase()}` });
      onOpenChange(false);
      onReviewComplete();
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to review document', variant: 'destructive' });
    },
  });

  const isSubmitting = submitReviewMutation.isPending;
  const isReviewing = reviewDocumentMutation.isPending;

  const handleSubmitForReview = () => {
    if (!selectedReviewer) {
      toast({ title: 'Error', description: 'Please select a reviewer', variant: 'destructive' });
      return;
    }
    submitReviewMutation.mutate(selectedReviewer);
  };

  const handleReview = () => {
    reviewDocumentMutation.mutate({ status: selectedAction, comments: comments || undefined });
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {/* Submit for Review */}
        {canSubmitForReview && reviewStatus !== 'PENDING' && reviewStatus !== 'APPROVED' && !isReviewer && (
          <>
            <DialogHeader>
              <DialogTitle>Submit for Review</DialogTitle>
              <DialogDescription>
                Request a review for "{documentName}"
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="reviewer">Select Reviewer</Label>
                <Select value={selectedReviewer} onValueChange={setSelectedReviewer}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Choose a reviewer" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectMembers
                      .filter(m => m.role !== 'VIEWER' && m.id !== reviewerId)
                      .map(member => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.fullName} ({member.role})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button onClick={handleSubmitForReview} disabled={isSubmitting || !selectedReviewer}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Submit for Review
                </Button>
              </DialogFooter>
            </div>
          </>
        )}

        {/* Review Document */}
        {isReviewer && reviewStatus === 'PENDING' && (
          <>
            <DialogHeader>
              <DialogTitle>Review Document</DialogTitle>
              <DialogDescription>
                Review "{documentName}" and provide your decision
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label>Decision</Label>
                <Select value={selectedAction} onValueChange={(value) => setSelectedAction(value as 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED')}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select decision" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPROVED">Approve</SelectItem>
                    <SelectItem value="REJECTED">Reject</SelectItem>
                    <SelectItem value="CHANGES_REQUESTED">Request Changes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="comments">Comments (Optional)</Label>
                <Textarea
                  id="comments"
                  value={comments}
                  onChange={e => setComments(e.target.value)}
                  placeholder="Add review comments..."
                  className="mt-2"
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isReviewing}>
                  Cancel
                </Button>
                <Button
                  onClick={handleReview}
                  disabled={isReviewing}
                  variant={selectedAction === 'APPROVED' ? 'default' : selectedAction === 'REJECTED' ? 'destructive' : 'outline'}
                >
                  {isReviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {selectedAction === 'APPROVED' && 'Approve'}
                  {selectedAction === 'REJECTED' && 'Reject'}
                  {selectedAction === 'CHANGES_REQUESTED' && 'Request Changes'}
                </Button>
              </DialogFooter>
            </div>
          </>
        )}

        {/* View Review Status */}
        {reviewStatus && reviewStatus !== 'PENDING' && !canSubmitForReview && !isReviewer && (
          <>
            <DialogHeader>
              <DialogTitle>Review Status</DialogTitle>
              <DialogDescription>
                Current review status for "{documentName}"
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-4 bg-dbi-elevated rounded-lg">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                  reviewStatus === 'APPROVED' ? 'bg-dbi-success/20' :
                  reviewStatus === 'REJECTED' ? 'bg-dbi-critical/20' :
                  'bg-dbi-warning/20'
                }`}>
                  {reviewStatus === 'APPROVED' && <UserCheck className="h-5 w-5 text-dbi-success" />}
                  {reviewStatus === 'REJECTED' && <XCircle className="h-5 w-5 text-dbi-critical" />}
                  {reviewStatus === 'CHANGES_REQUESTED' && <AlertTriangle className="h-5 w-5 text-dbi-warning" />}
                </div>
                <div>
                  <p className="font-medium text-dbi-textPrimary">
                    {reviewStatus === 'APPROVED' && 'Approved'}
                    {reviewStatus === 'REJECTED' && 'Rejected'}
                    {reviewStatus === 'CHANGES_REQUESTED' && 'Changes Requested'}
                    {reviewStatus === 'PENDING' && 'Pending Review'}
                  </p>
                  <p className="text-sm text-dbi-textSecondary">
                    Document review completed
                  </p>
                </div>
              </div>

              {comments && (
                <div>
                  <Label>Reviewer Comments</Label>
                  <p className="mt-2 p-3 bg-dbi-elevated rounded-lg text-sm text-dbi-textSecondary">
                    {comments}
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          </>
        )}

        {/* Already reviewed by current user */}
        {isReviewer && reviewStatus && reviewStatus !== 'PENDING' && (
          <>
            <DialogHeader>
              <DialogTitle>Review Completed</DialogTitle>
              <DialogDescription>
                You have already reviewed this document
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-4 bg-dbi-elevated rounded-lg">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                  reviewStatus === 'APPROVED' ? 'bg-dbi-success/20' :
                  reviewStatus === 'REJECTED' ? 'bg-dbi-critical/20' :
                  'bg-dbi-warning/20'
                }`}>
                  {reviewStatus === 'APPROVED' && <UserCheck className="h-5 w-5 text-dbi-success" />}
                  {reviewStatus === 'REJECTED' && <XCircle className="h-5 w-5 text-dbi-critical" />}
                  {reviewStatus === 'CHANGES_REQUESTED' && <AlertTriangle className="h-5 w-5 text-dbi-warning" />}
                </div>
                <div>
                  <p className="font-medium text-dbi-textPrimary">
                    {reviewStatus === 'APPROVED' && 'Approved'}
                    {reviewStatus === 'REJECTED' && 'Rejected'}
                    {reviewStatus === 'CHANGES_REQUESTED' && 'Changes Requested'}
                  </p>
                  <p className="text-sm text-dbi-textSecondary">
                    Your review decision
                  </p>
                </div>
              </div>

              {comments && (
                <div>
                  <Label>Your Comments</Label>
                  <p className="mt-2 p-3 bg-dbi-elevated rounded-lg text-sm text-dbi-textSecondary">
                    {comments}
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          </>
        )}

        {/* No action available */}
        {(!canSubmitForReview && !isReviewer) || (reviewStatus === 'APPROVED' && canSubmitForReview) ? (
          <>
            <DialogHeader>
              <DialogTitle>Review Not Available</DialogTitle>
              <DialogDescription>
                You don't have permission to review or submit this document for review
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-dbi-textSecondary">
                {reviewStatus === 'APPROVED' ? 'This document has already been approved.' :
                 reviewStatus === 'REJECTED' ? 'This document has been rejected.' :
                 reviewStatus === 'CHANGES_REQUESTED' ? 'Changes have been requested for this document.' :
                 'Only document owners, co-authors, or project leads can submit for review. Only assigned reviewers can review.'}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}