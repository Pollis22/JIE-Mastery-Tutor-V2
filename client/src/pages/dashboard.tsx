import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  UserCog
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
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

export default function DashboardPage() {
  const { user, logoutMutation } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");

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
  });

  // Fetch dashboard statistics
  const { data: stats } = useQuery<{
    totalSessions: number;
    weeklyMinutes: number;
  }>({
    queryKey: ['/api/dashboard/stats'],
    enabled: !!user,
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
    { id: "account", label: "Account Settings", icon: User },
    { id: "subscription", label: "Subscription", icon: CreditCard },
    { id: "payments", label: "Payment Methods", icon: Shield },
    { id: "sessions", label: "Learning Sessions", icon: BookOpen },
    { id: "analytics", label: "Usage Analytics", icon: BarChart3 },
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{user?.studentName || user?.firstName}</h3>
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
                          onClick={() => {
                            if (item.id === "admin") {
                              setLocation("/admin");
                            } else {
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
          <div className="lg:col-span-3">
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Welcome Card */}
                <Card>
                  <CardHeader>
                    <CardTitle>Welcome back, {user?.studentName || user?.firstName}!</CardTitle>
                    <CardDescription>
                      Here's your learning progress and account overview
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

                {/* Recent Sessions Preview */}
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Learning Sessions</CardTitle>
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
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="appearance">Appearance</TabsTrigger>
                      <TabsTrigger value="language">Language</TabsTrigger>
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

                    <TabsContent value="language" className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Interface Language</h4>
                          <p className="text-sm text-muted-foreground">
                            Select your preferred language for the interface
                          </p>
                        </div>
                        <LanguageSelector />
                      </div>
                      
                      <Separator />
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Voice Language</h4>
                          <p className="text-sm text-muted-foreground">
                            Select your preferred language for voice tutoring
                          </p>
                        </div>
                        <LanguageSelector type="voice" />
                      </div>
                    </TabsContent>

                    <TabsContent value="notifications" className="space-y-4">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">Email Notifications</h4>
                            <p className="text-sm text-muted-foreground">
                              Receive updates about your learning progress
                            </p>
                          </div>
                          <Button variant="outline" size="sm">Configure</Button>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">Marketing Emails</h4>
                            <p className="text-sm text-muted-foreground">
                              Receive newsletters and promotional offers
                            </p>
                          </div>
                          <Button variant="outline" size="sm">
                            {user?.marketingOptIn ? "Unsubscribe" : "Subscribe"}
                          </Button>
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