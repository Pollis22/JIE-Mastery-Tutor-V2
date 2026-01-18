import { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocation } from "wouter";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";
import { StartTrialButton } from "@/components/StartTrialButton";
import { 
  MessageCircle,
  Mic,
  Brain,
  BookOpen,
  Clock,
  Users,
  Heart,
  Sparkles,
  Menu,
  X
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
  }
}

export default function OfferPage() {
  const [, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    document.title = "Free Trial + 50% Off | JIE Mastery AI Tutor";
    
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);

    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = 'https://jiemastery.ai/offer';
    document.head.appendChild(canonical);

    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', 'ViewContent', {
        content_name: 'Offer Landing Page',
        content_category: 'Landing Page',
        value: 0,
        currency: 'USD'
      });
      console.log('[Meta Pixel] ViewContent tracked on /offer (PageView fires globally)');
    }

    return () => {
      document.head.removeChild(meta);
      document.head.removeChild(canonical);
    };
  }, []);

  const handleGetStarted = () => {
    const currentParams = new URLSearchParams(window.location.search);
    const newParams = new URLSearchParams();
    
    currentParams.forEach((value, key) => {
      newParams.set(key, value);
    });
    
    if (!newParams.has('src')) newParams.set('src', 'meta');
    if (!newParams.has('camp')) newParams.set('camp', 'offer');
    
    setLocation(`/auth?${newParams.toString()}`);
  };

  const navigateTo = (path: string) => {
    setMobileMenuOpen(false);
    setLocation(path);
  };

  return (
    <div className="min-h-screen bg-background font-sans selection:bg-primary/10" data-testid="page-offer">
      <nav className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigateTo("/")}>
{/* LCP element: Logo in navbar (optimized 2KB) */}
              <img 
                src={jieLogo} 
                alt="JIE Mastery" 
                className="h-10 w-auto"
                width={40}
                height={40}
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
              <span className="text-xl font-bold text-foreground">JIE Mastery</span>
            </div>
            
            <div className="hidden md:flex items-center space-x-6">
              <button onClick={() => navigateTo("/benefits")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-benefits">
                Benefits
              </button>
              <button onClick={() => navigateTo("/offer")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-offers">
                Offers
              </button>
              <button onClick={() => navigateTo("/pricing")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-pricing">
                Pricing
              </button>
              <button onClick={() => navigateTo("/demo")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-demo">
                How It Works
              </button>
              <button onClick={() => navigateTo("/faq")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-faq">
                FAQ
              </button>
              <button onClick={() => navigateTo("/auth")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-login">
                Login
              </button>
            </div>
            
            <div className="hidden md:flex items-center space-x-3">
              <StartTrialButton size="md" />
            </div>

            <button 
              className="md:hidden p-2" 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="button-mobile-menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden border-t border-border py-4 space-y-3">
              <button onClick={() => navigateTo("/benefits")} className="block w-full text-left py-2 text-muted-foreground hover:text-foreground">Benefits</button>
              <button onClick={() => navigateTo("/offer")} className="block w-full text-left py-2 text-muted-foreground hover:text-foreground">Offers</button>
              <button onClick={() => navigateTo("/pricing")} className="block w-full text-left py-2 text-muted-foreground hover:text-foreground">Pricing</button>
              <button onClick={() => navigateTo("/demo")} className="block w-full text-left py-2 text-muted-foreground hover:text-foreground">How It Works</button>
              <button onClick={() => navigateTo("/faq")} className="block w-full text-left py-2 text-muted-foreground hover:text-foreground">FAQ</button>
              <button onClick={() => navigateTo("/auth")} className="block w-full text-left py-2 text-muted-foreground hover:text-foreground">Login</button>
              <div className="mt-2">
                <StartTrialButton size="md" className="w-full" />
              </div>
            </div>
          )}
        </div>
      </nav>

      <section className="relative overflow-hidden pt-8 pb-12 lg:pt-12 lg:pb-16 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-4 py-2 rounded-full text-sm font-semibold" data-testid="badge-offer">
              <Sparkles className="h-4 w-4" />
              Free Trial + 50% Off Your First Month
            </div>

            <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-tight" data-testid="heading-hero">
              AI Homework Help That Teaches Kids to Think
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Online homework help for the whole family. An AI tutor for students that guides learning—not just gives answers.
            </p>

            <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 max-w-md mx-auto" data-testid="discount-callout">
              <p className="text-lg font-bold text-primary">
                Use code <span className="bg-primary text-white px-2 py-1 rounded">WELCOME50</span> for 50% off your first month
              </p>
              <p className="text-sm text-muted-foreground mt-2">Family plans start at $19.99/month</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <StartTrialButton size="lg" className="text-lg h-14 px-8" showSubtext />
              <Button 
                size="lg" 
                variant="outline"
                onClick={handleGetStarted} 
                className="text-lg h-14 px-8"
                data-testid="button-hero-get-started"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 bg-card">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Who It's For</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { icon: <Heart className="h-6 w-6 text-primary" />, text: "Parents looking to help their child with homework" },
              { icon: <BookOpen className="h-6 w-6 text-primary" />, text: "Homeschool families seeking an online tutor for daily support" },
              { icon: <MessageCircle className="h-6 w-6 text-primary" />, text: "Students who learn better with guided conversation" }
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-4 bg-background p-4 rounded-xl border" data-testid={`trust-item-${idx}`}>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {item.icon}
                </div>
                <span className="text-base font-medium">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Key Benefits</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {[
              { icon: <Mic className="h-5 w-5" />, title: "Online tutor for kids", desc: "Voice-first guided conversation" },
              { icon: <Brain className="h-5 w-5" />, title: "Builds independence", desc: "Socratic method teaches thinking" },
              { icon: <BookOpen className="h-5 w-5" />, title: "Homework help for students", desc: "Math, English, Science, Spanish + more" },
              { icon: <Clock className="h-5 w-5" />, title: "Available 24/7", desc: "AI homework help anytime you need it" },
              { icon: <Users className="h-5 w-5" />, title: "Family plans", desc: "Multiple student profiles included" },
              { icon: <Heart className="h-5 w-5" />, title: "Homeschool learning support", desc: "Perfect for any curriculum" }
            ].map((item, idx) => (
              <Card key={idx} className="p-4 border shadow-sm" data-testid={`benefit-tile-${idx}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-base">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-12 bg-card scroll-mt-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">How It Works</h2>
            <p className="text-muted-foreground">Three simple steps</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { step: "1", title: "Choose a subject and grade", desc: "Pick from Math, English, Science, Spanish, and more" },
              { step: "2", title: "Talk with your tutor", desc: "Voice or text—whatever works best for your child" },
              { step: "3", title: "Get guided help", desc: "Practice until it clicks with patient, personalized support" }
            ].map((item, idx) => (
              <Card key={idx} className="text-center p-6 border shadow-sm" data-testid={`step-${idx}`}>
                <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  {item.step}
                </div>
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-10 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center space-y-4">
          <h2 className="text-xl md:text-2xl font-bold">Start your free trial today</h2>
          <p className="text-lg opacity-90">
            Use code <span className="font-bold bg-white/20 px-2 py-1 rounded">WELCOME50</span> — 50% off your first month
          </p>
          <StartTrialButton size="lg" variant="secondary" className="text-lg h-14 px-8" />
        </div>
      </section>

      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Frequently Asked Questions</h2>
          </div>
          <div className="max-w-2xl mx-auto">
            <Accordion type="single" collapsible className="space-y-2">
              {[
                { q: "Is there a free trial?", a: "Yes! You get 30 minutes of free AI tutoring in the real app—no credit card required. Just create an account to start." },
                { q: "What does the family plan include?", a: "All plans include unlimited student profiles. One subscription covers your whole family—perfect for homeschool tutoring or after-school help." },
                { q: "Does it give answers or teach?", a: "JIE Mastery uses the Socratic method to guide students through problems step-by-step. It's real homework help for students—teaching thinking, not just answers." },
                { q: "What subjects are included?", a: "Math, English, Science, and Spanish are all included. Our AI tutor for students supports K-12 and college-level content." },
                { q: "Is this good for homeschool families?", a: "Absolutely! JIE Mastery works as an AI tutor for homeschool students, providing on-demand online homeschool tutoring that adapts to any curriculum." }
              ].map((item, idx) => (
                <AccordionItem key={idx} value={`faq-${idx}`} className="border rounded-lg px-4" data-testid={`faq-item-${idx}`}>
                  <AccordionTrigger className="text-left font-semibold hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-b from-muted/30 to-background">
        <div className="container mx-auto px-4 text-center space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold">Try JIE Mastery AI Tutor Risk-Free</h2>
          <StartTrialButton size="lg" className="text-lg h-14 px-8" showSubtext />
          <p className="text-muted-foreground">
            Code: <span className="font-bold text-primary">WELCOME50</span> (50% off first month)
          </p>
        </div>
      </section>

      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground space-y-2">
          <div className="flex items-center justify-center space-x-2">
            <img src={jieLogo} alt="JIE Mastery" className="h-5 w-auto grayscale opacity-50" />
            <span>&copy; 2026 JIE Mastery AI Tutor</span>
          </div>
          <div className="flex justify-center space-x-6">
            <a onClick={() => navigateTo("/terms")} className="hover:text-primary cursor-pointer transition-colors">Terms</a>
            <a onClick={() => navigateTo("/privacy")} className="hover:text-primary cursor-pointer transition-colors">Privacy</a>
          </div>
        </div>
      </footer>

      <div className="sm:hidden fixed bottom-4 left-4 right-4 z-[60]">
        <StartTrialButton size="lg" className="w-full h-14 shadow-2xl rounded-2xl text-lg font-bold" />
      </div>
    </div>
  );
}
