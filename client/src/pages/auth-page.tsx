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
import { useEffect } from "react";
import jieLogo from "@/assets/jie-mastery-logo.png";
import authHeroImage from "@assets/Create_an_image_of_an_AI_robot_tutoring_a_real_tee-1759437278109_1759521800759.png";

const loginSchema = z.object({
  email: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  parentName: z.string().min(1, "Parent/Guardian name is required"),
  studentName: z.string().min(1, "Student name is required"),
  studentAge: z.coerce.number().min(5, "Student must be at least 5 years old").max(99, "Please enter a valid age"),
  gradeLevel: z.enum(['kindergarten-2', 'grades-3-5', 'grades-6-8', 'grades-9-12', 'college-adult'], {
    required_error: "Please select a grade level"
  }),
  primarySubject: z.enum(['math', 'english', 'science', 'spanish', 'general'], {
    required_error: "Please select a primary subject"
  }),
  marketingOptIn: z.boolean().default(false),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [, setLocation] = useLocation();

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
      username: "",
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      parentName: "",
      studentName: "",
      studentAge: 10,
      gradeLevel: undefined,
      primarySubject: undefined,
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
      await loginMutation.mutateAsync(data);
      console.log('[FORM] mutateAsync completed successfully');
    } catch (error) {
      // Error is handled by mutation's onError
      console.error('[FORM] Login error:', error);
    }
  };

  const handleRegister = async (data: RegisterForm) => {
    try {
      await registerMutation.mutateAsync(data);
    } catch (error) {
      // Error is handled by mutation's onError
      console.error('Register error:', error);
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
                <p className="text-muted-foreground">Sign in to continue your learning journey</p>
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
                                <Input type="password" {...field} data-testid="input-password" />
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
                      </form>
                    </Form>
                  </TabsContent>
                  
                  <TabsContent value="register" className="space-y-4">
                    <Form {...registerForm}>
                      <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                        <FormField
                          control={registerForm.control}
                          name="parentName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Parent/Guardian Name</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Your full name" data-testid="input-parent-name" />
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
                                <Input {...field} placeholder="Student's full name" data-testid="input-student-name" />
                              </FormControl>
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
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Username</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-register-username" />
                              </FormControl>
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
                                <Input type="password" {...field} data-testid="input-register-password" />
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
                          disabled={registerMutation.isPending}
                          data-testid="button-register"
                        >
                          {registerMutation.isPending ? "Creating account..." : "Create Account"}
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
                <h1 className="text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                  Master Every Subject with <span className="text-primary">JIE Mastery Tutor</span>
                </h1>
                <p className="text-xl text-muted-foreground max-w-md">
                  Experience personalized AI tutoring for Math, English, Science, Spanish and More with interactive voice conversations and adaptive learning paths.
                </p>
              </div>

              {/* Featured Image */}
              <Card className="shadow-2xl overflow-hidden border-2 border-primary/20 transform hover:scale-105 transition-transform duration-300">
                <CardContent className="p-0">
                  <img 
                    src={authHeroImage} 
                    alt="AI tutor helping student with personalized learning" 
                    className="w-full h-auto object-cover"
                    data-testid="img-auth-hero"
                  />
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
                  <div className="w-8 h-8 bg-secondary/10 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                  </div>
                  <span className="text-foreground font-medium">Adaptive Learning Paths</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
                    </svg>
                  </div>
                  <span className="text-foreground font-medium">Progress Tracking</span>
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-foreground">Ready to start learning?</h3>
                <p className="text-sm text-muted-foreground">
                  Join thousands of students who are already improving their skills with AI-powered tutoring.
                </p>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <span>🎯 Personalized lessons</span>
                  <span>•</span>
                  <span>📊 Real-time feedback</span>
                  <span>•</span>
                  <span>🏆 Track progress</span>
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
    </div>
  );
}
