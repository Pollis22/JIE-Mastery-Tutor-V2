import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  Mail, 
  Bell, 
  Sparkles,
  Gift,
  CheckCircle
} from "lucide-react";

export default function NewsletterSubscribe() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [preferences, setPreferences] = useState({
    newsletter: user?.marketingOptIn || false,
    updates: true,
    promotions: false,
    tips: true
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", "/api/user/email-preferences", data);
      if (!response.ok) throw new Error("Failed to update preferences");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Preferences updated",
        description: "Your email preferences have been saved",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update preferences",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Transform preferences to match backend API format
    updatePreferencesMutation.mutate({
      weeklyNewsletter: preferences.newsletter,
      productUpdates: preferences.updates,
      promotionalOffers: preferences.promotions,
      learningTips: preferences.tips
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stay Connected</CardTitle>
        <CardDescription>
          Get the latest updates, tips, and exclusive offers
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Benefits */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="flex items-start gap-3">
              <Gift className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Exclusive Discounts</p>
                <p className="text-xs text-muted-foreground">
                  Get special offers on subscriptions and minutes
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Learning Tips</p>
                <p className="text-xs text-muted-foreground">
                  Weekly tips to maximize your tutoring sessions
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Bell className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Feature Updates</p>
                <p className="text-xs text-muted-foreground">
                  Be first to know about new features
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Educational Content</p>
                <p className="text-xs text-muted-foreground">
                  Curated learning resources and guides
                </p>
              </div>
            </div>
          </div>

          {/* Subscription Options */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Email Preferences</Label>
            
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="newsletter"
                  checked={preferences.newsletter}
                  onCheckedChange={(checked) => 
                    setPreferences({...preferences, newsletter: checked as boolean})
                  }
                />
                <Label 
                  htmlFor="newsletter" 
                  className="text-sm font-normal cursor-pointer"
                >
                  Weekly Newsletter - Learning tips, success stories, and educational content
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="updates"
                  checked={preferences.updates}
                  onCheckedChange={(checked) => 
                    setPreferences({...preferences, updates: checked as boolean})
                  }
                />
                <Label 
                  htmlFor="updates" 
                  className="text-sm font-normal cursor-pointer"
                >
                  Product Updates - New features and improvements
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="promotions"
                  checked={preferences.promotions}
                  onCheckedChange={(checked) => 
                    setPreferences({...preferences, promotions: checked as boolean})
                  }
                />
                <Label 
                  htmlFor="promotions" 
                  className="text-sm font-normal cursor-pointer"
                >
                  Promotional Offers - Discounts and special deals
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="tips"
                  checked={preferences.tips}
                  onCheckedChange={(checked) => 
                    setPreferences({...preferences, tips: checked as boolean})
                  }
                />
                <Label 
                  htmlFor="tips" 
                  className="text-sm font-normal cursor-pointer"
                >
                  Learning Tips - Personalized study strategies and advice
                </Label>
              </div>
            </div>
          </div>

          {/* Current Status */}
          {user?.marketingOptIn && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                You're subscribed to our emails. You can update your preferences or unsubscribe at any time.
              </AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <Button 
            type="submit" 
            disabled={updatePreferencesMutation.isPending}
            className="w-full"
          >
            <Mail className="mr-2 h-4 w-4" />
            {updatePreferencesMutation.isPending ? "Saving..." : "Save Email Preferences"}
          </Button>

          {/* Unsubscribe Link */}
          <p className="text-xs text-center text-muted-foreground">
            You can unsubscribe from all emails at any time.{" "}
            <a href="/unsubscribe" className="underline">
              Manage preferences
            </a>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}