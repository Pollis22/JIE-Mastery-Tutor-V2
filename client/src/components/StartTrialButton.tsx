import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';
import { trackEvent } from '@/hooks/use-tracking';

interface StartTrialButtonProps {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showSubtext?: boolean;
}

export function StartTrialButton({ 
  variant = 'primary', 
  size = 'md', 
  className = '',
  showSubtext = false 
}: StartTrialButtonProps) {
  const [, setLocation] = useLocation();

  const handleClick = () => {
    trackEvent('start_free_trial_click');
    setLocation('/start-trial');
  };

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

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        onClick={handleClick}
        className={`${buttonClasses[variant]} ${sizeClasses[size]} ${className}`}
        data-testid="button-start-free-trial"
      >
        <Play className="w-4 h-4 mr-2" />
        Start Free Trial
      </Button>
      {showSubtext && (
        <p className="text-xs text-gray-500 text-center">
          30-minute free trial in the real app. No credit card required.
        </p>
      )}
    </div>
  );
}
