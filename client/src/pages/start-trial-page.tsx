import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, BookOpen, Clock, Shield, CheckCircle, Mail, RefreshCw, Eye, EyeOff } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const trialSignupSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  studentName: z.string().min(1, "Student name is required"),
  studentAge: z.string().optional(),
  gradeLevel: z.string().min(1, "Please select a grade level"),
  primarySubject: z.string().optional(),
});

type TrialSignupForm = z.infer<typeof trialSignupSchema>;

function getDeviceId(): string {
  const storageKey = 'jie_device_id';
  let deviceId = localStorage.getItem(storageKey);
  if (!deviceId) {
    deviceId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem(storageKey, deviceId);
  }
  return deviceId;
}

export default function StartTrialPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [verificationPending, setVerificationPending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string>("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Check for query params
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const error = params.get('error');
    const verified = params.get('verified');
    
    if (error === 'invalid_token') {
      setServerError('Invalid verification link. Please request a new one.');
    } else if (error === 'expired_token') {
      setServerError('Your verification link has expired. Please request a new one.');
    } else if (error === 'verification_failed') {
      setServerError('Verification failed. Please try again.');
    }
    
    if (verified === '1') {
      toast({
        title: "Email Verified!",
        description: "Your email has been verified. Enjoy your free trial!",
      });
    }
  }, [searchString, toast]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Check if logged in user needs verification
  const { data: user } = useQuery<any>({
    queryKey: ["/api/user"],
  });

  // If user is logged in with unverified trial, show verification screen
  useEffect(() => {
    if (user && user.trialActive && !user.emailVerified) {
      setVerificationPending(true);
      setPendingEmail(user.email);
    } else if (user && user.emailVerified && user.trialActive) {
      // Already verified, redirect to tutor
      navigate('/tutor');
    }
  }, [user, navigate]);

  const form = useForm<TrialSignupForm>({
    resolver: zodResolver(trialSignupSchema),
    defaultValues: {
      email: "",
      password: "",
      studentName: "",
      studentAge: "",
      gradeLevel: "",
      primarySubject: "",
    },
  });

  const trialSignupMutation = useMutation({
    mutationFn: async (data: TrialSignupForm) => {
      const deviceId = getDeviceId();
      const payload = {
        ...data,
        studentAge: data.studentAge ? parseInt(data.studentAge, 10) : undefined,
        deviceId,
      };
      const response = await apiRequest("POST", "/api/auth/trial-signup", payload);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      if (data.warning) {
        setWarning(data.warning);
      }
      
      // Check if verification is required
      if (data.requiresVerification) {
        setVerificationPending(true);
        setPendingEmail(data.user?.email || form.getValues('email'));
        toast({
          title: "Check Your Email",
          description: data.message || "Please verify your email to start your trial.",
        });
      } else if (data.redirect) {
        toast({
          title: "Trial Started!",
          description: "Welcome! You have 30 minutes of free tutoring.",
        });
        setTimeout(() => navigate(data.redirect), 500);
      }
    },
    onError: (error: any) => {
      let errorMessage = "Something went wrong. Please try again.";
      let redirect = null;
      
      try {
        if (error.message) {
          const errorData = JSON.parse(error.message);
          errorMessage = errorData.error || errorMessage;
          redirect = errorData.redirect;
        }
      } catch {
        errorMessage = error.message || errorMessage;
      }
      
      // Make the error message more user-friendly
      if (errorMessage.includes("already registered")) {
        errorMessage = "This email is already registered. Please log in instead, or use a different email.";
      }
      
      setServerError(errorMessage);
      
      if (redirect) {
        setTimeout(() => navigate(redirect), 2000);
      }
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/auth/resend-verification", { email });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Verification Email Sent",
        description: data.message || "Please check your inbox.",
      });
      setResendCooldown(120); // 2 minute cooldown
    },
    onError: (error: any) => {
      let errorMessage = "Failed to resend verification email.";
      try {
        if (error.message) {
          const errorData = JSON.parse(error.message);
          errorMessage = errorData.error || errorMessage;
        }
      } catch {}
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TrialSignupForm) => {
    setServerError(null);
    trialSignupMutation.mutate(data);
  };

  const handleResendVerification = () => {
    if (pendingEmail && resendCooldown === 0) {
      resendVerificationMutation.mutate(pendingEmail);
    }
  };

  // Show verification pending screen
  if (verificationPending) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <Card className="shadow-xl border-0">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
                <Mail className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle className="text-2xl">Check Your Email</CardTitle>
              <CardDescription className="text-base">
                We sent a verification link to:
              </CardDescription>
              <p className="font-medium text-gray-900 dark:text-white mt-2">
                {pendingEmail}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Click the link in your email to verify your account and start your 30-minute free trial.
                </p>
              </div>
              
              <div className="text-center space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Didn't receive the email?
                </p>
                <Button
                  variant="outline"
                  onClick={handleResendVerification}
                  disabled={resendCooldown > 0 || resendVerificationMutation.isPending}
                  className="w-full"
                  data-testid="button-resend-verification"
                >
                  {resendVerificationMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : resendCooldown > 0 ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Resend in {Math.floor(resendCooldown / 60)}:{(resendCooldown % 60).toString().padStart(2, '0')}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Resend Verification Email
                    </>
                  )}
                </Button>
              </div>

              <div className="text-center pt-4 border-t">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Wrong email?{" "}
                  <button
                    onClick={() => {
                      setVerificationPending(false);
                      setPendingEmail("");
                    }}
                    className="text-blue-600 hover:underline font-medium"
                    data-testid="button-use-different-email"
                  >
                    Use a different email
                  </button>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Start Your Free Trial
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            30 minutes of AI tutoring. No credit card required.
          </p>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl">Create Trial Account</CardTitle>
            <CardDescription>
              Get started with your personalized AI tutor
            </CardDescription>
          </CardHeader>
          <CardContent>
            {serverError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>
                  {serverError}
                  {serverError.includes("log in") && (
                    <a 
                      href="/auth" 
                      className="ml-2 underline font-medium hover:text-red-300"
                      data-testid="link-login-instead"
                    >
                      Go to login
                    </a>
                  )}
                </AlertDescription>
              </Alert>
            )}
            
            {warning && (
              <Alert className="mb-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
                <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                  {warning}
                </AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="parent@example.com"
                          data-testid="input-email"
                          {...field}
                        />
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
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
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
                        <Input
                          placeholder="Your child's first name"
                          data-testid="input-student-name"
                          {...field}
                        />
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
                          <Input
                            type="number"
                            placeholder="Age"
                            min="4"
                            max="99"
                            data-testid="input-student-age"
                            {...field}
                          />
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
                  disabled={trialSignupMutation.isPending}
                  data-testid="button-start-trial"
                >
                  {trialSignupMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    "Create Account & Start 30-Minute Trial"
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
                  <Shield className="h-5 w-5 text-green-600 mb-1" />
                  <span className="text-gray-600 dark:text-gray-400">No card needed</span>
                </div>
                <div className="flex flex-col items-center">
                  <BookOpen className="h-5 w-5 text-purple-600 mb-1" />
                  <span className="text-gray-600 dark:text-gray-400">Real tutoring</span>
                </div>
              </div>
            </div>

            <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
              Already have an account?{" "}
              <a
                href="/auth"
                className="text-blue-600 hover:underline font-medium"
                data-testid="link-login"
              >
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
