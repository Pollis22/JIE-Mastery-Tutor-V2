import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CreditCard } from "lucide-react";

interface RequireSubscriptionProps {
  children: React.ReactNode;
}

export function RequireSubscription({ children }: RequireSubscriptionProps) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // If user is not logged in, redirect to auth
    if (!isLoading && !user) {
      setLocation("/auth");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Check if user has active subscription
  const hasActiveSubscription = user?.subscriptionStatus === 'active' && 
                                user?.subscriptionPlan && 
                                (user?.subscriptionMinutesLimit || 0) > 0;

  if (!hasActiveSubscription) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-6 w-6 text-amber-500" />
              <CardTitle>Subscription Required</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              {user?.subscriptionStatus === 'pending' 
                ? "Your account is created but you need to select a subscription plan to access the tutoring features."
                : "You need an active subscription to access this feature."}
            </p>
            
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Why payment is required:</strong> JIE Mastery Tutor uses advanced AI technology 
                that requires significant computational resources for each tutoring session.
              </p>
            </div>

            <div className="space-y-2">
              <Button 
                onClick={() => setLocation("/pricing")}
                className="w-full"
                data-testid="button-choose-plan"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Choose a Subscription Plan
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => setLocation("/")}
                className="w-full"
                data-testid="button-back-home"
              >
                Back to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}