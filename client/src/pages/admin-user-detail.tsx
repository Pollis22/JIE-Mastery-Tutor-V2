import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft, 
  User, 
  CreditCard, 
  Clock, 
  FileText,
  Calendar,
  BookOpen,
  Ban,
  Trash2,
  XCircle,
  AlertTriangle,
  Shield
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatChicagoDate } from "@/lib/date-utils";

interface UserDetails {
  user: {
    id: string;
    username: string;
    email: string;
    studentName?: string;
    gradeLevel?: string;
    subscriptionPlan?: string;
    subscriptionStatus?: string;
    subscriptionMinutesLimit?: number;
    subscriptionMinutesUsed?: number;
    purchasedMinutesBalance?: number;
    createdAt: string;
    emailVerified?: boolean;
    isAdmin?: boolean;
    isDisabled?: boolean;
    deletedAt?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
  };
  stats: {
    totalSessions: number;
    totalMinutes: number;
    documentsCount: number;
  };
  recentSessions: Array<{
    id: string;
    studentName?: string;
    subject?: string;
    ageGroup?: string;
    language?: string;
    minutesUsed?: number;
    startedAt: string;
    endedAt?: string;
    status: string;
  }>;
  documents: Array<{
    id: string;
    fileName: string;
    createdAt: string;
  }>;
}

