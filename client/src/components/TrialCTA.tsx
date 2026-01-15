import { useState } from 'react';
import { useLocation } from 'wouter';
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
import { Loader2, Play, Mail, CheckCircle, ArrowRight } from 'lucide-react';

interface TrialCTAProps {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showContinueLink?: boolean;
}

// Map error codes to user-facing messages
const TRIAL_ERROR_MESSAGES: Record<string, { title: string; description: string; showContinueTrial?: boolean }> = {
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
    description: 'This email has already been used for a free trial. Want to continue your trial? Use "Continue Trial" on the login page.',
    showContinueTrial: true,
  },
  TRIAL_DEVICE_USED: {
    title: 'Device already used',
    description: 'A free trial has already been used on this device. Please sign up or log in to continue.',
  },
  TRIAL_RATE_LIMITED: {
    title: 'Too many attempts',
    description: 'Too many trial attempts from this location. Please try again later.',
  },
  TRIAL_EXPIRED: {
    title: 'Trial ended',
    description: 'Your free trial has ended. Please sign up to continue learning.',
  },
  TRIAL_DB_SCHEMA_MISMATCH: {
    title: 'Service temporarily unavailable',
    description: 'We\'re performing maintenance. Please try again in a few minutes.',
  },
  TRIAL_DB_MIGRATION_MISSING: {
    title: 'Service temporarily unavailable',
    description: 'We\'re performing maintenance. Please try again in a few minutes.',
  },
  EMAIL_SEND_FAILED: {
    title: 'Email delivery issue',
    description: 'We couldn\'t send the verification email. Please try again in a moment.',
  },
  TRIAL_CONFIG_ERROR: {
    title: 'Service configuration issue',
    description: 'Please try again in a few minutes or contact support.',
  },
};

