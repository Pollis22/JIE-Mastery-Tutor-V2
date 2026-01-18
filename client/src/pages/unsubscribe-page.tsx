import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";

export default function UnsubscribePage() {
  const [location] = useLocation();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [isLoading, setIsLoading] = useState(false);
  
  const searchParams = new URLSearchParams(window.location.search);
  const email = searchParams.get('email');

  const handleUnsubscribe = async () => {
    if (!email) {
      setStatus('error');
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest('POST', '/api/unsubscribe', { email });
      setStatus('success');
    } catch (error) {
      console.error('Unsubscribe error:', error);
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <img 
              src={jieLogo} 
              alt="JIE Mastery Logo" 
              className="h-16 w-auto"
            />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            {status === 'pending' && 'Unsubscribe from Marketing Emails'}
            {status === 'success' && 'Successfully Unsubscribed'}
            {status === 'error' && 'Error'}
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {status === 'pending' && (
            <>
              <p className="text-muted-foreground text-center">
                You'll no longer receive promotional emails, but will still get important account updates and receipts.
              </p>
              {email && (
                <p className="text-sm text-center text-muted-foreground">
                  Email: <span className="font-medium">{email}</span>
                </p>
              )}
              <Button 
                onClick={handleUnsubscribe}
                className="w-full"
                disabled={isLoading || !email}
                data-testid="button-confirm-unsubscribe"
              >
                {isLoading ? 'Processing...' : 'Confirm Unsubscribe'}
              </Button>
            </>
          )}
          
          {status === 'success' && (
            <>
              <p className="text-muted-foreground text-center">
                You've been successfully unsubscribed from marketing emails. You can change your email preferences anytime in your account settings.
              </p>
              <Button 
                onClick={() => window.location.href = '/auth'}
                className="w-full"
                data-testid="button-return-home"
              >
                Return to Home
              </Button>
            </>
          )}
          
          {status === 'error' && (
            <>
              <p className="text-muted-foreground text-center">
                {email ? 'There was an error processing your request. Please try again.' : 'Invalid unsubscribe link. Please check your email.'}
              </p>
              <Button 
                onClick={() => window.location.href = '/auth'}
                className="w-full"
                variant="outline"
                data-testid="button-return-home"
              >
                Return to Home
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
