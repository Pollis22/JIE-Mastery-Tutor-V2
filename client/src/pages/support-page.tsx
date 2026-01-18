import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, HelpCircle, Mail, MessageCircle } from "lucide-react";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";
import { LiveChatWidget } from "@/components/LiveChatWidget";

export default function SupportPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Bar */}
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setLocation("/auth")}>
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

      {/* Support Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4" style={{ color: '#C32026' }}>
              Support Center
            </h1>
            <p className="text-xl text-muted-foreground">
              We're here to help you get the most out of JIE Mastery AI Tutor
            </p>
          </div>

          {/* Support Options Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation("/faq")} data-testid="card-faq">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <HelpCircle className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">FAQ</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Find quick answers to common questions
                </p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation("/demo")} data-testid="card-demo">
              <CardHeader>
                <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4">
                  <BookOpen className="w-6 h-6 text-blue-500" />
                </div>
                <CardTitle className="text-lg">Tutor Demo</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Watch our AI tutor in action
                </p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation("/contact")} data-testid="card-contact">
              <CardHeader>
                <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mb-4">
                  <Mail className="w-6 h-6 text-green-500" />
                </div>
                <CardTitle className="text-lg">Contact Us</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Get in touch with our team
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow border-2 border-orange-200 hover:border-orange-400"
              onClick={() => {
                const chatButton = document.querySelector('[data-testid="button-start-live-chat"]') as HTMLButtonElement;
                if (chatButton) {
                  chatButton.click();
                }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLElement).click()}
              data-testid="card-live-chat"
            >
              <CardHeader>
                <div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center mb-4">
                  <MessageCircle className="w-6 h-6 text-orange-500" />
                </div>
                <CardTitle className="text-lg">Live Chat</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Click to talk with our AI support
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Common Topics */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-foreground">Common Topics</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Getting Started</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">• Creating your account</p>
                  <p className="text-sm text-muted-foreground">• Setting up student profiles</p>
                  <p className="text-sm text-muted-foreground">• Choosing the right plan</p>
                  <p className="text-sm text-muted-foreground">• Starting your first session</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Billing & Subscriptions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">• Managing your subscription</p>
                  <p className="text-sm text-muted-foreground">• Adding voice minutes</p>
                  <p className="text-sm text-muted-foreground">• Upgrading or downgrading plans</p>
                  <p className="text-sm text-muted-foreground">• Payment methods</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Voice Sessions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">• Configuring your microphone</p>
                  <p className="text-sm text-muted-foreground">• Session quality tips</p>
                  <p className="text-sm text-muted-foreground">• Understanding transcripts</p>
                  <p className="text-sm text-muted-foreground">• Troubleshooting connection issues</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Family Sharing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">• Adding family members</p>
                  <p className="text-sm text-muted-foreground">• Managing student profiles</p>
                  <p className="text-sm text-muted-foreground">• Sharing voice minutes</p>
                  <p className="text-sm text-muted-foreground">• Concurrent session limits</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Contact CTA */}
          <div className="mt-16 text-center bg-primary/5 rounded-2xl p-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              Can't Find What You're Looking For?
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              Our support team is ready to help with any questions or issues.
            </p>
            <Button 
              size="lg"
              onClick={() => setLocation("/contact")}
              data-testid="button-contact-support"
            >
              Contact Support
            </Button>
          </div>
        </div>
      </div>

      {/* ElevenLabs Live Chat Widget - handles its own UI */}
      <LiveChatWidget />
    </div>
  );
}
