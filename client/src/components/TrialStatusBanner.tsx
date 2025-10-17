import { useEffect, useState } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';

export function TrialStatusBanner() {
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Fetch user data to get trial information
  const { data: user } = useQuery<{
    isTrialActive?: boolean;
    trialEndsAt?: string;
    trialMinutesUsed?: number;
    trialMinutesLimit?: number;
  }>({
    queryKey: ['/api/auth/me'],
    refetchInterval: 60000, // Refresh every minute
  });

  useEffect(() => {
    if (!user?.isTrialActive || !user?.trialEndsAt) return;

    const updateTimeRemaining = () => {
      if (!user?.trialEndsAt) return;
      
      const now = new Date();
      const trialEnd = new Date(user.trialEndsAt);
      const diff = trialEnd.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining('Trial ended');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      let remaining = '';
      if (days > 0) {
        remaining = `${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}`;
      } else if (hours > 0) {
        remaining = `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} min`;
      } else {
        remaining = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
      }

      setTimeRemaining(remaining);
    };

    // Update immediately
    updateTimeRemaining();

    // Update every minute
    const interval = setInterval(updateTimeRemaining, 60000);

    return () => clearInterval(interval);
  }, [user]);

  // Don't show banner if not in trial
  if (!user?.isTrialActive) {
    return null;
  }

  const minutesUsed = user.trialMinutesUsed || 0;
  const minutesLimit = user.trialMinutesLimit || 30;
  const minutesRemaining = Math.max(0, minutesLimit - minutesUsed);
  const percentageUsed = (minutesUsed / minutesLimit) * 100;

  // Determine alert variant based on time remaining
  const trialEnd = user?.trialEndsAt ? new Date(user.trialEndsAt) : new Date();
  const now = new Date();
  const hoursRemaining = (trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  const isExpiringSoon = hoursRemaining < 48; // Less than 2 days
  const isUrgent = hoursRemaining < 24; // Less than 1 day

  return (
    <Alert 
      className={`mb-6 ${isUrgent ? 'border-red-500 bg-red-50 dark:bg-red-950' : isExpiringSoon ? 'border-orange-500 bg-orange-50 dark:bg-orange-950' : 'border-blue-500 bg-blue-50 dark:bg-blue-950'}`}
      data-testid="banner-trial-status"
    >
      <Clock className={`h-4 w-4 ${isUrgent ? 'text-red-500' : isExpiringSoon ? 'text-orange-500' : 'text-blue-500'}`} />
      <AlertTitle className="flex items-center gap-2">
        Trial Period Active
        <Badge 
          variant={isUrgent ? "destructive" : isExpiringSoon ? "outline" : "secondary"}
          data-testid="badge-trial-time"
        >
          {timeRemaining} remaining
        </Badge>
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">Voice Minutes Used:</span>
              <span className="text-sm" data-testid="text-minutes-used">
                {minutesUsed} / {minutesLimit} minutes
              </span>
              <Badge variant={percentageUsed > 80 ? "destructive" : "outline"} data-testid="badge-minutes-remaining">
                {minutesRemaining} min left
              </Badge>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  percentageUsed > 80 ? 'bg-red-500' : percentageUsed > 50 ? 'bg-orange-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, percentageUsed)}%` }}
                data-testid="progress-minutes"
              />
            </div>
          </div>
          <div className="flex gap-2">
            {isExpiringSoon && (
              <Link href="/pricing">
                <Button size="sm" variant={isUrgent ? "default" : "outline"} data-testid="button-view-plans">
                  View Plans
                </Button>
              </Link>
            )}
            <Link href="/account">
              <Button size="sm" variant="outline" data-testid="button-manage-trial">
                Manage Trial
              </Button>
            </Link>
          </div>
        </div>
        {isUrgent && (
          <div className="flex items-start gap-2 pt-2 border-t">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400" data-testid="text-trial-warning">
              Your trial expires soon! Choose a plan now to continue learning without interruption.
            </p>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}