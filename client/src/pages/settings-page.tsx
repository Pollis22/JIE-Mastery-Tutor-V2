import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { NavigationHeader } from "@/components/navigation-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AudioSettings } from "@/components/AudioSettings";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getPlanDetails } from "@shared/plan-config";

const settingsSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email("Please enter a valid email"),
  preferredLanguage: z.string(),
  voiceStyle: z.string(),
  speechSpeed: z.string(),
  volumeLevel: z.number().min(0).max(100),
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

  const { data: dashboard, isLoading: isDashboardLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    enabled: !!user,
  });

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      preferredLanguage: "english",
      voiceStyle: "cheerful",
      speechSpeed: "1.0",
      volumeLevel: 75,
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
        voiceStyle: user.voiceStyle || "cheerful",
        speechSpeed: user.speechSpeed || "1.0",
        volumeLevel: user.volumeLevel ?? 75,
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
      voiceStyle: user?.voiceStyle || "cheerful",
      speechSpeed: user?.speechSpeed || "1.0",
      volumeLevel: user?.volumeLevel ?? 75,
      marketingOptIn: user?.marketingOptIn ?? false,
    });
    toast({
      title: "Form reset",
      description: "Settings have been reset to your saved values.",
    });
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

              {/* Voice & Audio Settings */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Voice & Audio Preferences</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="voiceStyle"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Voice Style</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="grid grid-cols-1 md:grid-cols-3 gap-3"
                          >
                            <div className={`border rounded-lg p-4 cursor-pointer transition-colors ${field.value === 'cheerful' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                              <div className="flex items-center space-x-3">
                                <RadioGroupItem value="cheerful" id="cheerful" data-testid="radio-voice-cheerful" />
                                <div>
                                  <label htmlFor="cheerful" className="font-medium text-foreground cursor-pointer">
                                    Cheerful
                                  </label>
                                  <p className="text-sm text-muted-foreground">Upbeat and encouraging</p>
                                </div>
                              </div>
                            </div>
                            
                            <div className={`border rounded-lg p-4 cursor-pointer transition-colors ${field.value === 'empathetic' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                              <div className="flex items-center space-x-3">
                                <RadioGroupItem value="empathetic" id="empathetic" data-testid="radio-voice-empathetic" />
                                <div>
                                  <label htmlFor="empathetic" className="font-medium text-foreground cursor-pointer">
                                    Empathetic
                                  </label>
                                  <p className="text-sm text-muted-foreground">Understanding and patient</p>
                                </div>
                              </div>
                            </div>
                            
                            <div className={`border rounded-lg p-4 cursor-pointer transition-colors ${field.value === 'professional' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                              <div className="flex items-center space-x-3">
                                <RadioGroupItem value="professional" id="professional" data-testid="radio-voice-professional" />
                                <div>
                                  <label htmlFor="professional" className="font-medium text-foreground cursor-pointer">
                                    Professional
                                  </label>
                                  <p className="text-sm text-muted-foreground">Clear and focused</p>
                                </div>
                              </div>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="speechSpeed"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Speech Speed</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <Slider
                                min={0.7}
                                max={1.2}
                                step={0.05}
                                value={[parseFloat(field.value)]}
                                onValueChange={([value]) => field.onChange(value.toString())}
                                data-testid="slider-speech-speed"
                              />
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Slow (0.7x)</span>
                                <span>Normal (1.0x)</span>
                                <span>Fast (1.2x)</span>
                              </div>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="volumeLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Volume Level</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <Slider
                                min={0}
                                max={100}
                                step={1}
                                value={[field.value]}
                                onValueChange={([value]) => field.onChange(value)}
                                data-testid="slider-volume"
                              />
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Quiet</span>
                                <span>Medium</span>
                                <span>Loud</span>
                              </div>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Email Preferences */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Email Preferences</CardTitle>
                </CardHeader>
                <CardContent>
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
        </div>
      </div>
    </div>
  );
}
