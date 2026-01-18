import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const token = searchParams.get("token");
  const { toast } = useToast();
  
  const [isVerifying, setIsVerifying] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setIsVerifying(false);
        setErrorMessage("Invalid verification link");
        return;
      }

      try {
        const response = await fetch(`/api/auth/verify-email?token=${token}`);
        
        // Safely parse JSON only if there's content
        let result = {};
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          result = await response.json();
        }

        if (response.ok) {
          setIsSuccess(true);
          toast({
            title: "Email Verified!",
            description: "Your email has been successfully verified. You can now login.",
          });
          setTimeout(() => setLocation("/auth"), 3000);
        } else {
          setErrorMessage((result as any).error || "Verification failed. The link may have expired.");
          toast({
            variant: "destructive",
            title: "Verification Failed",
            description: (result as any).error || "The verification link is invalid or has expired.",
          });
        }
      } catch (error) {
        setErrorMessage("An unexpected error occurred. Please try again.");
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to verify email. Please try again.",
        });
      } finally {
        setIsVerifying(false);
      }
    };

    verifyEmail();
  }, [token, setLocation, toast]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-center mb-6">
          <img src={jieLogo} alt="JIE Mastery" className="h-12 w-auto" data-testid="img-logo" />
        </div>

        <Card data-testid="card-verify-email">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2" data-testid="text-title">
              {isVerifying ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" data-testid="icon-loading" />
                  Verifying Email
                </>
              ) : isSuccess ? (
                <>
                  <CheckCircle className="h-6 w-6 text-green-600" data-testid="icon-success" />
                  Email Verified
                </>
              ) : (
                <>
                  <XCircle className="h-6 w-6 text-red-600" data-testid="icon-error" />
                  Verification Failed
                </>
              )}
            </CardTitle>
            <CardDescription data-testid="text-description">
              {isVerifying 
                ? "Please wait while we verify your email address..."
                : isSuccess 
                ? "Your email has been successfully verified"
                : "There was a problem verifying your email"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isVerifying ? (
              <div className="flex justify-center py-8" data-testid="loader-verifying">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
            ) : isSuccess ? (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4" data-testid="alert-success">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Your email has been verified! You can now access all features. Redirecting to login...
                  </p>
                </div>
                <Button 
                  onClick={() => setLocation("/auth")} 
                  className="w-full"
                  data-testid="button-go-to-login"
                >
                  Go to Login
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4" data-testid="alert-error">
                  <p className="text-sm text-red-800 dark:text-red-200" data-testid="text-error-message">
                    {errorMessage}
                  </p>
                </div>
                <Button 
                  onClick={() => setLocation("/auth")} 
                  className="w-full"
                  data-testid="button-back-to-login"
                >
                  Back to Login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
