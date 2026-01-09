import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mic, MicOff, Clock, AlertCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface TrialStatus {
  hasAccess: boolean;
  reason: string;
  secondsRemaining?: number;
  trialId?: string;
}

export default function TrialTutorPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(300);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);

  useEffect(() => {
    checkTrialStatus();
  }, []);

  useEffect(() => {
    if (!isSessionActive || secondsRemaining <= 0) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          handleTrialExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isSessionActive, secondsRemaining]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isSessionActive && sessionStartTime && trialStatus?.trialId) {
        const secondsUsed = Math.floor((Date.now() - sessionStartTime) / 1000);
        navigator.sendBeacon('/api/trial/end-session', JSON.stringify({
          trialId: trialStatus.trialId,
          secondsUsed,
        }));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSessionActive, sessionStartTime, trialStatus?.trialId]);

  const checkTrialStatus = async () => {
    try {
      const response = await fetch('/api/trial/status', { credentials: 'include' });
      const data = await response.json();
      setTrialStatus(data);
      
      if (!data.hasAccess) {
        if (data.reason === 'trial_expired') {
          setLocation('/trial/ended');
        } else if (data.reason === 'trial_not_found' || data.reason === 'trial_not_verified') {
          setLocation('/benefits');
        }
        return;
      }

      setSecondsRemaining(data.secondsRemaining || 300);
    } catch (error) {
      console.error('Error checking trial status:', error);
      toast({
        title: 'Error',
        description: 'Unable to verify trial status. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTrialExpired = useCallback(async () => {
    setIsSessionActive(false);
    
    if (trialStatus?.trialId && sessionStartTime) {
      const secondsUsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      try {
        await apiRequest('POST', '/api/trial/end-session', {
          trialId: trialStatus.trialId,
          secondsUsed,
        });
      } catch (error) {
        console.error('Error ending trial session:', error);
      }
    }
    
    toast({
      title: 'Trial Ended',
      description: 'Your 5-minute free trial has ended. Create an account to continue!',
    });
    
    setLocation('/trial/ended');
  }, [trialStatus?.trialId, sessionStartTime, setLocation, toast]);

  const startSession = () => {
    setIsSessionActive(true);
    setSessionStartTime(Date.now());
    toast({
      title: 'Session Started',
      description: 'Your trial timer is now running. Talk to your AI tutor!',
    });
  };

  const endSession = async () => {
    setIsSessionActive(false);
    
    if (trialStatus?.trialId && sessionStartTime) {
      const secondsUsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      try {
        await apiRequest('POST', '/api/trial/end-session', {
          trialId: trialStatus.trialId,
          secondsUsed,
        });
        
        const response = await fetch('/api/trial/status', { credentials: 'include' });
        const data = await response.json();
        setTrialStatus(data);
        setSecondsRemaining(data.secondsRemaining || 0);
        
        if (!data.hasAccess) {
          setLocation('/trial/ended');
        }
      } catch (error) {
        console.error('Error ending session:', error);
      }
    }
    
    setSessionStartTime(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-red-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading your trial session...</p>
        </div>
      </div>
    );
  }

  if (!trialStatus?.hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-yellow-600" />
            </div>
            <CardTitle>Trial Not Available</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Please verify your email to start your free trial.
            </p>
            <Button 
              onClick={() => setLocation('/benefits')}
              className="bg-red-600 hover:bg-red-700"
            >
              Start Free Trial
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" data-testid="page-trial-tutor">
      <div className="fixed top-0 left-0 right-0 bg-gradient-to-r from-red-600 to-red-700 text-white py-3 px-4 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5" />
            <span className="font-semibold">Free Trial</span>
          </div>
          <div className="flex items-center gap-4">
            <div className={`text-2xl font-mono font-bold ${secondsRemaining < 60 ? 'animate-pulse text-yellow-300' : ''}`} data-testid="text-trial-timer">
              {formatTime(secondsRemaining)}
            </div>
            <Button 
              variant="secondary"
              size="sm"
              onClick={() => setLocation('/pricing')}
              data-testid="button-upgrade"
            >
              Upgrade Now
            </Button>
          </div>
        </div>
      </div>

      <div className="pt-20 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
          <Card className="shadow-xl">
            <CardHeader className="text-center border-b">
              <CardTitle className="text-2xl font-bold text-red-600">
                JIE Mastery AI Tutor - Free Trial
              </CardTitle>
              <p className="text-gray-600 dark:text-gray-400">
                Experience personalized AI tutoring for {formatTime(secondsRemaining)} more
              </p>
            </CardHeader>
            <CardContent className="p-8">
              <div className="flex flex-col items-center justify-center min-h-[400px]">
                {!isSessionActive ? (
                  <div className="text-center">
                    <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Mic className="w-12 h-12 text-red-600" />
                    </div>
                    <h2 className="text-xl font-semibold mb-4">Ready to Start?</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
                      Click the button below to start your tutoring session. Your timer will begin counting down.
                    </p>
                    <Button
                      onClick={startSession}
                      className="bg-red-600 hover:bg-red-700 text-lg px-8 py-6"
                      data-testid="button-start-session"
                    >
                      <Mic className="w-5 h-5 mr-2" />
                      Start Tutoring Session
                    </Button>
                  </div>
                ) : (
                  <div className="text-center w-full">
                    <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                      <Mic className="w-16 h-16 text-green-600" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">Session Active</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      Your AI tutor is listening. Ask any question about Math, English, or Spanish!
                    </p>
                    
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6 mb-6">
                      <p className="text-sm text-gray-500 mb-2">Try asking:</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {['Help me with fractions', 'What is a noun?', 'How do I say hello in Spanish?'].map((q, i) => (
                          <span key={i} className="bg-white dark:bg-gray-700 px-3 py-1 rounded-full text-sm border">
                            "{q}"
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <Button
                      onClick={endSession}
                      variant="outline"
                      className="border-red-600 text-red-600 hover:bg-red-50"
                      data-testid="button-end-session"
                    >
                      <MicOff className="w-4 h-4 mr-2" />
                      End Session
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Want unlimited tutoring?{' '}
              <button 
                onClick={() => setLocation('/pricing')}
                className="text-red-600 hover:underline font-medium"
              >
                View our plans
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
