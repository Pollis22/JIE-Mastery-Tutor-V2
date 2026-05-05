import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { trackEvent } from '@/hooks/use-tracking';

// NOTE: Component name preserved for backward compatibility with existing
// imports across offer-page, pricing-page, auth-page, etc. The component
// now drives users directly to the pricing page (free trial removed May 2026).
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
    trackEvent('view_pricing_click');
    setLocation('/pricing');
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
        data-testid="button-view-pricing"
      >
        View Pricing
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
      {showSubtext && (
        <p className="text-xs text-gray-500 text-center">
          Plans start at $19.99/month. Cancel anytime.
        </p>
      )}
    </div>
  );
}
