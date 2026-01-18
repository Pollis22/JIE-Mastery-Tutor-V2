import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, CheckCircle, AlertCircle, ArrowRight, Play } from "lucide-react";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";

export default function MagicLinkPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [status, setStatus] = useState<'validating' | 'success' | 'error' | 'exhausted'>('validating');
  const [errorMessage, setErrorMessage] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const searchParams = new URLSearchParams(searchString);
  const token = searchParams.get('token');

  const validateMutation = useMutation({
    mutationFn: async (magicToken: string) => {
      const res = await apiRequest("POST", "/api/trial/magic-validate", { token: magicToken });
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.ok) {
        setStatus('success');
        setSecondsRemaining(data.secondsRemaining || 0);
        setTimeout(() => {
          setLocation('/trial/tutor');
        }, 2000);
      } else {
        if (data.errorCode === 'trial_exhausted') {
          setStatus('exhausted');
        } else {
          setStatus('error');
        }
        setErrorMessage(data.error || 'An error occurred.');
      }
    },
    onError: (error: any) => {
      if (error?.errorCode === 'trial_exhausted' || error?.message?.includes('ended')) {
        setStatus('exhausted');
        setErrorMessage('Your trial has ended. Please sign up to continue.');
      } else {
        setStatus('error');
        setErrorMessage(error?.message || 'Invalid or expired sign-in link.');
      }
    },
  });

  useEffect(() => {
    if (token) {
      validateMutation.mutate(token);
    } else {
      setStatus('error');
      setErrorMessage('No sign-in token found. Please use the link from your email.');
    }
  }, [token]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={jieLogo} alt="JIE Mastery" className="h-16 w-auto" />
          </div>
          <CardTitle className="text-2xl">
            {status === 'validating' && 'Signing you in...'}
            {status === 'success' && 'Welcome back!'}
            {status === 'error' && 'Sign-in Failed'}
            {status === 'exhausted' && 'Trial Ended'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'validating' && (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-muted-foreground text-center">
                Validating your sign-in link...
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800">Success!</AlertTitle>
                <AlertDescription className="text-green-700">
                  You have {formatTime(secondsRemaining)} remaining in your trial.
                  Redirecting to your tutor session...
                </AlertDescription>
              </Alert>
              <Button 
                className="w-full" 
                onClick={() => setLocation('/trial/tutor')}
                data-testid="button-go-to-tutor"
              >
                <Play className="mr-2 h-4 w-4" />
                Go to Tutor Now
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Unable to Sign In</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Button 
                  className="w-full" 
                  onClick={() => setLocation('/auth')}
                  data-testid="button-request-new-link"
                >
                  Request a New Link
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => setLocation('/')}
                  data-testid="button-go-home"
                >
                  Go to Homepage
                </Button>
              </div>
            </div>
          )}

          {status === 'exhausted' && (
            <div className="space-y-4">
              <Alert className="bg-amber-50 border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">Trial Ended</AlertTitle>
                <AlertDescription className="text-amber-700">
                  Your free trial has ended. Sign up now to continue learning with JIE Mastery!
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Button 
                  className="w-full" 
                  onClick={() => setLocation('/pricing')}
                  data-testid="button-view-plans"
                >
                  View Plans & Pricing
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => setLocation('/auth')}
                  data-testid="button-sign-up"
                >
                  Sign Up / Log In
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
