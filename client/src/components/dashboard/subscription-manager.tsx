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
import { PromoCodeInput } from "@/components/PromoCodeInput";
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
  RefreshCw,
  Tag,
  AlertTriangle,
  RotateCcw
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | null>(null);
  const [promoDiscount, setPromoDiscount] = useState<string | null>(null);

  const handlePromoApplied = (code: string, discount: string, _promoCodeId: string) => {
    setAppliedPromoCode(code);
    setPromoDiscount(discount);
    toast({
      title: "Promo code applied",
      description: `${code}: ${discount}`,
    });
  };

  const handlePromoRemoved = () => {
    setAppliedPromoCode(null);
    setPromoDiscount(null);
  };

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    queryClient.invalidateQueries({ queryKey: ['/api/user/voice-balance'] });
  };

  // Fetch hybrid minute balance
  const { data: voiceBalance } = useQuery<VoiceBalance>({
    queryKey: ['/api/user/voice-balance'],
    enabled: !!user,
    staleTime: 0, // Always fetch fresh data for consistency across devices
    gcTime: 0, // Don't cache after component unmount
    refetchInterval: 30000, // Poll every 30 seconds for cross-device consistency
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    refetchOnMount: true, // Always refetch on component mount
  });

  // Fetch billing history
  const { data: billingHistory } = useQuery<any[]>({
    queryKey: ['/api/billing/history'],
    enabled: !!user
  });

  // Upgrade/Downgrade mutation
  const changePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const payload: { plan: string; promoCode?: string } = { plan: planId };
      if (appliedPromoCode) {
        payload.promoCode = appliedPromoCode;
      }
      const response = await apiRequest("POST", "/api/subscription/change", payload);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || "Failed to change plan");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: "Success",
          description: data.message || (data.discountApplied 
            ? "Subscription updated with discount applied!" 
            : "Subscription updated successfully"),
        });
        handlePromoRemoved();
        refetch();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update subscription",
        variant: "destructive",
      });
      // Clear promo code on error to avoid lingering UI hints about a discount
      if (appliedPromoCode) {
        handlePromoRemoved();
      }
    }
  });

  // Cancel subscription mutation
  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/subscription/cancel");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || "Failed to cancel subscription");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Subscription Canceled",
        description: data.accessUntilFormatted 
          ? `Your subscription will remain active until ${data.accessUntilFormatted}. You can reactivate anytime before then.`
          : "Your subscription will remain active until the end of the billing period.",
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

  // Reactivate subscription mutation
  const reactivateSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/subscription/reactivate", {
        planId: user?.subscriptionPlan
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || "Failed to reactivate subscription");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.type === 'checkout' && data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: "Subscription Reactivated!",
          description: data.message || "Your subscription is now active again.",
        });
        refetch();
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reactivate subscription",
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
                <Badge 
                  variant={
                    user?.subscriptionStatus === 'active' ? 'default' : 
                    user?.subscriptionStatus === 'canceled' ? 'secondary' :
                    user?.subscriptionStatus === 'past_due' ? 'destructive' :
                    'outline'
                  }
                  className={user?.subscriptionStatus === 'canceled' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
                >
                  {user?.subscriptionStatus === 'active' ? 'Active' :
                   user?.subscriptionStatus === 'canceled' ? 'Canceled' :
                   user?.subscriptionStatus === 'past_due' ? 'Payment Issue' :
                   user?.subscriptionStatus === 'inactive' ? 'Inactive' :
                   user?.subscriptionStatus === 'trialing' ? 'Trial' :
                   'Inactive'}
                </Badge>
                {user?.subscriptionStatus === 'active' && user?.monthlyResetDate && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Renews {format(new Date(user.monthlyResetDate), 'MMM dd')}
                  </Badge>
                )}
                {user?.subscriptionStatus === 'canceled' && user?.subscriptionEndsAt && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Access until {format(new Date(user.subscriptionEndsAt), 'MMM dd, yyyy')}
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

            {/* Status-Specific Alerts */}
            {user?.subscriptionStatus === 'canceled' && user?.subscriptionEndsAt && (
              <Alert className="bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <AlertDescription className="text-yellow-800 dark:text-yellow-300">
                  <span className="font-medium">Your subscription is scheduled to end.</span> You'll have access until {format(new Date(user.subscriptionEndsAt), 'MMMM d, yyyy')}. 
                  You can reactivate your subscription anytime before then.
                </AlertDescription>
              </Alert>
            )}
            
            {user?.subscriptionStatus === 'past_due' && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-medium">Payment issue detected.</span> Please update your payment method to continue using voice tutoring.
                </AlertDescription>
              </Alert>
            )}
            
            {(user?.subscriptionStatus === 'inactive' || (!user?.subscriptionStatus && !user?.stripeSubscriptionId)) && (
              <Alert className="bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                <AlertDescription>
                  <span className="font-medium">Your subscription has ended.</span> Reactivate to continue your learning journey!
                </AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {user?.subscriptionStatus === 'active' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => window.open('/api/stripe/portal', '_blank')}
                    data-testid="button-manage-billing"
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Manage Billing
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={cancelSubscriptionMutation.isPending}
                        data-testid="button-cancel-subscription"
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Cancel Subscription
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
                        <AlertDialogDescription className="space-y-3">
                          <p>Are you sure you want to cancel your subscription?</p>
                          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                            <p className="text-blue-800 dark:text-blue-300 text-sm">
                              <strong>You won't lose access immediately.</strong> You'll continue to have full access until the end of your current billing period.
                            </p>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            You can reactivate anytime before your period ends to keep your subscription going.
                          </p>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="button-keep-subscription">Keep Subscription</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => cancelSubscriptionMutation.mutate()}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          data-testid="button-confirm-cancel"
                        >
                          Yes, Cancel
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
              
              {user?.subscriptionStatus === 'canceled' && (
                <Button
                  onClick={() => reactivateSubscriptionMutation.mutate()}
                  disabled={reactivateSubscriptionMutation.isPending}
                  data-testid="button-reactivate-subscription"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {reactivateSubscriptionMutation.isPending ? 'Reactivating...' : 'Undo Cancellation'}
                </Button>
              )}
              
              {user?.subscriptionStatus === 'past_due' && (
                <Button
                  variant="destructive"
                  onClick={() => window.open('/api/stripe/portal', '_blank')}
                  data-testid="button-update-payment"
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Update Payment Method
                </Button>
              )}
              
              {(user?.subscriptionStatus === 'inactive' || (!user?.subscriptionStatus && !user?.stripeSubscriptionId)) && (
                <Button
                  onClick={() => window.location.href = '/pricing'}
                  data-testid="button-subscribe"
                >
                  <ArrowUpCircle className="mr-2 h-4 w-4" />
                  Reactivate Subscription
                </Button>
              )}
              
              <Button
                variant="secondary"
                onClick={() => buyMinutesMutation.mutate()}
                disabled={buyMinutesMutation.isPending}
                data-testid="button-buy-minutes"
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
          {/* Promo Code Section */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Have a promo code?</span>
            </div>
            <PromoCodeInput 
              onPromoApplied={handlePromoApplied}
              onPromoRemoved={handlePromoRemoved}
              disabled={changePlanMutation.isPending}
            />
            {appliedPromoCode && promoDiscount && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                Discount will be applied to your next plan change.
              </p>
            )}
          </div>
          
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