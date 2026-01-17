import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { trackEvent } from '@/hooks/use-tracking';

interface TrialEndedPaywallProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  trialMinutes?: number;
}

export function TrialEndedPaywall({ 
  open, 
  onOpenChange,
  trialMinutes = 30 
}: TrialEndedPaywallProps) {
  const [, setLocation] = useLocation();

  const handleViewPlans = () => {
    trackEvent('trial_paywall_view_plans');
    setLocation('/pricing');
    onOpenChange?.(false);
  };

  const handleCreateAccount = () => {
    trackEvent('trial_paywall_create_account');
    setLocation('/auth');
    onOpenChange?.(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="modal-trial-ended-paywall">
        <DialogHeader className="text-center">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <DialogTitle className="text-2xl font-bold" data-testid="text-paywall-title">
            Your Free Trial Has Ended
          </DialogTitle>
          <DialogDescription className="text-base mt-2">
            You've used your {trialMinutes}-minute free trial. Subscribe to continue learning with your AI tutor!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/20">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-green-800 dark:text-green-200">
                    Special Offer: 50% Off Your First Month
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    Use code <span className="font-mono font-bold bg-green-100 dark:bg-green-800 px-1.5 py-0.5 rounded">WELCOME50</span> at checkout
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">What you get with a subscription:</p>
            <ul className="space-y-2">
              {[
                'Unlimited student profiles for your whole family',
                'Voice-based AI tutoring in Math, English, Science & Spanish',
                'Homework upload with smart OCR recognition',
                'Progress tracking and parent transcripts'
              ].map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="text-xs text-center text-muted-foreground bg-muted/50 rounded-lg p-3">
            Plans start at $19.99/month. Cancel anytime — no long-term commitment required.
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button 
            onClick={handleViewPlans}
            className="flex-1 bg-green-600 hover:bg-green-700"
            data-testid="button-paywall-view-plans"
          >
            View Plans
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button 
            variant="outline" 
            onClick={handleCreateAccount}
            className="flex-1"
            data-testid="button-paywall-create-account"
          >
            Create Account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
