import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { NavigationHeader } from "@/components/navigation-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AudioSettings } from "@/components/AudioSettings";
import { SecuritySettings } from "@/components/SecuritySettings";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getPlanDetails } from "@shared/plan-config";
import { Mail } from "lucide-react";

type EmailFrequency = 'off' | 'per_session' | 'daily' | 'weekly';

const settingsSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email("Please enter a valid email"),
  preferredLanguage: z.string(),
  marketingOptIn: z.boolean(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

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

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [emailFrequency, setEmailFrequency] = useState<EmailFrequency>('daily');
  const [savingEmailPrefs, setSavingEmailPrefs] = useState(false);

  const { data: dashboard, isLoading: isDashboardLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    enabled: !!user,
  });

  const { data: emailPrefs, isLoading: isEmailPrefsLoading } = useQuery<{ emailSummaryFrequency: EmailFrequency }>({
    queryKey: ["/api/user/email-summary-preferences"],
    enabled: !!user,
  });

  useEffect(() => {
    if (emailPrefs?.emailSummaryFrequency) {
      setEmailFrequency(emailPrefs.emailSummaryFrequency);
    }
  }, [emailPrefs]);

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      preferredLanguage: "english",
      marketingOptIn: false,
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        preferredLanguage: user.preferredLanguage || "english",
        marketingOptIn: user.marketingOptIn ?? false,
      });
    }
  }, [user, form]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: SettingsForm) => {
      const response = await apiRequest("PUT", "/api/settings", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({
        title: "Settings updated",
        description: "Your preferences have been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating settings",
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

  const handleSaveSettings = (data: SettingsForm) => {
    updateSettingsMutation.mutate(data);
  };

  const handleManageSubscription = () => {
    createPortalSessionMutation.mutate();
  };

  const handleResetSettings = () => {
    form.reset({
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      email: user?.email || "",
      preferredLanguage: user?.preferredLanguage || "english",
      marketingOptIn: user?.marketingOptIn ?? false,
    });
    toast({
      title: "Form reset",
      description: "Settings have been reset to your saved values.",
    });
  };

  const handleSaveEmailPreferences = async () => {
    setSavingEmailPrefs(true);
    try {
      const res = await apiRequest("PATCH", "/api/user/email-summary-preferences", {
        emailSummaryFrequency: emailFrequency,
      });
      
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/user/email-summary-preferences"] });
        toast({ 
          title: "Email preferences saved",
          description: "Your email notification preferences have been updated.",
        });
      } else {
        const data = await res.json();
        toast({ 
          title: "Error saving preferences", 
          description: data.message || "Something went wrong",
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      toast({ 
        title: "Error saving preferences", 
        description: error.message || "Something went wrong",
        variant: "destructive" 
      });
    } finally {
      setSavingEmailPrefs(false);
    }
  };

  const planDetails = getPlanDetails(user?.subscriptionPlan);
  const displayName = dashboard?.user?.name || 
    `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 
    user?.username || 
    'User';

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-8">
          
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-settings-title">
              Settings
            </h1>
            <p className="text-muted-foreground">Manage your account, subscription, and preferences</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSaveSettings)} className="space-y-8">
              
              {/* Account Settings */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Account Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-firstname" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-lastname" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="preferredLanguage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preferred Language</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-language">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="english">English</SelectItem>
                            <SelectItem value="spanish">Spanish</SelectItem>
                            <SelectItem value="both">Both English and Spanish</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Subscription Settings */}
              <Card className="shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Subscription</CardTitle>
                    {isDashboardLoading ? (
                      <Skeleton className="h-6 w-24" />
                    ) : (
                      <Badge variant="secondary" className="bg-secondary/10 text-secondary" data-testid="badge-subscription-plan">
                        {dashboard?.user?.plan || planDetails.name}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-border">
                    <div>
                      <p className="font-medium text-foreground">Current Plan</p>
                      {isDashboardLoading ? (
                        <Skeleton className="h-4 w-32 mt-1" />
                      ) : (
                        <p className="text-sm text-muted-foreground" data-testid="text-plan-minutes">
                          {planDetails.minutes.toLocaleString()} minutes per month
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {isDashboardLoading ? (
                        <>
                          <Skeleton className="h-5 w-20" />
                          <Skeleton className="h-4 w-12 mt-1" />
                        </>
                      ) : (
                        <>
                          <p className="font-semibold text-foreground" data-testid="text-plan-price">
                            ${planDetails.price}/month
                          </p>
                          <p className="text-sm text-muted-foreground" data-testid="text-subscription-status">
                            {user?.subscriptionStatus === 'active' ? 'Active' : 
                             user?.subscriptionStatus === 'canceled' ? 'Canceled' : 
                             user?.subscriptionStatus === 'paused' ? 'Paused' : 'Active'}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Usage Display */}
                  <div className="py-3 border-b border-border">
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-medium text-foreground">Usage This Month</p>
                      {isDashboardLoading ? (
                        <Skeleton className="h-4 w-24" />
                      ) : (
                        <p className="text-sm text-muted-foreground" data-testid="text-usage-display">
                          {dashboard?.usage?.voiceMinutes || '0 / 60 min'}
                        </p>
                      )}
                    </div>
                    {!isDashboardLoading && dashboard?.usage?.percentage !== undefined && (
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all" 
                          style={{ width: `${Math.min(dashboard.usage.percentage, 100)}%` }}
                          data-testid="progress-usage"
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex space-x-3">
                    <Button 
                      type="button"
                      onClick={handleManageSubscription}
                      disabled={createPortalSessionMutation.isPending}
                      data-testid="button-manage-subscription"
                    >
                      {createPortalSessionMutation.isPending ? "Opening..." : "Manage Subscription"}
                    </Button>
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={() => window.location.href = '/subscribe'}
                      data-testid="button-change-plan"
                    >
                      Change Plan
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Audio Device Settings */}
              <AudioSettings />

              {/* Email Preferences */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Email Preferences
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Learning Session Summaries */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-base font-medium">Learning Session Summaries</h4>
                      <p className="text-sm text-muted-foreground">
                        Choose how often you receive email summaries of your child's tutoring sessions
                      </p>
                    </div>
                    
                    {isEmailPrefsLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                      </div>
                    ) : (
                      <RadioGroup 
                        value={emailFrequency} 
                        onValueChange={(v) => setEmailFrequency(v as EmailFrequency)}
                        className="space-y-3"
                      >
                        <div className={`flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors ${emailFrequency === 'off' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                          <RadioGroupItem value="off" id="email-off" data-testid="radio-email-off" />
                          <Label htmlFor="email-off" className="cursor-pointer flex-1">
                            <span className="font-medium">Off</span>
                            <span className="block text-sm text-muted-foreground">No email summaries</span>
                          </Label>
                        </div>
                        
                        <div className={`flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors ${emailFrequency === 'per_session' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                          <RadioGroupItem value="per_session" id="email-per-session" data-testid="radio-email-per-session" />
                          <Label htmlFor="email-per-session" className="cursor-pointer flex-1">
                            <span className="font-medium">Per Session</span>
                            <span className="block text-sm text-muted-foreground">Email after each tutoring session</span>
                          </Label>
                        </div>
                        
                        <div className={`flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors ${emailFrequency === 'daily' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                          <RadioGroupItem value="daily" id="email-daily" data-testid="radio-email-daily" />
                          <Label htmlFor="email-daily" className="cursor-pointer flex-1">
                            <span className="font-medium">Daily Digest</span>
                            <span className="block text-sm text-muted-foreground">One email at 8 PM with all sessions (Recommended)</span>
                          </Label>
                        </div>
                        
                        <div className={`flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors ${emailFrequency === 'weekly' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                          <RadioGroupItem value="weekly" id="email-weekly" data-testid="radio-email-weekly" />
                          <Label htmlFor="email-weekly" className="cursor-pointer flex-1">
                            <span className="font-medium">Weekly Digest</span>
                            <span className="block text-sm text-muted-foreground">One email on Sundays with all sessions from the week</span>
                          </Label>
                        </div>
                      </RadioGroup>
                    )}
                    
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-sm text-muted-foreground">
                        Summaries are sent to: <span className="font-medium text-foreground">{user?.email}</span>
                      </p>
                      <Button 
                        type="button"
                        onClick={handleSaveEmailPreferences}
                        disabled={savingEmailPrefs || isEmailPrefsLoading}
                        data-testid="button-save-email-preferences"
                      >
                        {savingEmailPrefs ? "Saving..." : "Save Preferences"}
                      </Button>
                    </div>
                  </div>
                  
                  <div className="border-t pt-4">
                    <FormField
                      control={form.control}
                      name="marketingOptIn"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              Marketing Communications
                            </FormLabel>
                            <FormDescription>
                              Receive updates about new features, learning tips, and special offers
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-marketing-opt-in"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Save Actions */}
              <div className="flex justify-end space-x-3">
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={handleResetSettings}
                  data-testid="button-reset-settings"
                >
                  Reset to Defaults
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateSettingsMutation.isPending}
                  data-testid="button-save-settings"
                >
                  {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>

          {/* Security Settings - placed outside main form to prevent nested form issues */}
          <SecuritySettings />
        </div>
      </div>
    </div>
  );
}
