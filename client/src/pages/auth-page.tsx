import { useAuth } from "@/hooks/use-auth";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Mail, FileText, Upload, Scan, Users, TrendingUp, ChevronDown, Bot, BookOpen, Sparkles, CheckCircle, AlertCircle, Info, Play, Mic, FileImage, GraduationCap, ArrowRight, X, Shield, Brain, MessageCircle, Heart, Clock, DollarSign, HelpCircle, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/footer";
import { PublicMobileMenu } from "@/components/PublicMobileMenu";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";
import studentUsingJie from "@/assets/student-using-jie.png";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StartTrialButton } from "@/components/StartTrialButton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const loginSchema = z.object({
  email: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  plan: z.enum(['starter', 'standard', 'pro', 'elite'], {
    required_error: "Please select a subscription plan"
  }),
  accountName: z.string().min(1, "Account name is required"),
  studentName: z.string().min(1, "Student name is required"),
  studentAge: z.coerce.number().min(5, "Student must be at least 5 years old").max(99, "Please enter a valid age"),
  gradeLevel: z.enum(['kindergarten-2', 'grades-3-5', 'grades-6-8', 'grades-9-12', 'college-adult'], {
    required_error: "Please select a grade level"
  }),
  primarySubject: z.enum(['math', 'english', 'science', 'spanish', 'general'], {
    required_error: "Please select a primary subject"
  }),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  marketingOptIn: z.boolean().default(false),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [continueTrialOpen, setContinueTrialOpen] = useState(false);
  const [continueTrialEmail, setContinueTrialEmail] = useState('');
  const [continueTrialSent, setContinueTrialSent] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  
  const searchParams = new URLSearchParams(searchString);
  const verificationStatus = searchParams.get('verified');
  const verificationReason = searchParams.get('reason');
  const preselectedPlan = searchParams.get('plan');
  const actionParam = searchParams.get('action');

  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const resendVerificationMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/auth/resend-verification", { email });
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.status === "already_verified") {
        setUnverifiedEmail(null);
        toast({
          title: "Already Verified",
          description: "This email is already verified. Please log in.",
        });
        return;
      }
      if (data.status === "cooldown" && data.retryInSeconds) {
        setResendCooldown(data.retryInSeconds);
        toast({
          title: "Please wait",
          description: data.message || `Please wait ${data.retryInSeconds} seconds.`,
        });
        return;
      }
      setResendCooldown(60);
      toast({
        title: "Verification email sent!",
        description: "Please check your inbox for the verification link.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send verification email",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const continueTrialMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/trial/magic-link", { email });
      return await res.json();
    },
    onSuccess: (data) => {
      setContinueTrialSent(true);
    },
    onError: (error: any) => {
      const code = error?.code || '';
      if (code === 'NOT_VERIFIED') {
        toast({
          title: "Email not verified",
          description: "We've resent your verification email. Please check your inbox.",
        });
      } else if (code === 'TRIAL_EXHAUSTED') {
        toast({
          title: "Trial ended",
          description: "Your trial has ended. Please sign up to continue using JIE Mastery.",
          variant: "destructive",
        });
        setContinueTrialOpen(false);
        setLocation('/pricing');
      } else {
        toast({
          title: "Something went wrong",
          description: error.message || "Please try again later.",
          variant: "destructive",
        });
      }
    },
  });

  const handleContinueTrial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!continueTrialEmail.trim()) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }
    continueTrialMutation.mutate(continueTrialEmail.trim().toLowerCase());
  };

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      plan: undefined,
      accountName: "",
      studentName: "",
      studentAge: 10,
      gradeLevel: undefined,
      primarySubject: undefined,
      email: "",
      password: "",
      marketingOptIn: false,
    },
  });

  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  useEffect(() => {
    if (actionParam === 'register') {
      setRegisterModalOpen(true);
      if (preselectedPlan && ['starter', 'standard', 'pro', 'elite'].includes(preselectedPlan)) {
        registerForm.setValue('plan', preselectedPlan as 'starter' | 'standard' | 'pro' | 'elite');
      }
    } else if (actionParam === 'login') {
      setLoginModalOpen(true);
    }
  }, [actionParam, preselectedPlan, registerForm]);

  const handleLogin = async (data: LoginForm) => {
    try {
      setUnverifiedEmail(null);
      await loginMutation.mutateAsync(data);
      setLoginModalOpen(false);
    } catch (error: any) {
      if (error.requiresVerification && error.email) {
        setUnverifiedEmail(error.email);
      } else if (error.message && (error.message.includes("verify your email") || error.message.includes("verification"))) {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailPattern.test(data.email)) {
          setUnverifiedEmail(data.email);
        }
      }
    }
  };

  const createCheckoutSessionMutation = useMutation({
    mutationFn: async (data: RegisterForm) => {
      const res = await apiRequest("POST", "/api/checkout/create-registration-session", {
        plan: data.plan,
        registrationData: {
          accountName: data.accountName,
          studentName: data.studentName,
          studentAge: data.studentAge,
          gradeLevel: data.gradeLevel,
          primarySubject: data.primarySubject,
          email: data.email,
          password: data.password,
          marketingOptIn: data.marketingOptIn,
        }
      });
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Registration failed",
        description: error.message || "Failed to create checkout session. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleRegister = async (data: RegisterForm) => {
    try {
      await createCheckoutSessionMutation.mutateAsync(data);
    } catch (error) {
      console.error('[FORM] Registration error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Bar */}
      <nav className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <img src={jieLogo} alt="JIE Mastery" className="h-10 w-auto" />
              <span className="text-xl font-bold text-foreground">JIE Mastery Tutor</span>
            </div>
            <div className="hidden md:flex items-center space-x-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setLocation("/benefits")} 
                data-testid="button-nav-benefits"
              >
                Why JIE Mastery
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setLocation("/demo")} 
                data-testid="button-nav-demo"
              >
                Demo
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setLocation("/pricing")} 
                data-testid="button-nav-pricing"
              >
                Pricing
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setLocation("/faq")} 
                data-testid="button-nav-faq"
              >
                FAQ
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setLocation("/schools")} 
                data-testid="button-nav-schools"
              >
                AI Tutoring for Schools
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setLocation("/contact")} 
                data-testid="button-nav-contact"
              >
                Contact
              </Button>
              <div className="w-px h-6 bg-border mx-2" />
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setLoginModalOpen(true)}
                data-testid="button-nav-login"
              >
                Sign In
              </Button>
            </div>
            <PublicMobileMenu onSignIn={() => setLoginModalOpen(true)} />
          </div>
        </div>
      </nav>

      {/* Login Modal */}
      <Dialog open={loginModalOpen} onOpenChange={setLoginModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img src={jieLogo} alt="JIE Mastery" className="h-8 w-auto" />
              Sign In
            </DialogTitle>
            <DialogDescription>
              Welcome back! Sign in to continue your learning journey.
            </DialogDescription>
          </DialogHeader>
          <Form {...loginForm}>
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <FormField
                control={loginForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email or Username</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="your@email.com" data-testid="input-modal-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={loginForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input 
                          type={showLoginPassword ? "text" : "password"} 
                          {...field} 
                          className="pr-10"
                          data-testid="input-modal-password" 
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword(!showLoginPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showLoginPassword ? "Hide password" : "Show password"}
                        >
                          {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                disabled={loginMutation.isPending}
                data-testid="button-modal-login"
              >
                {loginMutation.isPending ? "Signing in..." : "Sign In"}
              </Button>
              
              {unverifiedEmail && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-amber-900 dark:text-amber-100">Email Not Verified</h4>
                      <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                        Please check your inbox and click the verification link we sent to <strong>{unverifiedEmail}</strong>
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => resendVerificationMutation.mutate(unverifiedEmail)}
                    disabled={resendVerificationMutation.isPending || resendCooldown > 0}
                    className="w-full border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                    data-testid="button-resend-verification-login"
                  >
                    {resendVerificationMutation.isPending ? "Sending..." : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Verification Email"}
                  </Button>
                </div>
              )}
              
              <div className="text-center space-y-3">
                <button 
                  type="button"
                  onClick={() => {
                    setLoginModalOpen(false);
                    setLocation("/forgot-password");
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                  data-testid="link-modal-forgot-password"
                >
                  Forgot your password?
                </button>
                
                <div className="border-t border-border pt-3">
                  <div className="text-sm text-muted-foreground text-center">
                    New to JIE Mastery?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setLoginModalOpen(false);
                        setRegisterModalOpen(true);
                      }}
                      className="text-primary hover:underline font-medium"
                      data-testid="link-modal-create-account"
                    >
                      Create your account
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Continue Trial Dialog */}
      <Dialog open={continueTrialOpen} onOpenChange={setContinueTrialOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-primary" />
              Continue Your Trial
            </DialogTitle>
            <DialogDescription>
              Enter the email you used to start your trial, and we'll send you a magic link to continue.
            </DialogDescription>
          </DialogHeader>
          {!continueTrialSent ? (
            <form onSubmit={handleContinueTrial} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="continue-trial-email">Email Address</Label>
                <Input
                  id="continue-trial-email"
                  type="email"
                  placeholder="your@email.com"
                  value={continueTrialEmail}
                  onChange={(e) => setContinueTrialEmail(e.target.value)}
                  data-testid="input-continue-trial-email"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={continueTrialMutation.isPending}
                data-testid="button-continue-trial-submit"
              >
                {continueTrialMutation.isPending ? "Sending..." : "Send Magic Link"}
              </Button>
            </form>
          ) : (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
                <Mail className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Check Your Email!</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  We've sent a magic link to <strong>{continueTrialEmail}</strong>. 
                  Click the link to continue your trial.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setContinueTrialOpen(false);
                  setContinueTrialSent(false);
                  setContinueTrialEmail('');
                }}
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Registration Modal */}
      <Dialog open={registerModalOpen} onOpenChange={setRegisterModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img src={jieLogo} alt="JIE Mastery" className="h-8 w-auto" />
              Create Your Account
            </DialogTitle>
            <DialogDescription>
              Complete your registration to start your learning journey.
            </DialogDescription>
          </DialogHeader>
          <Form {...registerForm}>
            <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
              <FormField
                control={registerForm.control}
                name="plan"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subscription Plan</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-modal-plan">
                          <SelectValue placeholder="Select a plan" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="starter">Starter - $29/month (300 min)</SelectItem>
                        <SelectItem value="standard">Standard - $69/month (800 min)</SelectItem>
                        <SelectItem value="pro">Pro - $119/month (1500 min)</SelectItem>
                        <SelectItem value="elite">Elite - $199/month (3000 min)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={registerForm.control}
                  name="accountName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your full name" {...field} data-testid="input-modal-account-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={registerForm.control}
                  name="studentName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Student Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Student's name" {...field} data-testid="input-modal-student-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={registerForm.control}
                  name="studentAge"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Student Age</FormLabel>
                      <FormControl>
                        <Input type="number" min={5} max={99} {...field} data-testid="input-modal-student-age" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={registerForm.control}
                  name="gradeLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grade Level</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-modal-grade">
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
                control={registerForm.control}
                name="primarySubject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Subject</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-modal-subject">
                          <SelectValue placeholder="Select subject" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="math">Math</SelectItem>
                        <SelectItem value="english">English</SelectItem>
                        <SelectItem value="science">Science</SelectItem>
                        <SelectItem value="spanish">Spanish</SelectItem>
                        <SelectItem value="general">General (All Subjects)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={registerForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="your@email.com" {...field} data-testid="input-modal-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={registerForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Min 8 characters" {...field} data-testid="input-modal-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full" 
                disabled={createCheckoutSessionMutation.isPending}
                data-testid="button-modal-register"
              >
                {createCheckoutSessionMutation.isPending ? "Processing..." : "Continue to Payment"}
              </Button>
              
              <p className="text-xs text-muted-foreground text-center">
                You'll be redirected to Stripe to complete payment securely.
              </p>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Verification Status Messages */}
      {verificationStatus && (
        <div className="container mx-auto px-4 pt-4">
          <div className="max-w-2xl mx-auto">
            {verificationStatus === 'success' && (
              <Alert className="bg-green-50 border-green-200" data-testid="alert-verification-success">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800">Email Verified Successfully!</AlertTitle>
                <AlertDescription className="text-green-700">
                  Your email has been verified. You can now{' '}
                  <button 
                    onClick={() => setLoginModalOpen(true)} 
                    className="underline font-medium hover:text-green-900"
                  >
                    sign in
                  </button>{' '}
                  and start learning.
                </AlertDescription>
              </Alert>
            )}
            {verificationStatus === 'already' && (
              <Alert className="bg-blue-50 border-blue-200" data-testid="alert-verification-already">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-800">Email Already Verified</AlertTitle>
                <AlertDescription className="text-blue-700">
                  Your email is already verified. Please{' '}
                  <button 
                    onClick={() => setLoginModalOpen(true)} 
                    className="underline font-medium hover:text-blue-900"
                  >
                    sign in
                  </button>{' '}
                  to continue.
                </AlertDescription>
              </Alert>
            )}
            {verificationStatus === 'error' && (
              <Alert variant="destructive" data-testid="alert-verification-error">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Verification Failed</AlertTitle>
                <AlertDescription>
                  {verificationReason === 'invalid_token' 
                    ? 'This verification link is invalid. Please request a new verification email.' 
                    : verificationReason === 'missing_token'
                    ? 'No verification token found. Please use the link from your email.'
                    : 'An error occurred during verification. Please try again or request a new verification email.'}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      )}

      {/* HERO SECTION - Conversion Focused */}
      <section className="py-12 lg:py-20 bg-gradient-to-b from-background to-muted/20">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center max-w-7xl mx-auto">
            {/* Left Column - Copy */}
            <div className="space-y-6 text-center lg:text-left order-2 lg:order-1">
              {/* Emotional Headline */}
              <h1 className="text-4xl md:text-5xl lg:text-5xl xl:text-6xl font-bold text-foreground leading-tight">
                End Homework Stress.{' '}
                <span className="text-primary">Real Learning Starts Here.</span>
              </h1>
              
              {/* Clarifying Subheadline */}
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                A patient, voice-based AI tutor that <strong>guides</strong> your child through problems — 
                never gives away answers. One subscription covers your whole family.
              </p>

              {/* Primary CTA */}
              <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-4 pt-2" data-testid="hero-cta-container">
                <StartTrialButton 
                  size="lg" 
                  className="px-10 py-7 text-xl font-bold rounded-xl shadow-xl hover:shadow-2xl transition-all w-full sm:w-auto h-auto" 
                  showSubtext 
                />
              </div>
              
              {/* Trust Signals */}
              <p className="text-sm text-muted-foreground">
                No credit card required &bull; 30 minutes free &bull; Works on any device
              </p>

              {/* Secondary Action */}
              <p className="text-sm text-muted-foreground">
                Already have an account?{' '}
                <button 
                  onClick={() => setLoginModalOpen(true)}
                  className="text-primary hover:underline font-medium"
                  data-testid="link-hero-signin"
                >
                  Sign in
                </button>
              </p>
            </div>
            
            {/* Right Column - Student Image */}
            <div className="order-1 lg:order-2">
              <div className="relative">
                <img 
                  src={studentUsingJie} 
                  alt="Student using JIE Mastery on laptop for homework help" 
                  className="w-full max-h-[400px] object-cover object-top rounded-2xl shadow-2xl"
                  data-testid="img-hero-student"
                />
                <p className="text-xs text-muted-foreground text-center mt-3 italic">
                  Real students. Real homework. Real learning.
                </p>
              </div>
            </div>
          </div>
          
          {/* Video Preview - Below hero content */}
          <div className="max-w-4xl mx-auto mt-16">
            <div 
              className="relative w-full rounded-2xl overflow-hidden shadow-2xl border border-border"
              style={{ aspectRatio: '16/9' }}
              data-testid="video-hero-container"
            >
              <iframe 
                className="absolute top-0 left-0 w-full h-full"
                src="https://www.youtube.com/embed/e8WgxSMhnGY" 
                title="See How JIE Mastery Tutoring Works" 
                frameBorder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                referrerPolicy="strict-origin-when-cross-origin" 
                allowFullScreen
                data-testid="video-hero-youtube"
              />
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF SECTION */}
      <section className="py-16 bg-card border-y border-border">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-bold text-foreground text-center mb-4">
              What Parents Are Saying
            </h2>
            <p className="text-center text-muted-foreground mb-12">
              Join families who've found a better way to support their kids' learning
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Testimonial 1 */}
              <Card className="bg-background border-border shadow-md">
                <CardContent className="pt-6 pb-6 px-6">
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <p className="text-muted-foreground mb-4 italic">
                    "My daughter went from crying over math homework to actually <strong>enjoying</strong> problem-solving. 
                    The tutor is so patient — it never makes her feel stupid for not understanding."
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="text-primary font-semibold">S</span>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">Sarah M.</p>
                      <p className="text-xs text-muted-foreground">Mom of 3rd grader</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Testimonial 2 */}
              <Card className="bg-background border-border shadow-md">
                <CardContent className="pt-6 pb-6 px-6">
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <p className="text-muted-foreground mb-4 italic">
                    "As a homeschool mom, I was drowning trying to teach everything myself. 
                    Now my kids get real tutoring help and I finally have time to breathe."
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center">
                      <span className="text-blue-500 font-semibold">J</span>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">Jennifer R.</p>
                      <p className="text-xs text-muted-foreground">Homeschool parent, 2 kids</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Testimonial 3 */}
              <Card className="bg-background border-border shadow-md">
                <CardContent className="pt-6 pb-6 px-6">
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <p className="text-muted-foreground mb-4 italic">
                    "I was worried it would just give answers like ChatGPT. But it actually makes my son 
                    <strong> think through the problem</strong>. His confidence has skyrocketed."
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center">
                      <span className="text-green-500 font-semibold">M</span>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">Michael T.</p>
                      <p className="text-xs text-muted-foreground">Dad of 7th grader</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* THIS IS NOT CHATGPT SECTION */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <span className="inline-block text-sm font-semibold text-primary uppercase tracking-wide bg-primary/10 px-4 py-2 rounded-full mb-4">
                Built for Real Learning
              </span>
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
                This is <span className="text-primary">NOT</span> ChatGPT
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                We built JIE Mastery specifically for students who need to <strong>learn</strong>, 
                not just get answers. Here's how we're different:
              </p>
            </div>

            {/* Comparison Table */}
            <div className="bg-card rounded-2xl border border-border shadow-lg overflow-hidden">
              <div className="grid grid-cols-4 text-center font-semibold bg-muted/50 border-b border-border">
                <div className="p-4"></div>
                <div className="p-4 text-muted-foreground">ChatGPT</div>
                <div className="p-4 text-muted-foreground">YouTube</div>
                <div className="p-4 text-primary">JIE Mastery</div>
              </div>
              
              {/* Row 1 */}
              <div className="grid grid-cols-4 text-center border-b border-border">
                <div className="p-4 text-left font-medium text-foreground bg-muted/20">Gives instant answers?</div>
                <div className="p-4"><CheckCircle className="w-5 h-5 text-red-500 mx-auto" /></div>
                <div className="p-4"><X className="w-5 h-5 text-muted-foreground mx-auto" /></div>
                <div className="p-4"><X className="w-5 h-5 text-green-500 mx-auto" /></div>
              </div>
              
              {/* Row 2 */}
              <div className="grid grid-cols-4 text-center border-b border-border">
                <div className="p-4 text-left font-medium text-foreground bg-muted/20">Guides with questions?</div>
                <div className="p-4"><X className="w-5 h-5 text-muted-foreground mx-auto" /></div>
                <div className="p-4"><X className="w-5 h-5 text-muted-foreground mx-auto" /></div>
                <div className="p-4"><CheckCircle className="w-5 h-5 text-green-500 mx-auto" /></div>
              </div>
              
              {/* Row 3 */}
              <div className="grid grid-cols-4 text-center border-b border-border">
                <div className="p-4 text-left font-medium text-foreground bg-muted/20">Voice conversations?</div>
                <div className="p-4"><X className="w-5 h-5 text-muted-foreground mx-auto" /></div>
                <div className="p-4"><X className="w-5 h-5 text-muted-foreground mx-auto" /></div>
                <div className="p-4"><CheckCircle className="w-5 h-5 text-green-500 mx-auto" /></div>
              </div>
              
              {/* Row 4 */}
              <div className="grid grid-cols-4 text-center border-b border-border">
                <div className="p-4 text-left font-medium text-foreground bg-muted/20">Age-appropriate tutoring?</div>
                <div className="p-4"><X className="w-5 h-5 text-muted-foreground mx-auto" /></div>
                <div className="p-4"><X className="w-5 h-5 text-muted-foreground mx-auto" /></div>
                <div className="p-4"><CheckCircle className="w-5 h-5 text-green-500 mx-auto" /></div>
              </div>
              
              {/* Row 5 */}
              <div className="grid grid-cols-4 text-center">
                <div className="p-4 text-left font-medium text-foreground bg-muted/20">Designed for learning?</div>
                <div className="p-4"><X className="w-5 h-5 text-muted-foreground mx-auto" /></div>
                <div className="p-4"><X className="w-5 h-5 text-muted-foreground mx-auto" /></div>
                <div className="p-4"><CheckCircle className="w-5 h-5 text-green-500 mx-auto" /></div>
              </div>
            </div>

            {/* Safety Callout */}
            <div className="mt-8 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <Shield className="w-8 h-8 text-green-600 dark:text-green-400 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-green-900 dark:text-green-100 text-lg mb-2">
                    Safe for Kids, Built for Learning
                  </h3>
                  <p className="text-green-800 dark:text-green-200">
                    JIE Mastery uses the Socratic method — asking guiding questions instead of giving answers. 
                    Your child learns <strong>how to think</strong>, not just what to write down. 
                    No shortcuts. No cheating. Just real understanding.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY VOICE-BASED TUTORING WORKS */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
                Why Talking Through Problems <span className="text-primary">Works Better</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Learning science shows that verbal reasoning strengthens understanding and builds lasting confidence.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Benefit 1 */}
              <Card className="bg-card border-border shadow-sm hover:shadow-md transition-all text-center">
                <CardContent className="pt-8 pb-6 px-6">
                  <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Brain className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg mb-2">Deeper Understanding</h3>
                  <p className="text-sm text-muted-foreground">
                    Speaking activates more parts of the brain than typing, leading to better retention.
                  </p>
                </CardContent>
              </Card>

              {/* Benefit 2 */}
              <Card className="bg-card border-border shadow-sm hover:shadow-md transition-all text-center">
                <CardContent className="pt-8 pb-6 px-6">
                  <div className="w-14 h-14 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Heart className="w-7 h-7 text-blue-500" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg mb-2">Less Anxiety</h3>
                  <p className="text-sm text-muted-foreground">
                    Talking feels more natural than staring at a blank screen. Kids open up more.
                  </p>
                </CardContent>
              </Card>

              {/* Benefit 3 */}
              <Card className="bg-card border-border shadow-sm hover:shadow-md transition-all text-center">
                <CardContent className="pt-8 pb-6 px-6">
                  <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageCircle className="w-7 h-7 text-green-500" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg mb-2">Real-Time Feedback</h3>
                  <p className="text-sm text-muted-foreground">
                    Instant clarification when they're confused. No waiting, no frustration.
                  </p>
                </CardContent>
              </Card>

              {/* Benefit 4 */}
              <Card className="bg-card border-border shadow-sm hover:shadow-md transition-all text-center">
                <CardContent className="pt-8 pb-6 px-6">
                  <div className="w-14 h-14 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <TrendingUp className="w-7 h-7 text-purple-500" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg mb-2">Builds Confidence</h3>
                  <p className="text-sm text-muted-foreground">
                    Explaining their thinking helps kids realize they know more than they thought.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
                How It Works
              </h2>
              <p className="text-lg text-muted-foreground">
                Get started in under 2 minutes — no credit card needed
              </p>
            </div>

            <div className="space-y-8">
              {/* Step 1 */}
              <div className="flex items-start gap-6 bg-card rounded-xl p-6 border border-border shadow-sm">
                <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xl">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-xl mb-2">Upload Homework</h3>
                  <p className="text-muted-foreground">
                    Take a photo of a worksheet, upload a PDF, or just describe the problem. 
                    Our smart OCR reads handwriting, textbooks, and printed materials in 25 languages.
                  </p>
                </div>
                <div className="hidden md:flex items-center justify-center w-20 h-20 bg-muted rounded-xl">
                  <FileImage className="w-10 h-10 text-muted-foreground" />
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-6 bg-card rounded-xl p-6 border border-border shadow-sm">
                <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xl">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-xl mb-2">Talk Through the Problem</h3>
                  <p className="text-muted-foreground">
                    Your child has a real voice conversation with their AI tutor. 
                    The tutor asks guiding questions to help them discover the solution themselves.
                  </p>
                </div>
                <div className="hidden md:flex items-center justify-center w-20 h-20 bg-muted rounded-xl">
                  <Mic className="w-10 h-10 text-muted-foreground" />
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-6 bg-card rounded-xl p-6 border border-border shadow-sm">
                <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xl">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-xl mb-2">Learn the Concept — Not Just the Answer</h3>
                  <p className="text-muted-foreground">
                    By the end of the session, your child understands <strong>how</strong> to solve the problem, 
                    not just what the answer is. That understanding sticks.
                  </p>
                </div>
                <div className="hidden md:flex items-center justify-center w-20 h-20 bg-muted rounded-xl">
                  <GraduationCap className="w-10 h-10 text-muted-foreground" />
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center mt-12">
              <StartTrialButton 
                size="lg" 
                className="px-10 py-6 text-lg font-bold rounded-xl shadow-lg" 
                showSubtext 
              />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-lg text-muted-foreground">
                Everything parents need to know
              </p>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="safe" className="bg-card border border-border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline py-5">
                  Is this safe for my child?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  Absolutely. JIE Mastery is built specifically for students. We use content moderation, 
                  age-appropriate responses, and never give direct answers that could enable cheating. 
                  Parents receive email summaries of every session so you always know what your child is learning.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="chatgpt" className="bg-card border border-border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline py-5">
                  How is this different from ChatGPT?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  ChatGPT gives instant answers — which is great for adults, but teaches kids nothing. 
                  JIE Mastery uses the Socratic method: it asks guiding questions to help your child 
                  think through problems step by step. Plus, our voice-based approach is more engaging 
                  and natural for kids than typing.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="subjects" className="bg-card border border-border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline py-5">
                  What subjects are supported?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  JIE Mastery supports Math, English, Science, and Spanish for grades K-12 and college level. 
                  The tutor adapts its teaching style and vocabulary based on your child's grade level — 
                  a 1st grader gets a very different experience than a high schooler.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="answers" className="bg-card border border-border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline py-5">
                  Does it just give my child the answers?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  No — and that's the whole point. JIE Mastery guides your child to discover answers themselves 
                  through questions like "What do you think should happen next?" or "Can you tell me what you 
                  know about this?" If a student is truly stuck, the tutor provides hints and explanations, 
                  but always focuses on teaching the concept, not just solving the problem.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="family" className="bg-card border border-border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline py-5">
                  Can multiple kids use one subscription?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  Yes! One subscription covers your entire family. You can create separate student profiles 
                  for each child with their own grade level and preferences. All students share your monthly 
                  voice minutes, making it cost-effective for families with multiple kids.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      {/* PRICING PREVIEW */}
      <section className="py-16 bg-primary/5 border-y border-border">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-4">
              Real Tutoring. One Simple Price.
            </h2>
            <p className="text-xl text-muted-foreground mb-6">
              Plans start at <strong className="text-foreground">$19.99/month</strong> for your whole family — 
              <br className="hidden sm:block" />
              less than the cost of one private tutoring session.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <StartTrialButton 
                size="lg" 
                className="px-8 py-6 text-lg font-bold rounded-xl shadow-lg" 
                showSubtext 
              />
              <Button 
                size="lg"
                variant="outline"
                className="px-8 py-6 text-lg font-semibold rounded-xl"
                onClick={() => setLocation("/pricing")}
                data-testid="button-view-pricing"
              >
                View All Plans
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground">
              Ready to End Homework Stress?
            </h2>
            <p className="text-lg text-muted-foreground">
              Join thousands of families who've found a better way to support their kids' learning. 
              Start your free 30-minute trial today — no credit card required.
            </p>
            <StartTrialButton 
              size="lg" 
              className="px-12 py-7 text-xl font-bold rounded-xl shadow-xl" 
              showSubtext 
            />
            <p className="text-sm text-muted-foreground pt-4">
              Already have an account?{' '}
              <button 
                onClick={() => setLoginModalOpen(true)}
                className="text-primary hover:underline font-medium"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </section>
      
      <Footer />
    </div>
  );
}
