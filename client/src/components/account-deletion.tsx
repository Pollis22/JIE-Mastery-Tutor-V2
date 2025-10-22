import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, AlertTriangle, Trash2, XCircle } from "lucide-react";
import { useLocation } from "wouter";

export function AccountDeletion() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isImmediateDeleteOpen, setIsImmediateDeleteOpen] = useState(false);

  // Query account status
  const { data: accountStatus } = useQuery({
    queryKey: ['/api/account/status'],
    enabled: !!user,
  });

  // Cancel subscription mutation
  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/subscription/cancel', 'POST', {});
    },
    onSuccess: () => {
      toast({
        title: "Subscription Cancelled",
        description: "Your subscription has been cancelled. You can resubscribe anytime.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/account/status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel subscription",
        variant: "destructive",
      });
    },
  });

  // Request deletion mutation (30-day grace period)
  const requestDeletionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/account/request-deletion', 'POST', {
        confirmPassword,
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Deletion Requested",
        description: data.details || "Your account will be deleted in 30 days.",
      });
      setIsDeleteDialogOpen(false);
      setConfirmPassword("");
      queryClient.invalidateQueries({ queryKey: ['/api/account/status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to request deletion",
        variant: "destructive",
      });
    },
  });

  // Immediate deletion mutation
  const immediateDeleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/account/delete-now', 'POST', {
        confirmPassword,
        confirmText,
      });
    },
    onSuccess: () => {
      toast({
        title: "Account Deleted",
        description: "Your account has been permanently deleted.",
      });
      // Redirect to auth page after deletion
      setTimeout(() => {
        setLocation("/auth");
      }, 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete account",
        variant: "destructive",
      });
    },
  });

  // Cancel pending deletion
  const cancelDeletionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/account/cancel-deletion', 'POST', {});
    },
    onSuccess: () => {
      toast({
        title: "Deletion Cancelled",
        description: "Your account deletion has been cancelled.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/account/status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel deletion",
        variant: "destructive",
      });
    },
  });

  const hasPendingDeletion = accountStatus?.pendingDeletion;
  const hasActiveSubscription = accountStatus?.subscriptionStatus === 'active';

  return (
    <div className="space-y-6">
      {/* Pending Deletion Warning */}
      {hasPendingDeletion && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Account Scheduled for Deletion</AlertTitle>
          <AlertDescription className="mt-2">
            <p>Your account is scheduled to be permanently deleted on {new Date(hasPendingDeletion.scheduledDate).toLocaleDateString()}.</p>
            <p className="mt-1">You have {hasPendingDeletion.daysRemaining} days remaining to cancel this request.</p>
            <Button 
              onClick={() => cancelDeletionMutation.mutate()}
              className="mt-3"
              variant="outline"
              disabled={cancelDeletionMutation.isPending}
            >
              Cancel Deletion Request
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Subscription Cancellation */}
      {hasActiveSubscription && !hasPendingDeletion && (
        <Card>
          <CardHeader>
            <CardTitle>Cancel Subscription</CardTitle>
            <CardDescription>
              Stop your subscription but keep your account and data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Cancelling your subscription will:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground mb-4 space-y-1">
              <li>Stop all future charges</li>
              <li>Remove access to tutoring sessions</li>
              <li>Keep your account and learning history</li>
              <li>Allow you to resubscribe anytime</li>
            </ul>
            <Button 
              onClick={() => cancelSubscriptionMutation.mutate()}
              variant="outline"
              disabled={cancelSubscriptionMutation.isPending}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel Subscription
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Account Deletion */}
      {!hasPendingDeletion && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Delete Account</CardTitle>
            <CardDescription>
              Permanently remove your account and all data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                Account deletion is permanent and cannot be undone. All your data including:
                <ul className="list-disc list-inside mt-2">
                  <li>Student profiles and progress</li>
                  <li>Learning history and transcripts</li>
                  <li>Documents and settings</li>
                  <li>All subscription information</li>
                </ul>
                will be permanently deleted.
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              {/* Standard 30-day deletion */}
              <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground">
                    Request Deletion (30-day grace period)
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Request Account Deletion</DialogTitle>
                    <DialogDescription>
                      Your account will be permanently deleted after 30 days. You can cancel this request anytime before then.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="password">Confirm your password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter your password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsDeleteDialogOpen(false);
                        setConfirmPassword("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => requestDeletionMutation.mutate()}
                      disabled={!confirmPassword || requestDeletionMutation.isPending}
                    >
                      Request Deletion
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Immediate deletion (for testing) */}
              {process.env.NODE_ENV === 'development' && (
                <Dialog open={isImmediateDeleteOpen} onOpenChange={setIsImmediateDeleteOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Now (Testing)
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Permanently Delete Account</DialogTitle>
                      <DialogDescription>
                        This action is immediate and cannot be undone. All your data will be permanently deleted.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="password-immediate">Confirm your password</Label>
                        <Input
                          id="password-immediate"
                          type="password"
                          placeholder="Enter your password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-text">Type "DELETE MY ACCOUNT" to confirm</Label>
                        <Input
                          id="confirm-text"
                          type="text"
                          placeholder="DELETE MY ACCOUNT"
                          value={confirmText}
                          onChange={(e) => setConfirmText(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsImmediateDeleteOpen(false);
                          setConfirmPassword("");
                          setConfirmText("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => immediateDeleteMutation.mutate()}
                        disabled={
                          !confirmPassword || 
                          confirmText !== 'DELETE MY ACCOUNT' || 
                          immediateDeleteMutation.isPending
                        }
                      >
                        Delete Permanently
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}