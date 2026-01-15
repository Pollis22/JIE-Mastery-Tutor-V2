import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Play, Mail, CheckCircle } from 'lucide-react';

interface TrialCTAProps {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Map error codes to user-facing messages
const TRIAL_ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  EMAIL_REQUIRED: {
    title: 'Email required',
    description: 'Please enter your email address.',
  },
  EMAIL_INVALID: {
    title: 'Invalid email',
    description: 'Please enter a valid email address.',
  },
  TRIAL_EMAIL_USED: {
    title: 'Email already used',
    description: 'This email address has already been used for a free trial. Please sign up to continue.',
  },
  TRIAL_DEVICE_USED: {
    title: 'Device already used',
    description: 'A free trial has already been used on this device. Please sign up to continue.',
  },
  TRIAL_RATE_LIMITED: {
    title: 'Too many attempts',
    description: 'Too many trial attempts from this location. Please try again later.',
  },
  TRIAL_EXPIRED: {
    title: 'Trial ended',
    description: 'Your free trial has ended. Upgrade to keep learning.',
  },
  TRIAL_INTERNAL_ERROR: {
    title: 'Something went wrong',
    description: 'Please try again in a moment.',
  },
};

export function TrialCTA({ variant = 'primary', size = 'md', className = '' }: TrialCTAProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    
    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Use raw fetch instead of apiRequest to handle 4xx responses without throwing
      const response = await fetch('/api/trial/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim() }),
      });
      
      const data = await response.json();

      if (data.ok) {
        setEmailSent(true);
        setErrorMessage(null);
        toast({
          title: 'Check your email!',
          description: 'We sent you a verification link to start your free trial.',
        });
      } else {
        // Get user-facing message from error code
        const errorCode = data.code || '';
        const errorInfo = TRIAL_ERROR_MESSAGES[errorCode] || {
          title: 'Unable to start trial',
          description: data.error || 'Please try again later.',
        };
        
        // Log for debugging
        console.log('[Trial] Error code:', errorCode, '- User message:', errorInfo.description);
        
        // Show inline error message
        setErrorMessage(errorInfo.description);
        
        // Also show toast for visibility
        toast({
          title: errorInfo.title,
          description: errorInfo.description,
          variant: 'destructive',
        });
      }
    } catch (error) {
      // Only show network error when fetch truly fails (no response at all)
      const networkError = "We're having trouble connecting right now. Please check your internet connection and try again.";
      console.log('[Trial] Network error:', error, '- User message:', networkError);
      setErrorMessage(networkError);
      toast({
        title: 'Connection error',
        description: networkError,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setEmail('');
      setEmailSent(false);
      setErrorMessage(null);
    }, 300);
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
    <Dialog open={open} onOpenChange={(o) => o ? setOpen(true) : handleClose()}>
      <DialogTrigger asChild>
        <Button
          className={`${buttonClasses[variant]} ${sizeClasses[size]} ${className}`}
          data-testid="button-trial-cta"
        >
          <Play className="w-4 h-4 mr-2" />
          Try 5 Minutes Free
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" data-testid="modal-trial">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            {emailSent ? 'Check Your Email!' : 'Start Your Free Trial'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {emailSent 
              ? 'We sent you a verification link. Click it to start your 5-minute trial.'
              : 'Enter your email to get 5 minutes of free AI tutoring. No credit card required.'}
          </DialogDescription>
        </DialogHeader>
        
        {emailSent ? (
          <div className="flex flex-col items-center py-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-lg font-semibold text-gray-800 text-center mb-2" data-testid="text-email-sent-title">
              Check your inbox to continue.
            </p>
            <p className="text-gray-600 text-center mb-3" data-testid="text-email-sent-description">
              We've sent a verification email to your address.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 w-full" data-testid="notice-spam-folder">
              <p className="text-sm text-blue-800 text-center">
                If you don't see it within a minute, please check your Spam or Junk folder and mark it as "Not Spam."
              </p>
            </div>
            <p className="text-sm text-gray-500 text-center">
              Still can't find it?{' '}
              <button 
                onClick={() => setEmailSent(false)}
                className="text-red-600 hover:underline"
                data-testid="link-try-again"
              >
                Try again
              </button>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="trial-email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  id="trial-email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrorMessage(null); // Clear error on input change
                  }}
                  className={`pl-10 ${errorMessage ? 'border-red-500 focus:ring-red-500' : ''}`}
                  disabled={isSubmitting}
                  data-testid="input-trial-email"
                />
              </div>
              {errorMessage && (
                <p className="text-sm text-red-600" data-testid="text-trial-error">
                  {errorMessage}
                </p>
              )}
            </div>
            
            <Button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700"
              disabled={isSubmitting}
              data-testid="button-start-trial"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Start Free Trial'
              )}
            </Button>
            
            <p className="text-xs text-gray-500 text-center">
              By starting your trial, you agree to our Terms of Service and Privacy Policy.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