export function TrialCTA({ variant = 'primary', size = 'md', className = '', showContinueLink = true }: TrialCTAProps) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();
  
  const [continueOpen, setContinueOpen] = useState(false);
  const [continueEmail, setContinueEmail] = useState('');
  const [continueSent, setContinueSent] = useState(false);
  const [continueSubmitting, setContinueSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent duplicate submissions (rapid clicks or Enter key)
    if (isSubmitting) {
      return;
    }
    
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
        
        // Fire Google Ads + Meta Pixel conversions (idempotent - once per session)
        const trialSignupConversionKey = 'gtag_trial_signup_fired';
        if (!sessionStorage.getItem(trialSignupConversionKey)) {
          sessionStorage.setItem(trialSignupConversionKey, 'true');
          
          // Google Ads conversion
          if (typeof window !== 'undefined' && (window as any).gtag) {
            (window as any).gtag('event', 'conversion', {
              send_to: 'AW-17252974185/0nuHCOXJgOYbEOn87aJA'
            });
            console.log('[Analytics] Google Ads Free Trial Signup conversion fired');
          }
          
          // Meta Pixel conversion
          if (typeof window !== 'undefined' && (window as any).fbq) {
            (window as any).fbq('track', 'CompleteRegistration');
            console.log('[Analytics] Meta Pixel CompleteRegistration conversion fired');
          }
        }
        
        toast({
          title: 'Check your email!',
          description: 'We sent you a verification link to start your free trial.',
        });
      } else {
        // Get user-facing message from error code
        const errorCode = data.code || '';
        const errorInfo = TRIAL_ERROR_MESSAGES[errorCode];
        
        // Log for debugging (always log the actual error code)
        console.log('[Trial] Error code:', errorCode, '- Backend message:', data.error);
        
        if (errorInfo) {
          // Known error - show specific message
          setErrorMessage(`${errorInfo.title} ${errorInfo.description}`);
          toast({
            title: errorInfo.title,
            description: errorInfo.description,
            variant: 'destructive',
          });
        } else {
          // Unknown error - show generic message
          const genericMessage = 'Something went wrong. Please try again.';
          setErrorMessage(genericMessage);
          toast({
            title: 'Something went wrong',
            description: 'Please try again.',
            variant: 'destructive',
          });
        }
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

  const handleContinueClose = () => {
    setContinueOpen(false);
    setTimeout(() => {
      setContinueEmail('');
      setContinueSent(false);
    }, 300);
  };

  const handleContinueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (continueSubmitting) return;
    
    if (!continueEmail || !continueEmail.includes('@')) {
      toast({
        title: 'Email required',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      });
      return;
    }

    setContinueSubmitting(true);

    try {
      // Call /api/trial/resume - the primary endpoint for returning users
      // This never sends email - it's instant resume for verified active trials
      const response = await fetch('/api/trial/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: continueEmail.trim() }),
      });
      
      const data = await response.json();
      
      // Handle error responses (validation errors, server errors)
      if (!data.ok) {
        toast({
          title: 'Something went wrong',
          description: data.error || 'Please try again.',
          variant: 'destructive',
        });
        return;
      }
      
      const action = data.action;

      // Branch by action (RESUME, START, VERIFY_REQUIRED, ENDED)
      if (action === 'RESUME') {
        // Trial can be resumed immediately - no email needed
        toast({
          title: data.courtesyApplied ? 'Welcome back! (+60s bonus)' : 'Welcome back!',
          description: 'Resuming your free trial...',
        });
        handleContinueClose();
        setLocation('/trial/tutor');
        return;
      }
      
      if (action === 'VERIFY_REQUIRED') {
        // Pending trial - need to resend verification email
        // Call /api/trial/start which handles resending for pending trials
        const startResponse = await fetch('/api/trial/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: continueEmail.trim() }),
        });
        const startData = await startResponse.json();
        
        if (startData.ok) {
          setContinueSent(true);
          toast({
            title: 'Verification email sent!',
            description: "Please check your inbox to verify and continue your trial.",
          });
        } else if (startData.code === 'TRIAL_EMAIL_USED') {
          // Edge case: trial was verified between check and resend
          // Call /resume again to set the cookie and get proper status
          const retryResponse = await fetch('/api/trial/resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email: continueEmail.trim() }),
          });
          const retryData = await retryResponse.json();
          
          if (retryData.action === 'RESUME') {
            toast({
              title: 'Trial ready!',
              description: 'Redirecting to your trial...',
            });
            handleContinueClose();
            setLocation('/trial/tutor');
          } else if (retryData.action === 'ENDED') {
            toast({
              title: 'Trial ended',
              description: 'Your trial has ended. Sign up with code WELCOME50 for 50% off!',
              variant: 'destructive',
            });
            handleContinueClose();
          } else {
            toast({
              title: 'Something went wrong',
              description: 'Please try again.',
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: 'Verification required',
            description: startData.error || 'Please check your email to verify your trial.',
          });
        }
        return;
      }
      
      if (action === 'START') {
        // No trial found - start a new one
        const startResponse = await fetch('/api/trial/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: continueEmail.trim() }),
        });
        const startData = await startResponse.json();
        
        if (startData.ok) {
          setContinueSent(true);
          toast({
            title: 'Check your email!',
            description: "We've sent you a verification link to start your trial.",
          });
        } else {
          toast({
            title: 'Something went wrong',
            description: startData.error || 'Please try again.',
            variant: 'destructive',
          });
        }
        return;
      }
      
      if (action === 'ENDED') {
        // Trial expired or exhausted
        toast({
          title: 'Trial ended',
          description: 'Your trial has ended. Sign up with code WELCOME50 for 50% off!',
          variant: 'destructive',
        });
        handleContinueClose();
        return;
      }
      
      // Fallback for unexpected response
      toast({
        title: 'Something went wrong',
        description: data.error || 'Please try again.',
        variant: 'destructive',
      });
    } catch (error) {
      toast({
        title: 'Connection error',
        description: 'Please check your internet connection and try again.',
        variant: 'destructive',
      });
    } finally {
      setContinueSubmitting(false);
    }
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
    <div className="flex flex-col items-center gap-2">
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

      {showContinueLink && (
        <Dialog open={continueOpen} onOpenChange={(o) => o ? setContinueOpen(true) : handleContinueClose()}>
          <DialogTrigger asChild>
            <button
              className="text-sm text-gray-600 hover:text-red-600 hover:underline transition-colors"
              data-testid="link-continue-trial"
            >
              Already started a trial? Continue free trial
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md" data-testid="modal-continue-trial">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-center">
                Continue Your Free Trial
              </DialogTitle>
              <DialogDescription className="text-center">
                Enter your email to resume instantly. If you haven't verified yet, we'll send a verification link.
              </DialogDescription>
            </DialogHeader>

            {!continueSent ? (
              <form onSubmit={handleContinueSubmit} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="continue-trial-email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      id="continue-trial-email"
                      type="email"
                      placeholder="your@email.com"
                      value={continueEmail}
                      onChange={(e) => setContinueEmail(e.target.value)}
                      className="pl-10"
                      disabled={continueSubmitting}
                      data-testid="input-continue-trial-email"
                    />
                  </div>
                </div>
                
                <Button
                  type="submit"
                  className="w-full"
                  disabled={continueSubmitting}
                  data-testid="button-send-continue-link"
                >
                  {continueSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      Continue Trial
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <div className="flex flex-col items-center py-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <p className="text-lg font-semibold text-gray-800 text-center mb-2" data-testid="text-continue-email-sent">
                  Check your inbox!
                </p>
                <p className="text-gray-600 text-center mb-3">
                  We've sent a sign-in link to your email address.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 w-full">
                  <p className="text-sm text-blue-800 text-center">
                    If you don't see it, check your Spam or Junk folder and mark it as "Not Spam."
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setContinueSent(false);
                    setContinueEmail('');
                  }}
                  disabled={resendCooldown > 0}
                  className="w-full"
                  data-testid="button-resend-continue-link"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Try a Different Email'}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
