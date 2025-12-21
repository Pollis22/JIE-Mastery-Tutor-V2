import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, XCircle, Mail } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function RegistrationSuccessPage() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');

  useEffect(() => {
    const MAX_RETRIES = 10;
    const RETRY_DELAY_MS = 2000;
    let retryCount = 0;

    const completeRegistration = async () => {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('session_id');

      if (!sessionId) {
        setStatus('error');
        setError('No session ID found in URL');
        return;
      }

      try {
        const res = await apiRequest("POST", "/api/auth/complete-registration", {
          sessionId
        });

        if (!res.ok) {
          const errorData = await res.json();
          
          // Check if it's a webhook timing issue (account not created yet)
          if (errorData.error === 'Account creation pending' && retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`[Registration Success] Webhook not processed yet, retry ${retryCount}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms`);
            
            // Retry after delay
            setTimeout(() => {
              completeRegistration();
            }, RETRY_DELAY_MS);
            return;
          }
          
          throw new Error(errorData.message || errorData.error || 'Failed to complete registration');
        }

        const data = await res.json();
        console.log('[Registration Success] Account created:', data);

        // Store email for display
        if (data.email) {
          setUserEmail(data.email);
        }

        setStatus('success');

        // Note: User is NOT logged in - they must verify email first

      } catch (error: any) {
        console.error('[Registration Success] Error:', error);
        setStatus('error');
        setError(error.message || 'Failed to complete registration. Please try logging in manually.');
      }
    };

    completeRegistration();
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="text-center">
            {status === 'loading' && 'Completing Registration...'}
            {status === 'success' && 'Welcome to JIE Mastery!'}
            {status === 'error' && 'Registration Error'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center justify-center space-y-4">
            {status === 'loading' && (
              <>
                <Loader2 className="h-16 w-16 text-primary animate-spin" />
                <p className="text-muted-foreground text-center">
                  Please wait while we set up your account...
                </p>
              </>
            )}

            {status === 'success' && (
              <>
                <Mail className="h-16 w-16 text-primary" />
                <div className="text-center space-y-3">
                  <p className="text-lg font-semibold text-foreground">
                    Check your email!
                  </p>
                  <p className="text-muted-foreground">
                    Your account has been created successfully. We've sent a verification link to:
                  </p>
                  {userEmail && (
                    <p className="font-medium text-foreground">
                      {userEmail}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Please click the link in your email to verify your account before logging in.
                  </p>
                </div>
                <Button 
                  onClick={() => setLocation('/auth')} 
                  className="w-full mt-4"
                  data-testid="button-go-to-login"
                >
                  Go to Login
                </Button>
              </>
            )}

            {status === 'error' && (
              <>
                <XCircle className="h-16 w-16 text-destructive" />
                <div className="text-center space-y-2">
                  <p className="text-lg font-semibold text-foreground">
                    Something went wrong
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {error}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <Button 
                    onClick={() => setLocation('/auth')} 
                    variant="outline"
                    className="w-full"
                    data-testid="button-go-to-login"
                  >
                    Go to Login
                  </Button>
                  <Button 
                    onClick={() => window.location.reload()} 
                    className="w-full"
                    data-testid="button-retry"
                  >
                    Retry
                  </Button>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
