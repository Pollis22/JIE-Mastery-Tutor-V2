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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  CreditCard, 
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Shield
} from "lucide-react";

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export default function PaymentMethods() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch payment methods
  const { data: paymentMethods = [], isLoading } = useQuery({
    queryKey: ['/api/payment-methods'],
    enabled: !!user
  });

  // Add payment method mutation
  const addPaymentMethodMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/payment-methods/add");
      if (!response.ok) throw new Error("Failed to add payment method");
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
        description: error.message || "Failed to add payment method",
        variant: "destructive",
      });
    }
  });

  // Remove payment method mutation
  const removePaymentMethodMutation = useMutation({
    mutationFn: async (methodId: string) => {
      const response = await apiRequest("DELETE", `/api/payment-methods/${methodId}`);
      if (!response.ok) throw new Error("Failed to remove payment method");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Payment method removed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-methods'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove payment method",
        variant: "destructive",
      });
    }
  });

  // Set default payment method mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (methodId: string) => {
      const response = await apiRequest("POST", `/api/payment-methods/${methodId}/default`);
      if (!response.ok) throw new Error("Failed to set default payment method");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Default payment method updated",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-methods'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update default payment method",
        variant: "destructive",
      });
    }
  });

  const handleRemove = (methodId: string) => {
    if (window.confirm("Are you sure you want to remove this payment method?")) {
      removePaymentMethodMutation.mutate(methodId);
    }
  };

  const cardBrandIcons: Record<string, string> = {
    visa: "💳",
    mastercard: "💳",
    amex: "💳",
    discover: "💳",
    default: "💳"
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Methods</CardTitle>
        <CardDescription>Manage your payment methods for subscriptions and purchases</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Security Notice */}
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Your payment information is securely stored with our payment processor Stripe. 
              We never store your full card details on our servers.
            </AlertDescription>
          </Alert>

          {/* Payment Methods List */}
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading payment methods...</p>
            </div>
          ) : paymentMethods.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">No payment methods added yet</p>
              <Button onClick={() => addPaymentMethodMutation.mutate()}>
                <Plus className="mr-2 h-4 w-4" />
                Add Payment Method
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {paymentMethods.map((method: PaymentMethod) => (
                  <div
                    key={method.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-2xl">
                        {cardBrandIcons[method.brand.toLowerCase()] || cardBrandIcons.default}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {method.brand} •••• {method.last4}
                          </p>
                          {method.isDefault && (
                            <Badge variant="default" className="text-xs">
                              <Check className="mr-1 h-3 w-3" />
                              Default
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Expires {method.expMonth}/{method.expYear}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!method.isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDefaultMutation.mutate(method.id)}
                          disabled={setDefaultMutation.isPending}
                        >
                          Set as Default
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(method.id)}
                        disabled={removePaymentMethodMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Button 
                onClick={() => addPaymentMethodMutation.mutate()}
                disabled={addPaymentMethodMutation.isPending}
                className="w-full sm:w-auto"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Payment Method
              </Button>
            </>
          )}

          {/* Information */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Your default payment method will be used for automatic subscription renewals. 
              You can change or remove payment methods at any time.
            </AlertDescription>
          </Alert>
        </div>
      </CardContent>
    </Card>
  );
}