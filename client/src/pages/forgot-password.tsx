import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import jieLogo from "@/assets/jie-mastery-logo-new.jpg";
import { ArrowLeft, Mail } from "lucide-react";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const handleSubmit = async (data: ForgotPasswordForm) => {
    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      // Safely parse JSON only if there's content
      let result = {};
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        result = await response.json();
      }

      if (response.ok) {
        setIsSubmitted(true);
        toast({
          title: "Check your email",
          description: (result as any).message || "If an account exists with that email, a password reset link has been sent.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: (result as any).error || "Failed to send reset email",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-center mb-6">
          <img src={jieLogo} alt="JIE Mastery" className="h-12 w-auto" data-testid="img-logo" />
        </div>

        <Card data-testid="card-forgot-password">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2" data-testid="text-title">
              <Mail className="h-6 w-6" data-testid="icon-mail" />
              Reset Your Password
            </CardTitle>
            <CardDescription data-testid="text-description">
              {isSubmitted 
                ? "We've sent you a password reset link"
                : "Enter your email address and we'll send you a link to reset your password"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSubmitted ? (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4" data-testid="alert-success">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Check your email inbox for a password reset link. The link will expire in 1 hour.
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
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            placeholder="your.email@example.com"
                            data-testid="input-reset-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={form.formState.isSubmitting}
                    data-testid="button-send-reset"
                  >
                    {form.formState.isSubmitting ? "Sending..." : "Send Reset Link"}
                  </Button>

                  <Button 
                    type="button"
                    variant="ghost" 
                    onClick={() => setLocation("/auth")} 
                    className="w-full"
                    data-testid="button-cancel-reset"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Login
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
