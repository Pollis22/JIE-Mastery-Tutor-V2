import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Shield, Key, Mail, AlertTriangle, CheckCircle2, Eye, EyeOff, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What is your mother's maiden name?",
  "What was the name of your elementary school?",
  "What is the name of the street you grew up on?",
  "What was your childhood nickname?",
  "What is the name of your favorite teacher?",
  "What was the make of your first car?",
  "What is your favorite movie?",
  "What is your favorite book?",
];

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const securityQuestionsSchema = z.object({
  question1: z.string().min(1, "Please select a security question"),
  answer1: z.string().min(2, "Answer must be at least 2 characters"),
  question2: z.string().min(1, "Please select a security question"),
  answer2: z.string().min(2, "Answer must be at least 2 characters"),
  question3: z.string().min(1, "Please select a security question"),
  answer3: z.string().min(2, "Answer must be at least 2 characters"),
  currentPassword: z.string().min(1, "Current password is required"),
}).refine((data) => {
  const questions = [data.question1, data.question2, data.question3];
  return new Set(questions).size === questions.length;
}, {
  message: "Please select different questions",
  path: ["question3"],
});

const changeEmailSchema = z.object({
  newEmail: z.string().email("Please enter a valid email"),
  currentPassword: z.string().min(1, "Current password is required"),
  securityAnswer: z.string().optional(),
});

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;
type SecurityQuestionsForm = z.infer<typeof securityQuestionsSchema>;
type ChangeEmailForm = z.infer<typeof changeEmailSchema>;

