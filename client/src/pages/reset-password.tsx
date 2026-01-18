import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";
import { Lock, Eye, EyeOff, CheckCircle } from "lucide-react";

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const token = searchParams.get("token");
  const { toast } = useToast();
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (!token) {
      toast({
        variant: "destructive",
        title: "Invalid Link",
        description: "This password reset link is invalid or has expired.",
      });
      setTimeout(() => setLocation("/forgot-password"), 2000);
    }
  }, [token, setLocation, toast]);

  const handleSubmit = async (data: ResetPasswordForm) => {
    try {
      const response = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: data.newPassword }),
      });

      // Safely parse JSON only if there's content
      let result = {};
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        result = await response.json();
      }

      if (response.ok) {
        setIsSuccess(true);
        toast({
          title: "Password Reset Successful",
          description: "Your password has been reset. You can now login with your new password.",
        });
        setTimeout(() => setLocation("/auth"), 3000);
      } else {
        toast({
          variant: "destructive",
          title: "Reset Failed",
          description: (result as any).error || "Failed to reset password. The link may have expired.",
        });
        if (response.status === 400) {
          setTimeout(() => setLocation("/forgot-password"), 2000);
        }
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
      });
    }
  };

  if (!token) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-center mb-6">
          <img src={jieLogo} alt="JIE Mastery" className="h-12 w-auto" data-testid="img-logo" />
        </div>

        <Card data-testid="card-reset-password">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2" data-testid="text-title">
              {isSuccess ? (
                <>
                  <CheckCircle className="h-6 w-6 text-green-600" data-testid="icon-success" />
                  Password Reset Complete
                </>
              ) : (
                <>
                  <Lock className="h-6 w-6" data-testid="icon-lock" />
                  Create New Password
                </>
              )}
            </CardTitle>
            <CardDescription data-testid="text-description">
              {isSuccess 
                ? "You can now login with your new password"
                : "Enter your new password below"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSuccess ? (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4" data-testid="alert-success">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Your password has been successfully reset. Redirecting to login...
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
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              type={showPassword ? "text" : "password"}
                              placeholder="Enter new password"
                              className="pr-10"
                              data-testid="input-new-password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              data-testid="button-toggle-password"
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                        <p className="text-sm text-muted-foreground" data-testid="text-password-hint">
                          Must be at least 8 characters
                        </p>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              type={showConfirmPassword ? "text" : "password"}
                              placeholder="Confirm new password"
                              className="pr-10"
                              data-testid="input-confirm-password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              data-testid="button-toggle-confirm-password"
                            >
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={form.formState.isSubmitting}
                    data-testid="button-reset-password"
                  >
                    {form.formState.isSubmitting ? "Resetting Password..." : "Reset Password"}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
