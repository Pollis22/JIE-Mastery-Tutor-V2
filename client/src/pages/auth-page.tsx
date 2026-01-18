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
import { Eye, EyeOff, Mail, FileText, Upload, Scan, Users, TrendingUp, ChevronDown, Bot, BookOpen, Sparkles, CheckCircle, AlertCircle, Info, Play, Mic, FileImage, GraduationCap, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/footer";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StartTrialButton } from "@/components/StartTrialButton";

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
  
  const searchParams = new URLSearchParams(searchString);
  const verificationStatus = searchParams.get('verified');
  const verificationReason = searchParams.get('reason');

  const resendVerificationMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/auth/resend-verification", { email });
      return await res.json();
    },
    onSuccess: () => {
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

  const handleLogin = async (data: LoginForm) => {
    console.log('[FORM] handleLogin called with:', { email: data.email, hasPassword: !!data.password });
    try {
      console.log('[FORM] Calling mutateAsync...');
      setUnverifiedEmail(null);
      await loginMutation.mutateAsync(data);
      console.log('[FORM] mutateAsync completed successfully');
    } catch (error: any) {
      if (error.requiresVerification && error.email) {
        setUnverifiedEmail(error.email);
      } else if (error.message && (error.message.includes("verify your email") || error.message.includes("verification"))) {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailPattern.test(data.email)) {
          setUnverifiedEmail(data.email);
        }
      }
      console.error('[FORM] Login error:', error);
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
      console.error('[Registration] Checkout error:', error);
      toast({
        title: "Registration failed",
        description: error.message || "Failed to create checkout session. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleRegister = async (data: RegisterForm) => {
    console.log('[FORM] handleRegister called with:', data);
    console.log('[FORM] form.formState.errors:', registerForm.formState.errors);
    try {
      await createCheckoutSessionMutation.mutateAsync(data);
    } catch (error) {
      console.error('[FORM] Registration error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Bar */}
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <img src={jieLogo} alt="JIE Mastery" className="h-10 w-auto" />
              <span className="text-xl font-bold text-foreground">JIE Mastery Tutor</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/benefits")} 
                data-testid="button-nav-benefits"
              >
                Why JIE Mastery AI Tutors
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/demo")} 
                data-testid="button-nav-demo"
              >
                Tutor Demo
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/faq")} 
                data-testid="button-nav-faq"
              >
                FAQ
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/support")} 
                data-testid="button-nav-support"
              >
                Live Support
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/contact")} 
                data-testid="button-nav-contact"
              >
                Contact
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/offer")} 
                data-testid="button-nav-offers"
              >
                Offers
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/pricing")} 
                data-testid="button-nav-pricing"
              >
                Pricing
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-16 lg:py-20">
        <div className="container mx-auto px-4">
          {/* Verification Status Messages */}
          {verificationStatus && (
            <div className="max-w-md mx-auto mb-8">
              {verificationStatus === 'success' && (
                <Alert className="bg-green-50 border-green-200" data-testid="alert-verification-success">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800">Email Verified Successfully!</AlertTitle>
                  <AlertDescription className="text-green-700">
                    Your email has been verified. You can now log in and start learning.
                  </AlertDescription>
                </Alert>
              )}
              {verificationStatus === 'already' && (
                <Alert className="bg-blue-50 border-blue-200" data-testid="alert-verification-already">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertTitle className="text-blue-800">Email Already Verified</AlertTitle>
                  <AlertDescription className="text-blue-700">
                    Your email is already verified. Please log in to continue.
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
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 max-w-6xl mx-auto items-center">
            
            {/* Left Column: Auth Form Only */}
            <div className="flex justify-center lg:justify-start order-2 lg:order-1">
              <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="text-center pb-4">
                  <div className="flex items-center justify-center mb-3">
                    <img 
                      src={jieLogo} 
                      alt="JIE Mastery Logo" 
                      className="h-14 w-auto"
                    />
                  </div>
                  <CardTitle className="text-xl font-bold text-foreground">JIE Mastery Tutor</CardTitle>
                  <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full inline-block mt-2">
                    Patent Pending System
                  </span>
                  <p className="text-sm text-muted-foreground mt-2">Sign in to continue your learning journey</p>
                </CardHeader>
                
                <CardContent>
                  <Tabs defaultValue="login" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="login" data-testid="tab-login">Sign In</TabsTrigger>
                      <TabsTrigger value="register" data-testid="tab-register">Create Account</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="login" className="space-y-4">
                      <Form {...loginForm}>
                        <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                          <FormField
                            control={loginForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email or Username</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="test@example.com" data-testid="input-email" />
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
                                      data-testid="input-password" 
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                      aria-label={showLoginPassword ? "Hide password" : "Show password"}
                                      data-testid="button-toggle-login-password"
                                    >
                                      {showLoginPassword ? (
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
                          
                          <Button 
                            type="submit" 
                            className="w-full" 
                            disabled={loginMutation.isPending}
                            data-testid="button-login"
                          >
                            {loginMutation.isPending ? "Signing in..." : "Sign In"}
                          </Button>
                          
                          {unverifiedEmail && (
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3" data-testid="alert-email-verification">
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
                                disabled={resendVerificationMutation.isPending}
                                className="w-full border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                data-testid="button-resend-verification"
                              >
                                {resendVerificationMutation.isPending ? "Sending..." : "Resend Verification Email"}
                              </Button>
                            </div>
                          )}
                          
                          <div className="text-center">
                            <Button 
                              type="button"
                              variant="link" 
                              onClick={() => setLocation("/forgot-password")}
                              className="text-sm text-muted-foreground hover:text-foreground"
                              data-testid="link-forgot-password"
                            >
                              Forgot your password?
                            </Button>
                          </div>

                        </form>
                      </Form>
                    </TabsContent>
                    
                    <TabsContent value="register" className="space-y-4">
                      <Form {...registerForm}>
                        <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                          <FormField
                            control={registerForm.control}
                            name="plan"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Subscription Plan</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-plan">
                                      <SelectValue placeholder="Select a plan" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="starter">Starter Family - $19.99/mo (60 min)</SelectItem>
                                    <SelectItem value="standard">Standard Family - $59.99/mo (240 min)</SelectItem>
                                    <SelectItem value="pro">Pro Family - $99.99/mo (600 min) - Most Popular</SelectItem>
                                    <SelectItem value="elite">Elite Family - $199.99/mo (1,800 min) - Best Value</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormDescription className="text-xs">
                                  Choose your tutoring plan. You'll be redirected to Stripe to complete payment.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={registerForm.control}
                            name="accountName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Account Name</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Your full name" data-testid="input-account-name" />
                                </FormControl>
                                <FormDescription className="text-xs">
                                  For parents: your name. For adult learners: your name.
                                </FormDescription>
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
                                  <Input {...field} placeholder="Student's full name" data-testid="input-student-name" />
                                </FormControl>
                                <FormDescription className="text-xs">
                                  For parents: your child's name. For adult learners: your name.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={registerForm.control}
                              name="studentAge"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Student Age</FormLabel>
                                  <FormControl>
                                    <Input type="number" min={5} max={99} {...field} data-testid="input-student-age" />
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
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-grade-level">
                                        <SelectValue placeholder="Select grade" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="kindergarten-2">K-2</SelectItem>
                                      <SelectItem value="grades-3-5">Grades 3-5</SelectItem>
                                      <SelectItem value="grades-6-8">Grades 6-8</SelectItem>
                                      <SelectItem value="grades-9-12">Grades 9-12</SelectItem>
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
                                <FormLabel>Primary Subject Interest</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-primary-subject">
                                      <SelectValue placeholder="Select a subject" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="math">Math</SelectItem>
                                    <SelectItem value="english">English</SelectItem>
                                    <SelectItem value="science">Science</SelectItem>
                                    <SelectItem value="spanish">Spanish</SelectItem>
                                    <SelectItem value="general">General (Multiple Subjects)</SelectItem>
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
                                  <Input type="email" {...field} data-testid="input-email" />
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
                                  <div className="relative">
                                    <Input 
                                      type={showRegisterPassword ? "text" : "password"} 
                                      {...field} 
                                      className="pr-10"
                                      data-testid="input-register-password" 
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                      aria-label={showRegisterPassword ? "Hide password" : "Show password"}
                                      data-testid="button-toggle-register-password"
                                    >
                                      {showRegisterPassword ? (
                                        <EyeOff className="h-4 w-4" />
                                      ) : (
                                        <Eye className="h-4 w-4" />
                                      )}
                                    </button>
                                  </div>
                                </FormControl>
                                <FormDescription>Must be at least 8 characters</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={registerForm.control}
                            name="marketingOptIn"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox 
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-marketing-opt-in"
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel className="text-sm font-normal">
                                    Send me updates, tips, and promotional emails
                                  </FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          
                          <Button 
                            type="submit" 
                            className="w-full" 
                            disabled={createCheckoutSessionMutation.isPending}
                            data-testid="button-register"
                          >
                            {createCheckoutSessionMutation.isPending ? "Redirecting to payment..." : "Continue to Payment"}
                          </Button>
                        </form>
                      </Form>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Clean Hero */}
            <div className="order-1 lg:order-2 text-center lg:text-left">
              <div className="space-y-6 max-w-xl">
                <span className="inline-block text-sm font-semibold text-primary uppercase tracking-wide bg-primary/10 px-4 py-2 rounded-full">
                  AI Homework Help for K-12 & College
                </span>
                
                <h1 className="text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                  AI Homework Help & <span className="text-primary">Voice-Based Tutoring</span> for Students
                </h1>
                
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Get instant math homework help, English support, and personalized tutoring through real voice conversations. Perfect for homeschool families and busy parents. One subscription covers your whole family.
                </p>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row items-center lg:items-start gap-4" data-testid="free-trial-cta-container">
                  <StartTrialButton size="lg" className="px-8 py-6 text-lg font-semibold rounded-lg shadow-lg w-full sm:w-auto h-auto" showSubtext />
                  <Button 
                    size="lg"
                    variant="outline"
                    className="px-8 py-6 text-lg font-semibold rounded-lg w-full sm:w-auto"
                    onClick={() => setLocation("/pricing")}
                    data-testid="button-get-started-hero"
                  >
                    Get Started
                  </Button>
                </div>
                
                <p className="text-sm text-muted-foreground">
                  No credit card required &bull; 30-minute free trial &bull; K-12 & College support
                </p>

                {/* Video */}
                <div 
                  className="relative w-full max-w-lg mx-auto lg:mx-0 mt-8"
                  style={{ aspectRatio: '16/9' }}
                  data-testid="video-hero-container"
                >
                  <iframe 
                    className="absolute top-0 left-0 w-full h-full rounded-xl shadow-xl border border-border"
                    src="https://www.youtube.com/embed/UN7vOUoGGmA" 
                    title="JIE Mastery Tutor Demo" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                    referrerPolicy="strict-origin-when-cross-origin" 
                    allowFullScreen
                    data-testid="video-hero-youtube"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section - Below the Fold */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-bold text-foreground text-center mb-12">
              Why Parents Choose JIE Mastery Tutor
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Card 1: Voice-Based Tutoring */}
              <Card className="bg-card border-border shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="pt-8 pb-6 px-6 text-center">
                  <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mic className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg mb-2">Voice-Based Tutoring</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Real conversations that explain concepts, not just give answers. Students learn by talking through problems.
                  </p>
                </CardContent>
              </Card>

              {/* Card 2: Homework Upload + OCR */}
              <Card className="bg-card border-border shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="pt-8 pb-6 px-6 text-center">
                  <div className="w-14 h-14 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileImage className="w-7 h-7 text-blue-500" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg mb-2">Homework Upload & OCR</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Upload worksheets, textbook pages, or photos. Smart OCR reads and understands any document format.
                  </p>
                </CardContent>
              </Card>

              {/* Card 3: Family Sharing */}
              <Card className="bg-card border-border shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="pt-8 pb-6 px-6 text-center">
                  <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users className="w-7 h-7 text-green-500" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg mb-2">Perfect for Families</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    One subscription, unlimited student profiles. Siblings share minutes with personalized grade levels.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-8">
              How JIE Mastery Tutor Works
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-3">
                <div className="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center mx-auto font-bold text-lg">
                  1
                </div>
                <h3 className="font-semibold text-foreground">Start Free Trial</h3>
                <p className="text-sm text-muted-foreground">
                  30 minutes free — no credit card needed
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center mx-auto font-bold text-lg">
                  2
                </div>
                <h3 className="font-semibold text-foreground">Ask Questions</h3>
                <p className="text-sm text-muted-foreground">
                  Talk or type for instant homework support
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center mx-auto font-bold text-lg">
                  3
                </div>
                <h3 className="font-semibold text-foreground">Learn & Grow</h3>
                <p className="text-sm text-muted-foreground">
                  Get step-by-step tutoring in Math, English, Science, and Spanish
                </p>
              </div>
            </div>

            <div className="mt-12">
              <StartTrialButton size="lg" className="px-8 py-6 text-lg font-semibold rounded-lg" showSubtext />
            </div>
          </div>
        </div>
      </section>
      
      <Footer />
    </div>
  );
}
