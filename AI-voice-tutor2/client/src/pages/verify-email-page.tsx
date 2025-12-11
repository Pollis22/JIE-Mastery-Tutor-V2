import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { Loader2, CheckCircle, XCircle, Mail, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Manually parse query parameters from URL
  const getQueryParam = (param: string): string | null => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get(param);
  };
  
  const token = getQueryParam('token');
  
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'expired'>('verifying');
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (token) {
      verifyEmail(token);
    } else {
      setStatus('error');
      setMessage('No verification token provided');
    }
  }, [token]);

  const verifyEmail = async (token: string) => {
    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setMessage(data.message || 'Email verified successfully!');
        
        // Redirect to login after 3 seconds
        setTimeout(() => {
          setLocation('/auth?verified=true');
        }, 3000);
      } else {
        if (data.expired) {
          setStatus('expired');
          setMessage(data.error);
        } else {
          setStatus('error');
          setMessage(data.error || 'Verification failed');
        }
      }
    } catch (error) {
      console.error('Verification error:', error);
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  const handleResendVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast({
        title: 'Email required',
        description: 'Please enter your email address',
        variant: 'destructive'
      });
      return;
    }
    
    setResending(true);
    
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: 'Verification email sent',
          description: data.message || 'Please check your inbox.',
        });
        setEmail('');
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to resend email',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Network error',
        description: 'Please try again later.',
        variant: 'destructive'
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4" data-testid="page-verify-email">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <h1 className="text-3xl font-bold text-red-600">🎓 JIE Mastery</h1>
          </div>
          <CardTitle data-testid="text-title">Email Verification</CardTitle>
          <CardDescription data-testid="text-description">
            {status === 'verifying' && 'Verifying your email address...'}
            {status === 'success' && 'Your email has been verified!'}
            {status === 'error' && 'Verification failed'}
            {status === 'expired' && 'Verification link expired'}
          </CardDescription>
        </CardHeader>

        <CardContent className="text-center">
          {status === 'verifying' && (
            <>
              <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-4" data-testid="icon-loading" />
              <p className="text-gray-600 dark:text-gray-400" data-testid="text-loading-message">
                Please wait while we verify your email address.
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" data-testid="icon-success" />
              <h2 className="text-2xl font-semibold text-green-600 mb-2" data-testid="text-success-title">
                Email Verified! ✅
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4" data-testid="text-success-message">
                {message}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500" data-testid="text-redirect-notice">
                Redirecting to login...
              </p>
            </>
          )}

          {(status === 'error' || status === 'expired') && (
            <>
              {status === 'expired' ? (
                <AlertCircle className="w-16 h-16 text-orange-600 mx-auto mb-4" data-testid="icon-expired" />
              ) : (
                <XCircle className="w-16 h-16 text-red-600 mx-auto mb-4" data-testid="icon-error" />
              )}
              <h2 className="text-2xl font-semibold text-red-600 mb-2" data-testid="text-error-title">
                {status === 'expired' ? 'Token Expired' : 'Verification Failed'}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6" data-testid="text-error-message">
                {message}
              </p>

              {/* Resend Verification Form */}
              <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <div className="flex justify-center mb-3">
                  <Mail className="w-8 h-8 text-gray-600 dark:text-gray-400" />
                </div>
                <h3 className="font-semibold mb-2 text-gray-800 dark:text-gray-200" data-testid="text-resend-title">
                  Need a new verification link?
                </h3>
                <form onSubmit={handleResendVerification} className="space-y-4">
                  <div className="space-y-2 text-left">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={resending}
                      data-testid="input-email"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={resending}
                    data-testid="button-resend"
                  >
                    {resending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Resend Verification Email'
                    )}
                  </Button>
                </form>
              </div>

              <div className="mt-6">
                <Link href="/auth" data-testid="link-back-to-login">
                  <Button variant="outline" className="w-full">
                    Back to Login
                  </Button>
                </Link>
              </div>
            </>
          )}

          {status === 'success' && (
            <div className="mt-6">
              <Link href="/auth" data-testid="link-go-to-login">
                <Button className="w-full">
                  Go to Login
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
