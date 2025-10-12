import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { 
  CreditCard, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  Clock,
  Zap,
  CheckCircle,
  XCircle,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw
} from "lucide-react";

const plans = [
  {
    id: "starter",
    name: "Starter",
    price: "$19.99",
    minutes: 60,
    features: [
      "60 voice minutes per month",
      "All subjects included",
      "Personalized tutoring",
      "Progress tracking"
    ]
  },
  {
    id: "standard",
    name: "Standard",
    price: "$59.99",
    minutes: 240,
    features: [
      "240 voice minutes per month",
      "All subjects included",
      "Personalized tutoring",
      "Priority support",
      "Advanced analytics"
    ],
    popular: true
  },
  {
    id: "pro",
    name: "Pro",
    price: "$99.99",
    minutes: 600,
    features: [
      "600 voice minutes per month",
      "All subjects included",
      "Personalized tutoring",
      "Priority support",
      "Advanced analytics",
      "Custom learning paths"
    ]
  }
];

export default function SubscriptionManager() {
  const { user, refetch } = useAuth();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  // Fetch billing history
  const { data: billingHistory } = useQuery({
    queryKey: ['/api/billing/history'],
    enabled: !!user
  });

  // Upgrade/Downgrade mutation
  const changePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const response = await apiRequest("POST", "/api/subscription/change", { plan: planId });
      if (!response.ok) throw new Error("Failed to change plan");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: "Success",
          description: "Subscription updated successfully",
        });
        refetch();
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update subscription",
        variant: "destructive",
      });
    }
  });

  // Cancel subscription mutation
  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/subscription/cancel");
      if (!response.ok) throw new Error("Failed to cancel subscription");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Subscription cancelled",
        description: "Your subscription will remain active until the end of the billing period",
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel subscription",
        variant: "destructive",
      });
    }
  });

  // Buy additional minutes mutation
  const buyMinutesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/checkout/buy-minutes", {
        minutePackage: "60"
      });
      if (!response.ok) throw new Error("Failed to initiate checkout");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to buy minutes",
        variant: "destructive",
      });
    }
  });

  const currentPlan = plans.find(p => p.id === user?.subscriptionPlan);
  const usagePercentage = ((user?.monthlyVoiceMinutesUsed || 0) / (user?.monthlyVoiceMinutes || 1)) * 100;

  return (
    <div className="space-y-6">
      {/* Current Subscription */}
      <Card>
        <CardHeader>
          <CardTitle>Current Subscription</CardTitle>
          <CardDescription>Manage your subscription and voice minutes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Plan Details */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  {currentPlan?.name || "Free"} Plan
                </h3>
                <p className="text-sm text-muted-foreground">
                  {currentPlan ? `${currentPlan.price}/month` : "No active subscription"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={user?.subscriptionStatus === 'active' ? 'default' : 'secondary'}>
                  {user?.subscriptionStatus || "Inactive"}
                </Badge>
                {user?.subscriptionStatus === 'active' && user?.monthlyResetDate && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Renews {format(new Date(user.monthlyResetDate), 'MMM dd')}
                  </Badge>
                )}
              </div>
            </div>

            {/* Usage Stats */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Voice Minutes Used</span>
                <span className="text-sm">
                  {user?.monthlyVoiceMinutesUsed || 0} / {user?.monthlyVoiceMinutes || 0} minutes
                </span>
              </div>
              <Progress value={usagePercentage} className="h-3" />
              
              {user?.bonusMinutes && user.bonusMinutes > 0 && (
                <Alert>
                  <Zap className="h-4 w-4" />
                  <AlertDescription>
                    You have {user.bonusMinutes} bonus minutes available!
                  </AlertDescription>
                </Alert>
              )}

              {usagePercentage > 80 && (
                <Alert variant="destructive">
                  <AlertDescription>
                    You've used {Math.round(usagePercentage)}% of your monthly minutes. 
                    Consider upgrading or purchasing additional minutes.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {user?.subscriptionStatus === 'active' ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => window.open('/api/stripe/portal', '_blank')}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Manage Billing
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => cancelSubscriptionMutation.mutate()}
                    disabled={cancelSubscriptionMutation.isPending}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancel Subscription
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => window.location.href = '/pricing'}
                >
                  <ArrowUpCircle className="mr-2 h-4 w-4" />
                  Subscribe Now
                </Button>
              )}
              
              <Button
                variant="secondary"
                onClick={() => buyMinutesMutation.mutate()}
                disabled={buyMinutesMutation.isPending}
              >
                <Zap className="mr-2 h-4 w-4" />
                Buy 60 Minutes ($19.99)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Available Plans */}
      <Card>
        <CardHeader>
          <CardTitle>Change Plan</CardTitle>
          <CardDescription>Upgrade or downgrade your subscription</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative p-4 border rounded-lg ${
                  plan.id === user?.subscriptionPlan 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border'
                } ${plan.popular ? 'ring-2 ring-primary' : ''}`}
              >
                {plan.popular && (
                  <Badge className="absolute -top-2 right-4">Most Popular</Badge>
                )}
                
                <h4 className="font-semibold text-lg">{plan.name}</h4>
                <p className="text-2xl font-bold mt-2">{plan.price}</p>
                <p className="text-sm text-muted-foreground">per month</p>
                
                <ul className="mt-4 space-y-2">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="w-full mt-4"
                  variant={plan.id === user?.subscriptionPlan ? "outline" : "default"}
                  disabled={plan.id === user?.subscriptionPlan || changePlanMutation.isPending}
                  onClick={() => changePlanMutation.mutate(plan.id)}
                >
                  {plan.id === user?.subscriptionPlan ? (
                    "Current Plan"
                  ) : plan.minutes > (user?.monthlyVoiceMinutes || 0) ? (
                    <>
                      <ArrowUpCircle className="mr-2 h-4 w-4" />
                      Upgrade
                    </>
                  ) : (
                    <>
                      <ArrowDownCircle className="mr-2 h-4 w-4" />
                      Downgrade
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Billing History */}
      {billingHistory && billingHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Billing History</CardTitle>
            <CardDescription>Your recent transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {billingHistory.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(item.date), 'MMM dd, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">${item.amount / 100}</p>
                    <Badge variant={item.status === 'paid' ? 'default' : 'secondary'} className="text-xs">
                      {item.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}