import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
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
import { Eye, EyeOff, Mail, FileText, Upload, Scan, Users, TrendingUp, ChevronDown, Bot, BookOpen, Sparkles } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/footer";
import jieLogo from "@/assets/jie-mastery-logo-new.jpg";

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
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

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
      setUnverifiedEmail(null); // Reset verification state
      await loginMutation.mutateAsync(data);
      console.log('[FORM] mutateAsync completed successfully');
    } catch (error: any) {
      // Check if this is a verification error and capture the email from the error
      if (error.requiresVerification && error.email) {
        // Use the email provided by the backend (works even if user logged in with username)
        setUnverifiedEmail(error.email);
      } else if (error.message && (error.message.includes("verify your email") || error.message.includes("verification"))) {
        // Fallback: if the input looks like an email, use it
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailPattern.test(data.email)) {
          setUnverifiedEmail(data.email);
        }
      }
      // Error is handled by mutation's onError
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
                Support
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
                onClick={() => setLocation("/pricing")} 
                data-testid="button-nav-pricing"
              >
                Pricing
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-6xl mx-auto items-start">
          
          {/* Auth Forms */}
          <div className="flex justify-center">
            <Card className="w-full max-w-md">
              <CardHeader className="text-center">
                <div className="flex items-center justify-center mb-4">
                  <img 
                    src={jieLogo} 
                    alt="JIE Mastery Logo" 
                    className="h-16 w-auto"
                  />
                </div>
                <CardTitle className="text-2xl font-bold text-foreground">JIE Mastery Tutor</CardTitle>
                <div className="inline-block">
                  <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">
                    Patent Pending System
                  </span>
                </div>
                <p className="text-muted-foreground mt-2">Sign in to continue your learning journey</p>
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
                        
                        {/* Email Verification Alert */}
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

          {/* Hero Section */}
          <div className="flex justify-center">
            <div className="text-center lg:text-left space-y-6">
              <div className="space-y-4">
                <div className="inline-block mb-3">
                  <span className="text-sm font-semibold text-primary uppercase tracking-wide bg-primary/10 px-4 py-2 rounded-full">
                    The Future of Family Tutoring
                  </span>
                </div>
                <h1 className="text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                  Master Every Subject with <span className="text-primary">JIE Mastery Tutor</span>
                </h1>
                <p className="text-xl text-muted-foreground max-w-md">
                  One subscription, whole family learns. Experience personalized AI tutoring for Math, English, Science, Spanish and More with interactive voice conversations and adaptive learning paths.
                </p>
              </div>

              {/* Featured Visual */}
              <Card className="shadow-2xl overflow-hidden border-2 border-primary/20 transform hover:scale-105 transition-transform duration-300">
                <CardContent className="p-0">
                  <div 
                    className="w-full aspect-[4/3] bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex flex-col items-center justify-center gap-6 relative overflow-hidden"
                    data-testid="img-auth-hero"
                  >
                    {/* Background decorative elements */}
                    <div className="absolute inset-0 bg-grid-white/10"></div>
                    <Sparkles className="absolute top-4 right-4 w-8 h-8 text-white/50 animate-pulse" />
                    <Sparkles className="absolute bottom-6 left-6 w-6 h-6 text-white/40 animate-pulse delay-100" />
                    
                    {/* Main icon */}
                    <div className="relative z-10 bg-white/20 backdrop-blur-sm rounded-full p-8 shadow-2xl">
                      <Bot className="w-24 h-24 text-white" />
                    </div>
                    
                    {/* Text */}
                    <div className="relative z-10 text-center px-4">
                      <h3 className="text-2xl font-bold text-white mb-2">AI-Powered Learning</h3>
                      <p className="text-white/90 text-sm max-w-xs">Personalized tutoring with voice conversations and real-time feedback</p>
                    </div>
                    
                    {/* Bottom accent */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-300 via-pink-300 to-purple-300"></div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd"/>
                    </svg>
                  </div>
                  <span className="text-foreground font-medium">Live Voice Conversations</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                    <Upload className="w-4 h-4 text-blue-500" />
                  </div>
                  <span className="text-foreground font-medium">Upload Homework & Assignments</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
                    <Scan className="w-4 h-4 text-purple-500" />
                  </div>
                  <span className="text-foreground font-medium">Smart Document OCR & Analysis</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-orange-500" />
                  </div>
                  <span className="text-foreground font-medium">Adaptive Learning Paths</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
                    <Users className="w-4 h-4 text-green-500" />
                  </div>
                  <span className="text-foreground font-medium">Family Sharing - Multiple Profiles</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
                    </svg>
                  </div>
                  <span className="text-foreground font-medium">Transcript Saving</span>
                </div>
              </div>

              {/* Family Sharing Highlight */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl p-6 space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="font-bold text-foreground text-lg">Perfect for Families!</h3>
                </div>
                <p className="text-sm text-foreground">
                  <strong>One subscription, whole family benefits!</strong> Since billing is minute-based, siblings can share the account. Simply create different profiles for each family member - everyone gets personalized learning at their grade level.
                </p>
                <div className="flex items-center space-x-2 text-xs text-green-700 dark:text-green-300 font-medium">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                  </svg>
                  <span>K-12 to College/Adult supported • Multiple student profiles • Shared minute pool</span>
                </div>
              </div>

              <div className="bg-gradient-to-br from-primary/5 to-secondary/5 border border-primary/20 rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-foreground text-lg">Ready to start learning?</h3>
                <p className="text-sm text-muted-foreground">
                  Join thousands of students who are already improving their skills with AI-powered tutoring.
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">🎯</span>
                    <span className="text-foreground">Personalized lessons</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">📄</span>
                    <span className="text-foreground">Upload documents</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">📊</span>
                    <span className="text-foreground">Real-time feedback</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">📸</span>
                    <span className="text-foreground">Photo-to-text OCR</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">👨‍👩‍👧‍👦</span>
                    <span className="text-foreground">Family sharing</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">💾</span>
                    <span className="text-foreground">Save transcripts</span>
                  </div>
                </div>
              </div>

              {/* CTA Button */}
              <div className="pt-4">
                <Button 
                  variant="outline" 
                  size="lg"
                  className="w-full"
                  onClick={() => setLocation("/benefits")}
                  data-testid="button-why-jie"
                >
                  Why Choose JIE Mastery AI Tutors?
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}