export default function AdminUserDetail() {
  const params = useParams();
  const userId = params.userId;
  const { toast } = useToast();

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cancelOption, setCancelOption] = useState<'immediate' | 'period_end'>('immediate');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [purgeData, setPurgeData] = useState(false);
  const [isTestAccount, setIsTestAccount] = useState(false);
  const [deleteStripeCustomer, setDeleteStripeCustomer] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<UserDetails>({
    queryKey: ["/api/admin/users", userId],
    enabled: !!userId,
  });

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async (cancelImmediately: boolean) => {
      const response = await apiRequest("POST", `/api/admin/users/${userId}/cancel-subscription`, {
        cancelImmediately,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Subscription Canceled",
        description: data.message,
      });
      setShowCancelModal(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel subscription",
        variant: "destructive",
      });
    },
  });

  const disableAccountMutation = useMutation({
    mutationFn: async (isDisabled: boolean) => {
      const response = await apiRequest("POST", `/api/admin/users/${userId}/disable`, {
        isDisabled,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.isDisabled ? "Account Disabled" : "Account Enabled",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update account status",
        variant: "destructive",
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/users/${userId}/delete`, {
        confirm: deleteConfirmText,
        purgeData,
        deleteStripeCustomer: isTestAccount && deleteStripeCustomer,
        reason: deleteReason,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Account Deleted",
        description: data.message,
      });
      setShowDeleteModal(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete account",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Link href="/admin/users">
            <Button variant="ghost" className="gap-2" data-testid="button-back-to-users">
              <ArrowLeft className="w-4 h-4" />
              Back to Users
            </Button>
          </Link>
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">User not found or error loading user details.</p>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  const { user, stats, recentSessions, documents } = data;
  const hasActiveSubscription = user.subscriptionStatus === 'active';
  const isDeleted = !!user.deletedAt;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/users">
              <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back-to-users">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
            <div>
              <h2 className="text-3xl font-bold text-foreground">{user.username}</h2>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {user.isAdmin && (
              <Badge variant="secondary">Admin</Badge>
            )}
            {isDeleted && (
              <Badge variant="destructive">Deleted</Badge>
            )}
            {user.isDisabled && !isDeleted && (
              <Badge variant="outline" className="text-orange-600 border-orange-600">Disabled</Badge>
            )}
            {user.emailVerified ? (
              <Badge variant="default">Email Verified</Badge>
            ) : (
              <Badge variant="outline">Email Unverified</Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Total Sessions</span>
              </div>
              <p className="text-2xl font-bold" data-testid="text-total-sessions">{stats.totalSessions}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Total Minutes</span>
              </div>
              <p className="text-2xl font-bold" data-testid="text-total-minutes">{stats.totalMinutes}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FileText className="w-4 h-4" />
                <span className="text-sm">Documents</span>
              </div>
              <p className="text-2xl font-bold" data-testid="text-documents-count">{stats.documentsCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Calendar className="w-4 h-4" />
                <span className="text-sm">Member Since</span>
              </div>
              <p className="text-lg font-medium" data-testid="text-created-at">
                {formatChicagoDate(user.createdAt)}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <Shield className="w-5 h-5" />
              Admin Actions
            </CardTitle>
            <CardDescription>
              Manage this user's account, subscription, and access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <Ban className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Disable Login</p>
                  <p className="text-sm text-muted-foreground">
                    Prevent user from logging in or starting sessions
                  </p>
                </div>
              </div>
              <Switch
                checked={user.isDisabled || false}
                onCheckedChange={(checked) => disableAccountMutation.mutate(checked)}
                disabled={disableAccountMutation.isPending || isDeleted}
                data-testid="switch-disable-account"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <XCircle className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Cancel Subscription</p>
                  <p className="text-sm text-muted-foreground">
                    {hasActiveSubscription 
                      ? `Plan: ${user.subscriptionPlan} - Cancel in Stripe and update database`
                      : 'No active subscription'}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowCancelModal(true)}
                disabled={!hasActiveSubscription || isDeleted}
                data-testid="button-cancel-subscription"
              >
                Cancel Subscription
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/50">
              <div className="flex items-center gap-3">
                <Trash2 className="w-5 h-5 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">Delete Account</p>
                  <p className="text-sm text-muted-foreground">
                    Soft-delete account, cancel subscription, optionally purge data
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteModal(true)}
                disabled={isDeleted}
                data-testid="button-delete-account"
              >
                Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Username</p>
                  <p className="font-medium" data-testid="text-username">{user.username}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium" data-testid="text-email">{user.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Student Name</p>
                  <p className="font-medium" data-testid="text-student-name">{user.studentName || "Not set"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Grade Level</p>
                  <p className="font-medium" data-testid="text-grade-level">{user.gradeLevel || "Not set"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Subscription Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Plan</p>
                  <Badge 
                    variant={user.subscriptionStatus === "active" ? "default" : "secondary"}
                    className="mt-1"
                    data-testid="badge-subscription-plan"
                  >
                    {user.subscriptionPlan || "None"}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge 
                    variant={user.subscriptionStatus === "active" ? "default" : "outline"}
                    className="mt-1"
                    data-testid="badge-subscription-status"
                  >
                    {user.subscriptionStatus || "Inactive"}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monthly Minutes</p>
                  <p className="font-medium" data-testid="text-monthly-minutes">
                    {user.subscriptionMinutesUsed || 0} / {user.subscriptionMinutesLimit || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Purchased Minutes</p>
                  <p className="font-medium" data-testid="text-purchased-minutes">
                    {user.purchasedMinutesBalance || 0}
                  </p>
                </div>
                {user.stripeCustomerId && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Stripe Customer ID</p>
                    <p className="font-mono text-xs" data-testid="text-stripe-customer-id">
                      {user.stripeCustomerId}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Recent Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentSessions.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No sessions yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold">Student</th>
                      <th className="text-left p-3 font-semibold">Subject</th>
                      <th className="text-left p-3 font-semibold">Age Group</th>
                      <th className="text-left p-3 font-semibold">Minutes</th>
                      <th className="text-left p-3 font-semibold">Date</th>
                      <th className="text-left p-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSessions.map((session) => (
                      <tr key={session.id} className="border-b hover:bg-muted/50" data-testid={`row-session-${session.id}`}>
                        <td className="p-3">{session.studentName || "Unknown"}</td>
                        <td className="p-3 capitalize">{session.subject || "N/A"}</td>
                        <td className="p-3">{session.ageGroup || "N/A"}</td>
                        <td className="p-3">{session.minutesUsed || 0}</td>
                        <td className="p-3">
                          {formatChicagoDate(session.startedAt)}
                        </td>
                        <td className="p-3">
                          <Badge variant={session.status === "ended" ? "default" : "secondary"}>
                            {session.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {documents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Uploaded Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div 
                    key={doc.id} 
                    className="flex items-center justify-between p-3 rounded-lg border"
                    data-testid={`row-document-${doc.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span>{doc.fileName}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatChicagoDate(doc.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Cancel Subscription
            </DialogTitle>
            <DialogDescription>
              Cancel the subscription for {user.email}. This will update Stripe and the database.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Cancellation Type</Label>
              <Select value={cancelOption} onValueChange={(v) => setCancelOption(v as 'immediate' | 'period_end')}>
                <SelectTrigger data-testid="select-cancel-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">Cancel Immediately</SelectItem>
                  <SelectItem value="period_end">Cancel at Period End</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {cancelOption === 'immediate' 
                  ? 'Subscription ends immediately. User loses access right away.'
                  : 'User keeps access until the end of their current billing period.'}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => cancelSubscriptionMutation.mutate(cancelOption === 'immediate')}
              disabled={cancelSubscriptionMutation.isPending}
              data-testid="button-confirm-cancel-subscription"
            >
              {cancelSubscriptionMutation.isPending ? 'Canceling...' : 'Confirm Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              This action will soft-delete the account for {user.email}. 
              The subscription will be canceled and the user will be disabled.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Type DELETE to confirm</Label>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                data-testid="input-delete-confirm"
              />
            </div>

            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Why is this account being deleted?"
                data-testid="input-delete-reason"
              />
            </div>

            <div className="space-y-3 p-3 rounded-lg border">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="purge-data" 
                  checked={purgeData} 
                  onCheckedChange={(checked) => setPurgeData(!!checked)}
                  data-testid="checkbox-purge-data"
                />
                <Label htmlFor="purge-data" className="text-sm">
                  Purge user documents and transcripts
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                Permanently delete all documents, session transcripts, and embeddings.
                By default, these are kept for audit purposes.
              </p>
            </div>

            <div className="space-y-3 p-3 rounded-lg border">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="test-account" 
                  checked={isTestAccount} 
                  onCheckedChange={(checked) => {
                    setIsTestAccount(!!checked);
                    if (!checked) setDeleteStripeCustomer(false);
                  }}
                  data-testid="checkbox-test-account"
                />
                <Label htmlFor="test-account" className="text-sm">
                  This is a test account
                </Label>
              </div>
              
              {isTestAccount && (
                <div className="ml-6 space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="delete-stripe" 
                      checked={deleteStripeCustomer} 
                      onCheckedChange={(checked) => setDeleteStripeCustomer(!!checked)}
                      data-testid="checkbox-delete-stripe"
                    />
                    <Label htmlFor="delete-stripe" className="text-sm text-orange-600">
                      Also delete Stripe customer
                    </Label>
                  </div>
                  <p className="text-xs text-orange-600">
                    WARNING: Only use for test accounts! This permanently removes the customer from Stripe.
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDeleteModal(false);
              setDeleteConfirmText('');
              setDeleteReason('');
              setPurgeData(false);
              setIsTestAccount(false);
              setDeleteStripeCustomer(false);
            }}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteAccountMutation.mutate()}
              disabled={deleteConfirmText !== 'DELETE' || deleteAccountMutation.isPending}
              data-testid="button-confirm-delete-account"
            >
              {deleteAccountMutation.isPending ? 'Deleting...' : 'Delete Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
