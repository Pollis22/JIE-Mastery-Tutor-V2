import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type VerifyStatus = 'verifying' | 'success' | 'error' | 'expired';

export default function TrialVerifyPage() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<VerifyStatus>('verifying');
  const [message, setMessage] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setStatus('error');
      setMessage('No verification token provided.');
      return;
    }

    verifyToken(token);
  }, []);

  const verifyToken = async (token: string) => {
    try {
      // Use fetch directly to handle non-2xx responses without throwing
      const response = await fetch('/api/trial/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'include',
      });
      
      const data = await response.json();

      if (data.ok) {
        setStatus('success');
        setSecondsRemaining(data.secondsRemaining || 300);
        setMessage('Your email is verified! Redirecting to your trial...');
        
        // Fire Google Ads "Free Trial Started" conversion (idempotent - once per session)
        const trialConversionKey = 'gtag_trial_started_fired';
        if (!sessionStorage.getItem(trialConversionKey)) {
          sessionStorage.setItem(trialConversionKey, 'true');
          if (typeof window !== 'undefined' && (window as any).gtag) {
            (window as any).gtag('event', 'conversion', {
              send_to: 'AW-17252974185/REPLACE_WITH_LABEL'
            });
            console.log('[Analytics] Google Ads Free Trial Started conversion fired');
          }
        }
        
        setTimeout(() => {
          setLocation('/trial/tutor');
        }, 2000);
      } else {
        if (data.errorCode === 'expired_token') {
          setStatus('expired');
          setMessage(data.error || 'Verification link has expired.');
        } else {
          setStatus('error');
          setMessage(data.error || 'Verification failed. Please try again.');
        }
      }
    } catch (error) {
      console.error('Verification error:', error);
      setStatus('error');
      setMessage('Network error. Please check your connection and try again.');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4" data-testid="page-trial-verify">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <h1 className="text-3xl font-bold text-red-600">JIE Mastery</h1>
          </div>
          <CardTitle data-testid="text-title">
            {status === 'verifying' && 'Verifying Your Email...'}
            {status === 'success' && 'Email Verified!'}
            {status === 'error' && 'Verification Failed'}
            {status === 'expired' && 'Link Expired'}
          </CardTitle>
          <CardDescription>
            {status === 'verifying' && 'Please wait while we verify your email address.'}
            {status === 'success' && 'Your free trial is ready!'}
            {status === 'error' && message}
            {status === 'expired' && message}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="flex flex-col items-center">
          {status === 'verifying' && (
            <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
          )}
          
          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                {formatTime(secondsRemaining)} of free tutoring
              </p>
              <p className="text-gray-600 dark:text-gray-400 text-center mb-4">
                Redirecting you to your AI tutor...
              </p>
              <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
            </>
          )}
          
          {status === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
              <div className="flex flex-col gap-3 w-full">
                <Button 
                  onClick={() => setLocation('/benefits')}
                  className="w-full bg-red-600 hover:bg-red-700"
                  data-testid="button-try-again"
                >
                  Try Again
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setLocation('/')}
                  className="w-full"
                  data-testid="button-go-home"
                >
                  Go Home
                </Button>
              </div>
            </>
          )}
          
          {status === 'expired' && (
            <>
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-yellow-600" />
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-center mb-4">
                The verification link has expired. Please request a new trial.
              </p>
              <div className="flex flex-col gap-3 w-full">
                <Button 
                  onClick={() => setLocation('/benefits')}
                  className="w-full bg-red-600 hover:bg-red-700"
                  data-testid="button-new-trial"
                >
                  Request New Trial
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
