/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  HelpCircle, 
  Mail, 
  Phone, 
  MessageCircle,
  Send,
  ExternalLink,
  FileQuestion,
  BookOpen,
  Zap,
  CreditCard,
  Volume2,
  Shield
} from "lucide-react";

const faqItems = [
  {
    category: "Getting Started",
    icon: BookOpen,
    questions: [
      {
        q: "How do I start a tutoring session?",
        a: "Click on the 'Tutor' button in the navigation or dashboard. Make sure your microphone is enabled and start speaking with your AI tutor."
      },
      {
        q: "What subjects are available?",
        a: "We offer tutoring in Math, English, Science, Spanish, and General learning for all grade levels from K-2 through College/Adult."
      },
      {
        q: "How does the AI tutor adapt to my learning level?",
        a: "The AI tutor uses your profile information (grade level and primary subject) to adjust its teaching style, vocabulary, and complexity to match your learning needs."
      }
    ]
  },
  {
    category: "Subscription & Billing",
    icon: CreditCard,
    questions: [
      {
        q: "What plans are available?",
        a: "We offer four family plans: Starter Family ($19.99/month for 60 min), Standard Family ($59.99/month for 240 min), Pro Family ($99.99/month for 600 min - Most Popular), and Elite Family ($199.99/month for 1,800 min - Best Value). All plans include unlimited student profiles!"
      },
      {
        q: "Can I change my plan?",
        a: "Yes! You can upgrade or downgrade your plan at any time from the Subscription section in your dashboard. Upgrades take effect immediately with prorated billing. Downgrades take effect at your next billing cycle."
      },
      {
        q: "What happens if I run out of minutes?",
        a: "You can upgrade to a higher plan for more monthly minutes. Your minutes reset each billing cycle."
      },
      {
        q: "Can multiple children use one account?",
        a: "Yes! All plans include unlimited student profiles. Each child gets their own personalized tutoring experience, and parents can track each child's progress separately."
      }
    ]
  },
  {
    category: "Voice & Technical",
    icon: Volume2,
    questions: [
      {
        q: "What languages are supported for voice tutoring?",
        a: "We support over 25 languages for voice tutoring, including English, Spanish, French, German, Mandarin, Japanese, Korean, Portuguese, Italian, and many more."
      },
      {
        q: "Why isn't my microphone working?",
        a: "Make sure you've granted microphone permissions to your browser. Check your browser settings and ensure no other applications are using your microphone. Try speaking more clearly with minimal background noise."
      },
      {
        q: "Can I upload my homework?",
        a: "Yes! Go to Study Materials to upload PDFs, Word documents, or images of your homework. The AI tutor will reference these materials during your tutoring session."
      }
    ]
  },
  {
    category: "Privacy & Security",
    icon: Shield,
    questions: [
      {
        q: "Is my data secure?",
        a: "Yes, all your data is encrypted and securely stored. We never share your personal information with third parties without your consent."
      },
      {
        q: "Can I export my data?",
        a: "Yes, you can export all your data including session transcripts and progress from the Privacy section in Account Settings."
      },
      {
        q: "How do I delete my account?",
        a: "You can permanently delete your account from the Danger Zone in Account Settings. This action cannot be undone."
      }
    ]
  }
];

export default function SupportCenter() {
  const { toast } = useToast();
  const [contactForm, setContactForm] = useState({
    subject: "",
    message: "",
    category: "general"
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/support/contact", data);
      if (!response.ok) throw new Error("Failed to send message");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Message sent",
        description: "We'll get back to you within 24 hours",
      });
      setContactForm({
        subject: "",
        message: "",
        category: "general"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessageMutation.mutate(contactForm);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Support & Help</CardTitle>
        <CardDescription>Get help with JIE Mastery Tutor</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="faq" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="faq">FAQ</TabsTrigger>
            <TabsTrigger value="contact">Contact Us</TabsTrigger>
            <TabsTrigger value="resources">Resources</TabsTrigger>
          </TabsList>

          <TabsContent value="faq" className="space-y-4">
            <div className="space-y-6">
              {faqItems.map((category) => {
                const Icon = category.icon;
                return (
                  <div key={category.category}>
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">{category.category}</h3>
                    </div>
                    <div className="space-y-3 ml-7">
                      {category.questions.map((item, idx) => (
                        <details key={idx} className="group">
                          <summary className="cursor-pointer list-none">
                            <div className="flex items-start gap-2">
                              <HelpCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <span className="font-medium text-sm hover:text-primary transition-colors">
                                {item.q}
                              </span>
                            </div>
                          </summary>
                          <p className="mt-2 ml-6 text-sm text-muted-foreground">
                            {item.a}
                          </p>
                        </details>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="contact" className="space-y-4">
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription>
                For general inquiries, email us at{" "}
                <a href="mailto:support@JIEmastery.ai" className="font-medium underline">
                  support@JIEmastery.ai
                </a>
              </AlertDescription>
            </Alert>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  className="w-full p-2 border rounded-md"
                  value={contactForm.category}
                  onChange={(e) => setContactForm({...contactForm, category: e.target.value})}
                >
                  <option value="general">General Inquiry</option>
                  <option value="technical">Technical Support</option>
                  <option value="billing">Billing Question</option>
                  <option value="feature">Feature Request</option>
                  <option value="bug">Report a Bug</option>
                </select>
              </div>

              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={contactForm.subject}
                  onChange={(e) => setContactForm({...contactForm, subject: e.target.value})}
                  placeholder="Brief description of your issue"
                  required
                />
              </div>

              <div>
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={contactForm.message}
                  onChange={(e) => setContactForm({...contactForm, message: e.target.value})}
                  placeholder="Describe your issue or question in detail..."
                  rows={6}
                  required
                />
              </div>

              <Button 
                type="submit" 
                disabled={sendMessageMutation.isPending}
                className="w-full"
              >
                <Send className="mr-2 h-4 w-4" />
                {sendMessageMutation.isPending ? "Sending..." : "Send Message"}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-3">Other Ways to Reach Us</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">support@JIEmastery.ai</span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Live chat available Mon-Fri, 9am-5pm EST</span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="resources" className="space-y-4">
            <div className="grid gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <BookOpen className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium mb-1">Getting Started Guide</h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Learn how to make the most of your AI tutor
                      </p>
                      <Button variant="link" className="p-0 h-auto">
                        Read Guide
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <Zap className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium mb-1">Tips & Tricks</h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Maximize your learning with these helpful tips
                      </p>
                      <Button variant="link" className="p-0 h-auto">
                        View Tips
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <FileQuestion className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium mb-1">Troubleshooting</h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Common issues and how to fix them
                      </p>
                      <Button variant="link" className="p-0 h-auto">
                        View Solutions
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}