export function SecuritySettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [activeSection, setActiveSection] = useState<"password" | "questions" | "email" | null>(null);

  const { data: securityStatus } = useQuery<{
    hasSecurityQuestions: boolean;
    securityQuestion1?: string;
    securityQuestion2?: string;
    securityQuestion3?: string;
  }>({
    queryKey: ["/api/user/security-questions"],
    enabled: !!user,
  });

  const passwordForm = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const questionsForm = useForm<SecurityQuestionsForm>({
    resolver: zodResolver(securityQuestionsSchema),
    defaultValues: {
      question1: securityStatus?.securityQuestion1 || "",
      answer1: "",
      question2: securityStatus?.securityQuestion2 || "",
      answer2: "",
      question3: securityStatus?.securityQuestion3 || "",
      answer3: "",
      currentPassword: "",
    },
  });

  const emailForm = useForm<ChangeEmailForm>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: {
      newEmail: "",
      currentPassword: "",
      securityAnswer: "",
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: ChangePasswordForm) => {
      const response = await apiRequest("POST", "/api/user/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully.",
      });
      passwordForm.reset();
      setActiveSection(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to change password",
      });
    },
  });

  const saveSecurityQuestionsMutation = useMutation({
    mutationFn: async (data: SecurityQuestionsForm) => {
      const response = await apiRequest("POST", "/api/user/security-questions", {
        currentPassword: data.currentPassword,
        question1: data.question1,
        answer1: data.answer1,
        question2: data.question2,
        answer2: data.answer2,
        question3: data.question3,
        answer3: data.answer3,
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Security Questions Saved",
        description: "Your security questions have been updated successfully.",
      });
      questionsForm.reset();
      setActiveSection(null);
      queryClient.invalidateQueries({ queryKey: ["/api/user/security-questions"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save security questions",
      });
    },
  });

  const changeEmailMutation = useMutation({
    mutationFn: async (data: ChangeEmailForm) => {
      const response = await apiRequest("POST", "/api/user/change-email", data);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Email Change Requested",
        description: "Please check your new email for a verification link.",
      });
      emailForm.reset();
      setActiveSection(null);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to change email",
      });
    },
  });

  const getAvailableQuestions = (currentField: "question1" | "question2" | "question3") => {
    const selectedQuestions: string[] = [];
    if (currentField !== "question1") selectedQuestions.push(questionsForm.watch("question1"));
    if (currentField !== "question2") selectedQuestions.push(questionsForm.watch("question2"));
    if (currentField !== "question3") selectedQuestions.push(questionsForm.watch("question3"));
    
    return SECURITY_QUESTIONS.filter(q => !selectedQuestions.includes(q));
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Account Security
          </CardTitle>
          <CardDescription>
            Manage your password, security questions, and email settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <Key className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Password</p>
                <p className="text-sm text-muted-foreground">Change your account password</p>
              </div>
            </div>
            <Button 
              type="button"
              variant="outline" 
              onClick={() => setActiveSection(activeSection === "password" ? null : "password")}
              data-testid="button-change-password"
            >
              {activeSection === "password" ? "Cancel" : "Change"}
            </Button>
          </div>

          {activeSection === "password" && (
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <Form {...passwordForm}>
                  <form onSubmit={passwordForm.handleSubmit((data) => changePasswordMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={passwordForm.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                {...field}
                                type={showCurrentPassword ? "text" : "password"}
                                className="pr-10"
                                data-testid="input-current-password"
                              />
                              <button
                                type="button"
                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={passwordForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                {...field}
                                type={showNewPassword ? "text" : "password"}
                                className="pr-10"
                                data-testid="input-new-password"
                              />
                              <button
                                type="button"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormDescription>Must be at least 8 characters</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={passwordForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm New Password</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              data-testid="input-confirm-password"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button 
                      type="submit" 
                      disabled={changePasswordMutation.isPending}
                      data-testid="button-submit-password"
                    >
                      {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <HelpCircle className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">Security Questions</p>
                  {securityStatus?.hasSecurityQuestions ? (
                    <Badge variant="secondary" className="text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Configured
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Not Set
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {securityStatus?.hasSecurityQuestions 
                    ? "Update your security questions for account recovery"
                    : "Set up security questions for account recovery"
                  }
                </p>
              </div>
            </div>
            <Button 
              type="button"
              variant="outline" 
              onClick={() => setActiveSection(activeSection === "questions" ? null : "questions")}
              data-testid="button-setup-questions"
            >
              {activeSection === "questions" ? "Cancel" : securityStatus?.hasSecurityQuestions ? "Update" : "Set Up"}
            </Button>
          </div>

          {activeSection === "questions" && (
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <Form {...questionsForm}>
                  <form onSubmit={questionsForm.handleSubmit((data) => saveSecurityQuestionsMutation.mutate(data))} className="space-y-4">
                    {[1, 2, 3].map((num) => (
                      <div key={num} className="space-y-2">
                        <FormField
                          control={questionsForm.control}
                          name={`question${num}` as "question1" | "question2" | "question3"}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Security Question {num}</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid={`select-question-${num}`}>
                                    <SelectValue placeholder="Select a question" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {getAvailableQuestions(`question${num}` as "question1" | "question2" | "question3").map((q) => (
                                    <SelectItem key={q} value={q}>{q}</SelectItem>
                                  ))}
                                  {field.value && !getAvailableQuestions(`question${num}` as "question1" | "question2" | "question3").includes(field.value) && (
                                    <SelectItem value={field.value}>{field.value}</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={questionsForm.control}
                          name={`answer${num}` as "answer1" | "answer2" | "answer3"}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Answer {num}</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Your answer"
                                  data-testid={`input-answer-${num}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    ))}

                    <FormField
                      control={questionsForm.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Password</FormLabel>
                          <FormDescription>Required to save security questions</FormDescription>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              data-testid="input-questions-password"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button 
                      type="submit" 
                      disabled={saveSecurityQuestionsMutation.isPending}
                      data-testid="button-save-questions"
                    >
                      {saveSecurityQuestionsMutation.isPending ? "Saving..." : "Save Security Questions"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Email Address</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <Button 
              type="button"
              variant="outline" 
              onClick={() => setActiveSection(activeSection === "email" ? null : "email")}
              data-testid="button-change-email"
            >
              {activeSection === "email" ? "Cancel" : "Change"}
            </Button>
          </div>

          {activeSection === "email" && (
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <Form {...emailForm}>
                  <form onSubmit={emailForm.handleSubmit((data) => changeEmailMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={emailForm.control}
                      name="newEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Email Address</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="email"
                              placeholder="new.email@example.com"
                              data-testid="input-new-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={emailForm.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Password</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              data-testid="input-email-password"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {securityStatus?.hasSecurityQuestions && (
                      <>
                        <div className="text-sm text-muted-foreground">
                          <p className="font-medium mb-1">Security Verification Required</p>
                          <p>{securityStatus.securityQuestion1}</p>
                        </div>
                        <FormField
                          control={emailForm.control}
                          name="securityAnswer"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Security Answer</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Your answer"
                                  data-testid="input-email-security-answer"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    <Button 
                      type="submit" 
                      disabled={changeEmailMutation.isPending}
                      data-testid="button-submit-email"
                    >
                      {changeEmailMutation.isPending ? "Sending..." : "Send Verification Email"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
