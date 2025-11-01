/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

interface VoiceBalance {
  subscriptionMinutes: number;
  subscriptionLimit: number;
  purchasedMinutes: number;
  totalAvailable: number;
  resetDate: string;
  subscriptionUsed: number;
  purchasedUsed: number;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  minutes: number;
  subtitle: string;
  features: string[];
  popular?: boolean;
}

const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter Family",
    price: "$19.99",
    minutes: 60,
    subtitle: "Perfect for small families",
    features: [
      "60 minutes shared by entire family",
      "Unlimited student profiles for siblings",
      "Math, English, Science, Spanish & More",
      "Each child gets personalized tutoring",
      "Real-time transcripts for parents"
    ]
  },
  {
    id: "standard",
    name: "Standard Family",
    price: "$59.99",
    minutes: 240,
    subtitle: "Great for active families",
    features: [
      "240 minutes shared by entire family",
      "Unlimited student profiles for siblings",
      "Math, English, Science, Spanish & More",
      "Each child gets personalized tutoring",
      "Real-time transcripts for parents",
      "Priority support"
    ],
    popular: false
  },
  {
    id: "pro",
    name: "Pro Family",
    price: "$99.99",
    minutes: 600,
    subtitle: "Most popular for families with multiple learners",
    features: [
      "600 minutes shared by entire family",
      "Unlimited student profiles for siblings",
      "Math, English, Science, Spanish & More",
      "Each child gets personalized tutoring",
      "Real-time transcripts for parents",
      "Priority support",
      "Custom learning paths per child"
    ],
    popular: true
  },
  {
    id: "elite",
    name: "Elite Family",
    price: "$199.99",
    minutes: 1800,
    subtitle: "👑 BEST VALUE - For large families",
    features: [
      "1,800 minutes/month (30 hours!)",
      "Unlimited student profiles for siblings",
      "🎉 3 CONCURRENT DEVICES",
      "Math, English, Science, Spanish & More",
      "Each child gets personalized tutoring",
      "Real-time transcripts for parents",
      "Priority support",
      "Custom learning paths per child"
    ]
  }
];

export default function SubscriptionManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    queryClient.invalidateQueries({ queryKey: ['/api/user/voice-balance'] });
  };

  // Fetch hybrid minute balance
  const { data: voiceBalance } = useQuery<VoiceBalance>({
    queryKey: ['/api/user/voice-balance'],
    enabled: !!user
  });

  // Fetch billing history
  const { data: billingHistory } = useQuery<any[]>({
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

            {/* Hybrid Minute Breakdown */}
            <div className="space-y-4">
              {/* Total Available */}
              <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-4 rounded-lg border border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Available</p>
                    <p className="text-3xl font-bold text-primary">
                      {voiceBalance?.totalAvailable || 0} <span className="text-lg">minutes</span>
                    </p>
                  </div>
                  <Clock className="h-8 w-8 text-primary/50" />
                </div>
              </div>

              {/* Subscription Minutes */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    This Month's Usage
                  </span>
                  <span className="text-sm font-semibold">
                    {voiceBalance?.subscriptionUsed || 0} / {voiceBalance?.subscriptionLimit || 0} minutes
                  </span>
                </div>
                <Progress 
                  value={((voiceBalance?.subscriptionUsed || 0) / (voiceBalance?.subscriptionLimit || 1)) * 100} 
                  className="h-2" 
                />
                {voiceBalance?.resetDate && (
                  <p className="text-xs text-muted-foreground">
                    Resets {format(new Date(voiceBalance.resetDate), 'MMM dd, yyyy')}
                  </p>
                )}
              </div>

              {/* Purchased Minutes (Rollover) */}
              {(voiceBalance?.purchasedMinutes ?? 0) > 0 && (
                <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-sm font-medium">Rollover Balance</span>
                    </div>
                    <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
                      {voiceBalance?.purchasedMinutes} minutes
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">From purchased top-ups • Never expires</p>
                </div>
              )}

              {/* Low Minutes Warning */}
              {(voiceBalance?.totalAvailable ?? 0) < 10 && voiceBalance && (
                <Alert variant="destructive">
                  <AlertDescription>
                    You're running low on voice minutes! Consider upgrading your plan or purchasing additional minutes.
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
          <CardTitle>Family Plans</CardTitle>
          <CardDescription>
            One plan. All your kids learn. Save hundreds per month with minutes shared across siblings.
            <span className="block mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
              ⚠️ Only one voice session can be active at a time per account - family members take turns.
            </span>
          </CardDescription>
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
                <p className="text-xs text-muted-foreground mb-2">{plan.subtitle}</p>
                <p className="text-2xl font-bold">{plan.price}</p>
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