import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { NavigationHeader } from "@/components/navigation-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatChicagoDate } from "@/lib/date-utils";
import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Mail, Calendar, Shield, CreditCard, Clock } from "lucide-react";
import { getPlanDetails } from "@shared/plan-config";

interface DashboardData {
  user?: {
    name?: string;
    firstName?: string;
    initials?: string;
    plan?: string;
  };
  usage?: {
    voiceMinutes?: string;
    percentage?: number;
  };
}

function getInitials(firstName?: string | null, lastName?: string | null, username?: string | null): string {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  if (firstName) {
    return firstName.substring(0, 2).toUpperCase();
  }
  if (username) {
    return username.substring(0, 2).toUpperCase();
  }
  return 'U';
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const { data: dashboard, isLoading: isDashboardLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    enabled: !!user,
  });

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
    }
  }, [user]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string }) => {
      const response = await apiRequest("PUT", "/api/settings", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setIsEditing(false);
      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating profile",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createPortalSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/customer-portal");
      return await response.json();
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (error: Error) => {
      toast({
        title: "Error accessing customer portal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveProfile = () => {
    updateProfileMutation.mutate({ firstName, lastName });
  };

  const handleCancelEdit = () => {
    setFirstName(user?.firstName || "");
    setLastName(user?.lastName || "");
    setIsEditing(false);
  };

  const planDetails = getPlanDetails(user?.subscriptionPlan);
  const displayName = dashboard?.user?.name || 
    `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 
    user?.username || 
    'User';
  const initials = getInitials(user?.firstName, user?.lastName, user?.username);
  const memberSince = formatChicagoDate(user?.createdAt);

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-8">
          
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-profile-title">
              Profile
            </h1>
            <p className="text-muted-foreground">Manage your account information and subscription</p>
          </div>

          {/* Profile Card */}
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Account Information</CardTitle>
                {!isEditing ? (
                  <Button 
                    variant="outline" 
                    onClick={() => setIsEditing(true)}
                    data-testid="button-edit-profile"
                  >
                    Edit Profile
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={handleCancelEdit}
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSaveProfile}
                      disabled={updateProfileMutation.isPending}
                      data-testid="button-save-profile"
                    >
                      {updateProfileMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar and Name Section */}
              <div className="flex items-center gap-6">
                <Avatar className="h-24 w-24 text-2xl">
                  <AvatarImage src={undefined} alt={displayName} />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 space-y-4">
                  {isEditing ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Enter first name"
                          data-testid="input-profile-firstname"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Enter last name"
                          data-testid="input-profile-lastname"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-2xl font-semibold text-foreground" data-testid="text-profile-name">
                        {displayName}
                      </h2>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        <span data-testid="text-profile-email">{user?.email || 'No email'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <Separator />

              {/* Account Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span className="text-sm font-medium">Username</span>
                  </div>
                  <p className="text-foreground" data-testid="text-profile-username">
                    {user?.email || 'N/A'}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm font-medium">Member Since</span>
                  </div>
                  <p className="text-foreground" data-testid="text-profile-member-since">
                    {memberSince}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Shield className="h-4 w-4" />
                    <span className="text-sm font-medium">Account Status</span>
                  </div>
                  <Badge 
                    variant="secondary" 
                    className={user?.emailVerified ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}
                    data-testid="badge-email-verified"
                  >
                    {user?.emailVerified ? "Verified" : "Pending Verification"}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Shield className="h-4 w-4" />
                    <span className="text-sm font-medium">Role</span>
                  </div>
                  <Badge 
                    variant="secondary"
                    data-testid="badge-user-role"
                  >
                    {user?.isAdmin ? "Administrator" : "Member"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Subscription Card */}
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Subscription</CardTitle>
                  <CardDescription>Manage your subscription and billing</CardDescription>
                </div>
                {isDashboardLoading ? (
                  <Skeleton className="h-6 w-24" />
                ) : (
                  <Badge 
                    variant="secondary" 
                    className={`${planDetails.color} text-white`}
                    data-testid="badge-profile-plan"
                  >
                    {dashboard?.user?.plan || planDetails.name}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CreditCard className="h-4 w-4" />
                    <span className="text-sm font-medium">Monthly Price</span>
                  </div>
                  {isDashboardLoading ? (
                    <Skeleton className="h-6 w-20" />
                  ) : (
                    <p className="text-xl font-semibold text-foreground" data-testid="text-profile-price">
                      ${planDetails.price}/mo
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm font-medium">Minutes Included</span>
                  </div>
                  {isDashboardLoading ? (
                    <Skeleton className="h-6 w-20" />
                  ) : (
                    <p className="text-xl font-semibold text-foreground" data-testid="text-profile-minutes">
                      {planDetails.minutes.toLocaleString()}/mo
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm font-medium">Usage This Month</span>
                  </div>
                  {isDashboardLoading ? (
                    <Skeleton className="h-6 w-24" />
                  ) : (
                    <p className="text-xl font-semibold text-foreground" data-testid="text-profile-usage">
                      {dashboard?.usage?.voiceMinutes || '0 / 60 min'}
                    </p>
                  )}
                </div>
              </div>

              {/* Usage Progress */}
              {!isDashboardLoading && dashboard?.usage?.percentage !== undefined && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Minutes Used</span>
                    <span className="text-foreground font-medium">{dashboard.usage.percentage}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all" 
                      style={{ width: `${Math.min(dashboard.usage.percentage, 100)}%` }}
                      data-testid="progress-profile-usage"
                    />
                  </div>
                </div>
              )}

              <Separator />

              <div className="flex flex-wrap gap-3">
                <Button 
                  onClick={() => createPortalSessionMutation.mutate()}
                  disabled={createPortalSessionMutation.isPending}
                  data-testid="button-manage-billing"
                >
                  {createPortalSessionMutation.isPending ? "Opening..." : "Manage Billing"}
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => window.location.href = '/subscribe'}
                  data-testid="button-change-plan"
                >
                  Change Plan
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => window.location.href = '/settings'}
                  data-testid="button-go-to-settings"
                >
                  Account Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Security Card */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Manage your account security settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <p className="font-medium text-foreground">Password</p>
                  <p className="text-sm text-muted-foreground">
                    Change your account password
                  </p>
                </div>
                <Button 
                  variant="outline"
                  onClick={() => window.location.href = '/forgot-password'}
                  data-testid="button-change-password"
                >
                  Change Password
                </Button>
              </div>
              
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-foreground">Email Verification</p>
                  <p className="text-sm text-muted-foreground">
                    {user?.emailVerified 
                      ? "Your email address has been verified" 
                      : "Please verify your email address"}
                  </p>
                </div>
                <Badge 
                  variant="secondary" 
                  className={user?.emailVerified ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}
                >
                  {user?.emailVerified ? "Verified" : "Pending"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
