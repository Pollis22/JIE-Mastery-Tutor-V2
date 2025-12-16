import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Mail, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function VerificationBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  
  if (!user || user.emailVerified) {
    return null;
  }
  
  const handleResend = async () => {
    setResending(true);
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setResent(true);
        toast({
          title: 'Email Sent',
          description: 'Verification email sent! Please check your inbox.',
        });
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to resend email',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to resend verification email',
        variant: 'destructive',
      });
    }
    setResending(false);
  };
  
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3" data-testid="verification-banner">
      <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-amber-600" />
          <div>
            <p className="text-amber-800 font-medium">
              Please verify your email address
            </p>
            <p className="text-amber-700 text-sm">
              Check your inbox for a verification link to activate your account.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {resent ? (
            <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
              <CheckCircle className="h-4 w-4" />
              Email sent! Check your inbox.
            </span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResend}
              disabled={resending}
              className="border-amber-300 text-amber-800 hover:bg-amber-100"
              data-testid="button-resend-verification"
            >
              {resending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Resend verification email'
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
