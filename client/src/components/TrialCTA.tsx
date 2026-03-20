/**
 * TrialCTA — Free trial call-to-action button.
 * Navigates to /start-trial (card-capture Stripe checkout flow).
 * The previous email-only trial dialog has been removed.
 */

import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';
import { trackEvent } from '@/hooks/use-tracking';

interface TrialCTAProps {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showContinueLink?: boolean;
}

export function TrialCTA({
  variant = 'primary',
  size = 'md',
  className = '',
  showContinueLink = false,
}: TrialCTAProps) {
  const [, navigate] = useLocation();

  const buttonClasses = {
    primary: 'bg-red-600 hover:bg-red-700 text-white',
    secondary: 'bg-white hover:bg-gray-100 text-red-600 border-2 border-red-600',
    outline: 'bg-transparent hover:bg-red-50 text-red-600 border border-red-600',
  };

  const sizeClasses = {
    sm: 'text-sm px-4 py-2',
    md: 'text-base px-6 py-3',
    lg: 'text-lg px-8 py-4',
  };

  const handleClick = () => {
    trackEvent('trial_cta_click');
    navigate('/start-trial');
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        onClick={handleClick}
        className={`${buttonClasses[variant]} ${sizeClasses[size]} ${className}`}
        data-testid="button-trial-cta"
      >
        <Play className="w-4 h-4 mr-2" />
        Try 30 Minutes Free
      </Button>

      {showContinueLink && (
        <button
          onClick={() => navigate('/auth')}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
          data-testid="link-login-instead"
        >
          Already have an account? Log in
        </button>
      )}
    </div>
  );
}

export default TrialCTA;
