import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { 
  User, 
  CreditCard, 
  Settings, 
  BookOpen, 
  BarChart3, 
  HelpCircle, 
  LogOut,
  Home,
  Bell,
  Shield,
  Languages,
  Palette,
  Mail,
  Phone,
  MessageCircle,
  Download,
  Trash2,
  ChevronRight,
  Clock,
  TrendingUp,
  Calendar,
  Volume2,
  Mic,
  UserCog,
  FileText,
  GraduationCap
} from "lucide-react";
import AccountSettings from "@/components/dashboard/account-settings";
import SubscriptionManager from "@/components/dashboard/subscription-manager";
import PaymentMethods from "@/components/dashboard/payment-methods";
import ThemeToggle from "@/components/dashboard/theme-toggle";
import LanguageSelector from "@/components/dashboard/language-selector";
import SessionHistory from "@/components/dashboard/session-history";
import UsageAnalytics from "@/components/dashboard/usage-analytics";
import SupportCenter from "@/components/dashboard/support-center";
import NewsletterSubscribe from "@/components/dashboard/newsletter-subscribe";
import { AssignmentsPanel } from "@/components/AssignmentsPanel";
import { PracticeLessonsSection } from "@/components/dashboard/practice-lessons-section";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

export default function DashboardPage() {
  const { user, logoutMutation } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");

  // Debug: Track activeTab state changes
  useEffect(() => {
    console.log('[Dashboard] activeTab state is now:', activeTab);
  }, [activeTab]);

  // Meta Pixel & Google Ads: Track subscription purchase/upgrade on successful checkout redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const subscriptionSuccess = params.get('subscription');
    const plan = params.get('plan');
    
    // Only track if we have confirmed payment indicators from Stripe
    const hasPaymentConfirmation = sessionId || subscriptionSuccess === 'success' || subscriptionSuccess === 'reactivated';
    
    if (hasPaymentConfirmation && typeof window !== 'undefined') {
      // Determine value based on plan (matches pricing page)
      const planPrices: Record<string, number> = {
        'starter': 19.99,
        'standard': 59.99,
        'pro': 99.99,
        'elite': 199.99
      };
      const value = plan ? planPrices[plan] || 59.99 : 59.99; // Default to standard
      
      // Create unique conversion key to prevent duplicate firing
      const conversionKey = `gads_conversion_${sessionId || 'upgrade_' + Date.now()}`;
      
      // Meta Pixel tracking
      if ((window as any).fbq) {
        (window as any).fbq('track', 'Purchase', {
          value: value,
          currency: 'USD',
          content_name: plan ? `${plan} subscription` : 'subscription',
          content_type: 'subscription'
        });
        console.log('[Meta Pixel] Purchase event tracked for subscription');
      }
      
      // Google Ads: Track subscription conversion ONLY after Stripe confirms payment
      // Uses sessionStorage to prevent duplicate firing on page refresh
      if ((window as any).gtag && !sessionStorage.getItem(conversionKey)) {
        (window as any).gtag('event', 'conversion', {
          'send_to': 'AW-17252974185/JIE_Subscription',
          'value': value,
          'currency': 'USD',
          'transaction_id': sessionId || `upgrade_${user?.id}_${Date.now()}` // Unique transaction ID
        });
        // Mark this conversion as fired to prevent duplicates
        sessionStorage.setItem(conversionKey, 'true');
        console.log('[Google Ads] JIE – Subscription conversion tracked, value:', value);
      }
      
      // Clean up URL params after tracking (prevent duplicate tracking on refresh)
      if (sessionId || subscriptionSuccess) {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [user?.id]);

  // Fetch voice balance
  const { data: voiceBalance } = useQuery<{
    subscriptionMinutes: number;
    subscriptionLimit: number;
    purchasedMinutes: number;
    totalAvailable: number;
    resetDate: string;
    total: number;
    used: number;
    remaining: number;
    bonusMinutes: number;
  }>({
    queryKey: ['/api/voice-balance'],
    enabled: !!user,
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache after component unmount
    refetchInterval: 30000, // Poll every 30 seconds for cross-device consistency
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    refetchOnMount: true, // Always refetch on component mount
  });

  // Fetch dashboard statistics
  const { data: stats } = useQuery<{
    totalSessions: number;
    weeklyMinutes: number;
  }>({
    queryKey: ['/api/dashboard/stats'],
    enabled: !!user,
  });

  // Fetch user preferences for notifications
  const { data: preferences } = useQuery<{
    emailNotifications: boolean;
    marketingEmails: boolean;
  }>({
    queryKey: ['/api/user/preferences'],
    enabled: !!user,
  });

  // Mutation to update notification preferences
  const updateNotificationsMutation = useMutation({
    mutationFn: async (data: { emailNotifications?: boolean; marketingEmails?: boolean }) => {
      const res = await apiRequest('PATCH', '/api/user/preferences', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/preferences'] });
    },
  });

  const handleLogout = async () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        setLocation("/auth");
      }
    });
  };

  const sidebarItems = [
    { id: "overview", label: "Overview", icon: Home },
    { id: "support-live", label: "Live Support", icon: User, onClick: () => setLocation("/support") },
    { id: "account", label: "Account Settings", icon: User },
    { id: "subscription", label: "Subscription", icon: CreditCard },
    { id: "payments", label: "Payment Methods", icon: Shield },
    { id: "documents", label: "Study Materials", icon: FileText },
    { id: "sessions", label: "Transcripts", icon: BookOpen },
    { id: "analytics", label: "Usage Analytics", icon: BarChart3 },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "preferences", label: "Preferences", icon: Settings },
    { id: "support", label: "Support & Help", icon: HelpCircle },
  ];

  // Add Admin link for admin users
  if (user?.isAdmin) {
    sidebarItems.splice(1, 0, { id: "admin", label: "Admin Dashboard", icon: UserCog });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation Bar */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/")}
                className="flex items-center gap-2"
              >
                <Home className="h-4 w-4" />
                Back to Tutor
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <h1 className="text-2xl font-bold">Dashboard</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <LanguageSelector variant="nav" />
              <ThemeToggle />
              <Button variant="ghost" size="icon">
                <Bell className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="md:col-span-1">
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{[user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || 'User'}</h3>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-1">
                    {sidebarItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Button
                          key={item.id}
                          variant={activeTab === item.id ? "secondary" : "ghost"}
                          className="w-full justify-start"
                          data-testid={`sidebar-${item.id}`}
                          onClick={() => {
                            console.log(`[Sidebar] Clicked: ${item.id}`);
                            if (item.onClick) {
                              item.onClick();
                            } else if (item.id === "admin") {
                              setLocation("/admin");
                            } else if (item.id === "settings") {
                              setLocation("/settings");
                            } else {
                              console.log(`[Sidebar] Setting activeTab to: ${item.id}`);
                              setActiveTab(item.id);
                            }
                          }}
                        >
                          <Icon className="mr-2 h-4 w-4" />
                          {item.label}
                        </Button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Quick Stats Card */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Voice Minutes</span>
                  <span className="text-sm font-semibold">
                    {voiceBalance?.used || 0}/{voiceBalance?.total || 0}
                  </span>
                </div>
                <Progress 
                  value={(voiceBalance?.used || 0) / (voiceBalance?.total || 1) * 100} 
                  className="h-2"
                />
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Plan</span>
                  <Badge variant="default">
                    {user?.subscriptionPlan || "Free"}
                  </Badge>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={user?.subscriptionStatus === 'active' ? 'default' : 'secondary'}>
                    {user?.subscriptionStatus || "Inactive"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Area */}
          <div className="md:col-span-3" data-testid="main-content-area">
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Welcome Card */}
                <Card>
                  <CardHeader>
                    <CardTitle>Welcome back, {user?.firstName || user?.username || 'User'}!</CardTitle>
                    <CardDescription>
                      Upload your homework, notes, or study materials and start a tutoring session
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center space-x-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Total Sessions</span>
                          </div>
                          <p className="text-2xl font-bold mt-2">{stats?.totalSessions || 0}</p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center space-x-2">
                            <Volume2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Minutes Used</span>
                          </div>
                          <p className="text-2xl font-bold mt-2">{voiceBalance?.used || 0}</p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center space-x-2">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">This Week</span>
                          </div>
                          <p className="text-2xl font-bold mt-2">{stats?.weeklyMinutes || 0} min</p>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>

                {/* Practice Lessons Quick Action */}
                <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <GraduationCap className="h-5 w-5 text-primary" />
                      Practice Lessons
                    </CardTitle>
                    <CardDescription>
                      Browse our structured curriculum with guided lessons for every subject
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Explore Kindergarten through 12th grade lessons in Math, English, and Spanish
                      </div>
                      <Button
                        onClick={() => setLocation('/practice-lessons')}
                        data-testid="button-browse-lessons"
                      >
                        <BookOpen className="h-4 w-4 mr-2" />
                        Browse Lessons
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Recent Sessions Preview */}
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Transcripts</CardTitle>
                    <CardDescription>Your last 5 tutoring sessions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SessionHistory limit={5} />
                    <Button 
                      variant="link" 
                      className="mt-4 p-0"
                      onClick={() => setActiveTab("sessions")}
                    >
                      View all sessions
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>

                {/* Newsletter Subscription */}
                <NewsletterSubscribe />
              </div>
            )}

            {activeTab === "account" && <AccountSettings />}
            {activeTab === "subscription" && <SubscriptionManager />}
            {activeTab === "payments" && <PaymentMethods />}
            {activeTab === "documents" && (
              <Card>
                <CardHeader>
                  <CardTitle>Study Materials</CardTitle>
                  <CardDescription>
                    Upload your own materials or browse our practice lessons curriculum
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="practice" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                      <TabsTrigger value="practice" data-testid="tab-practice-lessons">
                        <GraduationCap className="h-4 w-4 mr-2" />
                        Practice Lessons
                      </TabsTrigger>
                      <TabsTrigger value="uploads" data-testid="tab-your-documents">
                        <FileText className="h-4 w-4 mr-2" />
                        Your Documents
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="practice">
                      <PracticeLessonsSection />
                    </TabsContent>
                    
                    <TabsContent value="uploads">
                      <AssignmentsPanel 
                        userId={user?.id || ''}
                        selectedDocumentIds={[]}
                      />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
            {activeTab === "sessions" && <SessionHistory />}
            {activeTab === "analytics" && <UsageAnalytics />}
            {activeTab === "preferences" && (
              <Card>
                <CardHeader>
                  <CardTitle>Preferences</CardTitle>
                  <CardDescription>Customize your learning experience</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="appearance">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="appearance">Appearance</TabsTrigger>
                      <TabsTrigger value="notifications">Notifications</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="appearance" className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Theme</h4>
                          <p className="text-sm text-muted-foreground">
                            Choose between light and dark mode
                          </p>
                        </div>
                        <ThemeToggle showLabel />
                      </div>
                    </TabsContent>

                    <TabsContent value="notifications" className="space-y-4">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                          <div>
                            <h4 className="font-medium">Email Notifications</h4>
                            <p className="text-sm text-muted-foreground">
                              Receive updates about your tutoring sessions
                            </p>
                          </div>
                          <Switch
                            checked={preferences?.emailNotifications ?? true}
                            onCheckedChange={(checked) => 
                              updateNotificationsMutation.mutate({ emailNotifications: checked })
                            }
                            disabled={updateNotificationsMutation.isPending}
                            data-testid="switch-email-notifications"
                          />
                        </div>
                        
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                          <div>
                            <h4 className="font-medium">Marketing Emails</h4>
                            <p className="text-sm text-muted-foreground">
                              Receive newsletters and promotional offers
                            </p>
                          </div>
                          <Switch
                            checked={preferences?.marketingEmails ?? false}
                            onCheckedChange={(checked) => 
                              updateNotificationsMutation.mutate({ marketingEmails: checked })
                            }
                            disabled={updateNotificationsMutation.isPending}
                            data-testid="switch-marketing-emails"
                          />
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
            
            {activeTab === "support" && <SupportCenter />}
          </div>
        </div>
      </div>
    </div>
  );
}