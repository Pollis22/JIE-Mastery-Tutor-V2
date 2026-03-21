declare global {
  interface Window {
    fbq: (...args: any[]) => void;
  }
}

import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Clock, CreditCard, ShieldCheck, Eye, EyeOff, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/hooks/use-tracking";

const trialSignupSchema = z.object({
  accountName: z.string().min(2, "Your name is required"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  studentName: z.string().min(1, "Student name is required"),
  studentAge: z.string().optional(),
  gradeLevel: z.string().min(1, "Please select a grade level"),
  primarySubject: z.string().optional(),
});

type TrialSignupForm = z.infer<typeof trialSignupSchema>;

export default function StartTrialPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [wasCancelled, setWasCancelled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("cancelled") === "true") {
      setWasCancelled(true);
    }
  }, [searchString]);

  const form = useForm<TrialSignupForm>({
    resolver: zodResolver(trialSignupSchema),
    defaultValues: {
      accountName: "",
      email: "",
      password: "",
      studentName: "",
      studentAge: "",
      gradeLevel: "",
      primarySubject: "",
    },
  });

  const trialCheckoutMutation = useMutation({
    mutationFn: async (data: TrialSignupForm) => {
      const response = await apiRequest("POST", "/api/checkout/create-trial-session", {
        registrationData: {
          accountName: data.accountName,
          email: data.email,
          password: data.password,
          studentName: data.studentName,
          studentAge: data.studentAge ? parseInt(data.studentAge, 10) : undefined,
          gradeLevel: data.gradeLevel,
          primarySubject: data.primarySubject || undefined,
          marketingOptIn: false,
        },
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(JSON.stringify(errData));
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (typeof window.fbq === "function") {
        window.fbq("track", "InitiateCheckout", {
          content_name: "Free Trial Checkout",
          value: 0,
          currency: "USD",
        });
      }
      trackEvent("trial_checkout_initiated");
      // Redirect to Stripe-hosted checkout
      window.location.href = data.url;
    },
    onError: (error: any) => {
      let message = "Something went wrong. Please try again.";
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.code === "EMAIL_EXISTS") {
          message = "An account with this email already exists. Please log in instead.";
        } else if (parsed.code === "SUBSCRIPTION_EXISTS") {
          message = "This email already has an active subscription. Please log in to manage your account.";
        } else {
          message = parsed.message || parsed.error || message;
        }
      } catch {
        message = error.message || message;
      }
      setServerError(message);
    },
  });

  const onSubmit = (data: TrialSignupForm) => {
    setServerError(null);
    trialCheckoutMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Start Your 30-Minute Trial Free
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            No charge for 30 minutes. A payment method is required to get started.
          </p>
        </div>

        {wasCancelled && (
          <Alert className="mb-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20">
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
              You left the payment page. Complete your details below to try again.
            </AlertDescription>
          </Alert>
        )}

        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl">Create Your Account</CardTitle>
            <CardDescription>
              No charge for your first 30 minutes. Add a payment method to get started.
            </CardDescription>
          </CardHeader>
          <CardContent>

            {serverError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>
                  {serverError}
                  {serverError.includes("log in") && (
                    <a href="/auth" className="ml-2 underline font-medium hover:text-red-300" data-testid="link-login-instead">
                      Go to login
                    </a>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                <FormField
                  control={form.control}
                  name="accountName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Name (or Parent / Guardian)</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane Smith" data-testid="input-account-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="parent@example.com" data-testid="input-email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Create a password (8+ characters)"
                            data-testid="input-password"
                            className="pr-10"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            data-testid="button-toggle-password"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="studentName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Student Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your child's first name" data-testid="input-student-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="studentAge"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Age (Optional)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="Age" min="4" max="99" data-testid="input-student-age" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="gradeLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grade Level</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-grade-level">
                              <SelectValue placeholder="Select grade" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="kindergarten-2">K-2nd Grade</SelectItem>
                            <SelectItem value="grades-3-5">3rd-5th Grade</SelectItem>
                            <SelectItem value="grades-6-8">6th-8th Grade</SelectItem>
                            <SelectItem value="grades-9-12">9th-12th Grade</SelectItem>
                            <SelectItem value="college-adult">College/Adult</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="primarySubject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subject Interest (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-subject">
                            <SelectValue placeholder="Choose a subject" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="math">Math</SelectItem>
                          <SelectItem value="english">English</SelectItem>
                          <SelectItem value="science">Science</SelectItem>
                          <SelectItem value="spanish">Spanish</SelectItem>
                          <SelectItem value="general">General Help</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  disabled={trialCheckoutMutation.isPending}
                  data-testid="button-start-trial"
                >
                  {trialCheckoutMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Redirecting to secure checkout...
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-5 w-5" />
                      Add a Payment Method
                    </>
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-3 gap-4 text-center text-sm">
                <div className="flex flex-col items-center">
                  <Clock className="h-5 w-5 text-blue-600 mb-1" />
                  <span className="text-gray-600 dark:text-gray-400">30 min free</span>
                </div>
                <div className="flex flex-col items-center">
                  <X className="h-5 w-5 text-red-500 mb-1" />
                  <span className="text-gray-600 dark:text-gray-400">Cancel anytime</span>
                </div>
                <div className="flex flex-col items-center">
                  <ShieldCheck className="h-5 w-5 text-green-600 mb-1" />
                  <span className="text-gray-600 dark:text-gray-400">Secured by Stripe</span>
                </div>
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
              After your 30-minute free trial your card will be charged for the Starter plan ($19.99/mo).
              Cancel before the 30 minutes are up and pay nothing.
            </p>

            <p className="mt-3 text-center text-sm text-gray-500 dark:text-gray-400">
              Already have an account?{" "}
              <a href="/auth" className="text-blue-600 hover:underline font-medium" data-testid="link-login">
                Log in
              </a>
            </p>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            By creating an account, you agree to our{" "}
            <a href="/terms" className="text-blue-600 hover:underline">Terms of Service</a>
            {" "}and{" "}
            <a href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</a>
          </p>
        </div>

      </div>
    </div>
  );
}
