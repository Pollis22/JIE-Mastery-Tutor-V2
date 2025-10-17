import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    price: 19.99,
    minutes: 60,
    features: [
      '60 voice minutes per month',
      'Math, English, Science, Spanish & More tutoring',
      'AI-powered learning',
      'Multiple family profiles',
      'Real-time transcripts',
      'Progress tracking'
    ],
    popular: false,
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 59.99,
    minutes: 240,
    features: [
      '240 voice minutes per month',
      'Math, English, Science, Spanish & More tutoring',
      'AI-powered learning',
      'Multiple family profiles',
      'Real-time transcripts',
      'Progress tracking',
      'Priority support'
    ],
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 99.99,
    minutes: 600,
    features: [
      '600 voice minutes per month',
      'Math, English, Science, Spanish & More tutoring',
      'AI-powered learning',
      'Multiple family profiles',
      'Real-time transcripts',
      'Progress tracking',
      'Priority support',
      'Custom learning paths'
    ],
    popular: false,
  },
];

export default function PricingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  const handleSelectPlan = async (planId: string) => {
    // If user is not logged in, redirect to auth page
    if (!user) {
      setLocation("/auth");
      return;
    }

    setLoading(planId);
    try {
      const response = await apiRequest('POST', '/api/create-checkout-session', {
        plan: planId,
      });
      
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to start checkout',
        variant: 'destructive',
      });
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
                </svg>
              </div>
              <span className="ml-3 text-xl font-bold text-foreground">AI Tutor</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => setLocation("/auth")} data-testid="button-sign-in">
                Sign In
              </Button>
              <Button onClick={() => setLocation("/auth")} data-testid="button-get-started">
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">
          
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="inline-block mb-4">
              <span className="text-sm font-semibold text-primary uppercase tracking-wide bg-primary/10 px-4 py-2 rounded-full">
                The Future of Family Tutoring
              </span>
            </div>
            <h1 className="text-5xl font-bold text-foreground mb-6" data-testid="text-hero-title">
              One Plan. Entire Family. Unlimited Potential.
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              Master Math, English, Science, Spanish and More with interactive voice lessons and progress tracking. 
              Create profiles for each family member and share minutes across all learners—from kindergarten to college.
            </p>
            
            {/* Feature highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <div className="flex items-center justify-center space-x-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd"/>
                  </svg>
                </div>
                <span className="text-muted-foreground">Live Voice Conversations</span>
              </div>
              <div className="flex items-center justify-center space-x-3">
                <div className="w-10 h-10 bg-secondary/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <span className="text-muted-foreground">Adaptive Learning</span>
              </div>
              <div className="flex items-center justify-center space-x-3">
                <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                </div>
                <span className="text-muted-foreground">Progress Tracking</span>
              </div>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={`shadow-lg relative ${
                  plan.popular ? 'border-2 border-primary shadow-xl' : ''
                }`}
                data-testid={`card-${plan.id}-plan`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-4 py-2">Most Popular</Badge>
                  </div>
                )}
                
                <CardContent className="p-8">
                  <div className="mb-8">
                    <h3 className="text-2xl font-bold text-foreground mb-2">{plan.name}</h3>
                    <p className="text-muted-foreground">
                      {plan.id === 'starter' && 'Perfect for getting started'}
                      {plan.id === 'standard' && 'Best value for regular learners'}
                      {plan.id === 'pro' && 'Maximum learning time'}
                    </p>
                  </div>
                  
                  <div className="mb-8">
                    <div className="flex items-baseline">
                      <span className="text-5xl font-bold text-foreground">${plan.price}</span>
                      <span className="text-xl text-muted-foreground ml-2">/month</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {plan.minutes} minutes of voice tutoring
                    </p>
                  </div>

                  <div className="space-y-4 mb-6">
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center space-x-3" data-testid={`feature-${plan.id}-${idx}`}>
                        <svg className="w-5 h-5 text-secondary flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                        </svg>
                        <span className="text-foreground">{feature}</span>
                      </div>
                    ))}
                  </div>

                  {/* Minute Top-Up Notice */}
                  <div className="bg-muted/50 rounded-lg p-3 mb-6 border border-border">
                    <p className="text-xs text-muted-foreground text-center">
                      <span className="font-semibold text-foreground">Need more minutes?</span> Purchase additional 60-minute blocks for $19.99 anytime
                    </p>
                  </div>

                  <Button 
                    className={`w-full py-4 text-lg font-semibold ${
                      plan.popular ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : ''
                    }`}
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={loading === plan.id}
                    data-testid={`button-select-${plan.id}`}
                  >
                    {loading === plan.id ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full mr-2" />
                        Processing...
                      </div>
                    ) : (
                      'Subscribe Now'
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Family Sharing Highlight */}
          <div className="mb-16">
            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-500 shadow-xl">
              <CardContent className="p-8">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center">
                      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <h3 className="text-3xl font-bold text-foreground mb-3">Perfect for Families! 👨‍👩‍👧‍👦</h3>
                    <p className="text-lg text-foreground mb-4">
                      <strong>One subscription, whole family learns together!</strong> Since billing is minute-based, siblings can share the account seamlessly.
                    </p>
                    <div className="grid md:grid-cols-3 gap-4 text-sm">
                      <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3">
                        <div className="flex items-center justify-center md:justify-start space-x-2 mb-1">
                          <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                          </svg>
                          <span className="font-semibold text-foreground">Multiple Profiles</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Create separate profiles for each child</p>
                      </div>
                      <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3">
                        <div className="flex items-center justify-center md:justify-start space-x-2 mb-1">
                          <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                          </svg>
                          <span className="font-semibold text-foreground">Personalized Learning</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Each gets age-appropriate tutoring</p>
                      </div>
                      <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3">
                        <div className="flex items-center justify-center md:justify-start space-x-2 mb-1">
                          <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                          </svg>
                          <span className="font-semibold text-foreground">Shared Minutes</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Pool minutes across all siblings</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* FAQ Section */}
          <Card className="bg-muted/30 shadow-sm">
            <CardContent className="pt-8">
              <h3 className="text-2xl font-bold text-foreground text-center mb-8">Frequently Asked Questions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-foreground mb-2">How do voice minutes work?</h4>
                  <p className="text-muted-foreground text-sm">
                    Each plan includes a monthly allocation of voice minutes for AI tutoring sessions. 
                    Minutes reset at the beginning of each billing cycle.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-2">Can I cancel anytime?</h4>
                  <p className="text-muted-foreground text-sm">
                    Yes, you can cancel your subscription at any time through your account settings. No cancellation fees.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-2">What if I run out of minutes?</h4>
                  <p className="text-muted-foreground text-sm">
                    You can instantly purchase additional minutes in 60-minute increments for $19.99 each. 
                    Alternatively, upgrade to a higher plan for better value. We'll notify you when you're running low.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-2">Can I upgrade or downgrade?</h4>
                  <p className="text-muted-foreground text-sm">
                    Yes! You can change your plan at any time through your account settings. 
                    Changes take effect at the start of your next billing cycle.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-muted-foreground">&copy; 2025 JIE Mastery Tutor. All rights reserved.</p>
            <div className="flex space-x-6">
              <button
                onClick={() => setLocation("/terms")}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-terms"
              >
                Terms & Conditions
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
