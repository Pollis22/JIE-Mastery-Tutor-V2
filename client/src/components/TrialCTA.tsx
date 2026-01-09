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
import { apiRequest } from '@/lib/queryClient';

interface TrialCTAProps {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function TrialCTA({ variant = 'primary', size = 'md', className = '' }: TrialCTAProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiRequest('POST', '/api/trial/start', { email });
      const data = await response.json();

      if (data.ok) {
        setEmailSent(true);
        toast({
          title: 'Check your email!',
          description: 'We sent you a verification link to start your free trial.',
        });
      } else {
        toast({
          title: 'Unable to start trial',
          description: data.error || 'Please try again later.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Connection error',
        description: 'Please check your internet connection and try again.',
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
            <p className="text-gray-600 text-center mb-4">
              Check your inbox for the verification email from JIE Mastery.
            </p>
            <p className="text-sm text-gray-500 text-center">
              Didn't receive it? Check your spam folder or{' '}
              <button 
                onClick={() => setEmailSent(false)}
                className="text-red-600 hover:underline"
                data-testid="link-try-again"
              >
                try again
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
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  disabled={isSubmitting}
                  data-testid="input-trial-email"
                />
              </div>
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
