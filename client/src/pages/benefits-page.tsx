import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import jieLogo from "@/assets/jie-mastery-logo-new.jpg";
import girlWithRobotImage from "@/assets/girl-with-robot-tutor.png";
import { 
  Clock, 
  DollarSign, 
  Target, 
  Calendar, 
  BookOpen, 
  TrendingUp, 
  Users, 
  Shield, 
  Brain, 
  LightbulbIcon, 
  Bot, 
  Sparkles, 
  GraduationCap, 
  Home, 
  FileCheck, 
  Globe, 
  Laptop, 
  Heart,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Zap
} from "lucide-react";

export default function BenefitsPage() {
  const [, setLocation] = useLocation();

  const handleCTA = () => setLocation("/auth");
  const handlePricing = () => setLocation("/pricing");

  return (
    <div className="min-h-screen bg-background font-sans selection:bg-primary/10">
      {/* Navigation - Minimal */}
      <nav className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setLocation("/")}>
              <img src={jieLogo} alt="JIE Mastery" className="h-10 w-auto" />
              <span className="text-xl font-bold text-foreground">JIE Mastery Tutor</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => setLocation("/support")} className="hidden sm:inline-flex">
                Live Support
              </Button>
              <Button variant="ghost" onClick={handlePricing}>
                Pricing
              </Button>
              <Button variant="default" onClick={handleCTA}>
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 lg:pt-24 lg:pb-32 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8 text-center lg:text-left">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary ring-1 ring-inset ring-primary/20">
                    <Zap className="mr-1.5 h-4 w-4" /> The Future of Family Tutoring
                  </span>
                  <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground ring-1 ring-inset ring-muted-foreground/20">
                    Patent Pending System
                  </span>
                </div>
                <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground leading-[1.1]" data-testid="heading-benefits">
                  The <span className="text-primary">AI Tutor</span> That Teaches Your Child How to Learn.
                </h1>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto lg:mx-0">
                  Real learning, not cheating. Personalized AI homework help and math support for every grade. <strong>One affordable plan for the whole family.</strong>
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button size="lg" onClick={handleCTA} className="text-lg h-14 px-8 group" data-testid="button-get-started-hero">
                  Start Learning with an AI Tutor
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
                <Button size="lg" variant="outline" onClick={handlePricing} className="text-lg h-14 px-8">
                  View Pricing & Plans
                </Button>
              </div>

              <div className="flex items-center justify-center lg:justify-start space-x-4 text-sm text-muted-foreground">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-8 w-8 rounded-full border-2 border-background bg-muted flex items-center justify-center">
                      <Users className="h-4 w-4" />
                    </div>
                  ))}
                </div>
                <p>Trusted by 10,000+ happy parents and students.</p>
              </div>
            </div>

            <div className="relative lg:ml-auto">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary to-primary/50 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
              <Card className="relative shadow-2xl overflow-hidden border-0">
                <CardContent className="p-0">
                  <img 
                    src={girlWithRobotImage}
                    alt="AI Tutor for Students"
                    className="w-full aspect-[4/3] object-cover"
                    data-testid="img-hero-ai-tutor"
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition Section */}
      <section className="py-24 bg-card">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">AI Homework Help That Actually Works</h2>
            <p className="text-lg text-muted-foreground">JIE Mastery isn't just an app; it's a dedicated tutor that guides students through challenges step-by-step.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: <Brain className="h-6 w-6 text-primary" />,
                title: "Teaches, Not Cheats",
                description: "Uses the Socratic method to guide students to answers through critical thinking and discovery."
              },
              {
                icon: <Laptop className="h-6 w-6 text-primary" />,
                title: "Personalized Help",
                description: "Adapts to each student's unique learning pace, style, and grade level from K-12 to College."
              },
              {
                icon: <GraduationCap className="h-6 w-6 text-primary" />,
                title: "Math Support",
                description: "Expert assistance for every grade. From basic arithmetic to advanced calculus and beyond."
              },
              {
                icon: <Home className="h-6 w-6 text-primary" />,
                title: "Homeschool Perfect",
                description: "The ideal teaching assistant for homeschool families to fill gaps and reinforce curriculum."
              }
            ].map((item, idx) => (
              <Card key={idx} className="border-none shadow-none bg-background p-6 transition-colors hover:bg-muted/50 group">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  {item.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof / Trust */}
      <section className="py-20 bg-primary/5">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto bg-card p-8 md:p-12 rounded-3xl shadow-xl border border-primary/10">
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <div className="flex-1 space-y-4">
                <div className="flex text-amber-500">
                  {[1, 2, 3, 4, 5].map(i => <Sparkles key={i} className="h-5 w-5 fill-current" />)}
                </div>
                <blockquote className="text-2xl font-medium italic text-foreground leading-relaxed">
                  "JIE Mastery changed our homework routine. Instead of just giving my son the answer, the AI tutor asks him questions that help him figure it out himself. It's safe, effective, and he's actually learning!"
                </blockquote>
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">SM</div>
                  <div>
                    <p className="font-bold">Sarah Miller</p>
                    <p className="text-sm text-muted-foreground">Homeschool Mom of 3</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-4 text-center md:text-left min-w-[200px]">
                <div className="space-y-1">
                  <p className="text-3xl font-extrabold text-primary">100% Safe</p>
                  <p className="text-sm text-muted-foreground">Alternative to Photomath</p>
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-extrabold text-primary">24/7</p>
                  <p className="text-sm text-muted-foreground">Live Support Available</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How Online Tutoring for Kids Works</h2>
            <p className="text-lg text-muted-foreground">Three simple steps to mastery.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              {
                step: "01",
                title: "Ask a Question",
                description: "Type, speak, or upload a photo of any homework problem or concept you're stuck on."
              },
              {
                step: "02",
                title: "Guided Interaction",
                description: "Your AI tutor uses the Socratic method to break down the problem into smaller, manageable parts."
              },
              {
                step: "03",
                title: "True Understanding",
                description: "Students learn the 'why' behind the 'how', building confidence that lasts a lifetime."
              }
            ].map((item, idx) => (
              <div key={idx} className="relative group text-center md:text-left">
                <div className="text-6xl font-black text-primary/10 absolute -top-10 -left-4 z-0 group-hover:text-primary/20 transition-colors">{item.step}</div>
                <div className="relative z-10 space-y-4">
                  <h3 className="text-2xl font-bold">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Reinforcement */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-bold">Ready to Try the Best AI Tutor?</h2>
          <p className="text-xl opacity-90 max-w-2xl mx-auto">Join thousands of families who have replaced expensive tutoring with JIE Mastery.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" onClick={handleCTA} className="text-lg h-16 px-10">
              Start with AI Homework Help
            </Button>
            <Button size="lg" variant="outline" onClick={handlePricing} className="text-lg h-16 px-10 border-primary-foreground hover:bg-primary-foreground hover:text-primary">
              View Pricing
            </Button>
          </div>
          <p className="text-sm opacity-75">No credit card required to start • One plan for the whole family</p>
        </div>
      </section>

      {/* Footer - Minimal */}
      <footer className="py-12 border-t border-border">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center space-x-2">
            <img src={jieLogo} alt="JIE Mastery" className="h-6 w-auto grayscale opacity-50" />
            <span>&copy; 2026 JIE Mastery AI Tutor. All rights reserved.</span>
          </div>
          <div className="flex space-x-6">
            <a onClick={() => setLocation("/terms")} className="hover:text-primary cursor-pointer transition-colors">Terms</a>
            <a onClick={() => setLocation("/privacy")} className="hover:text-primary cursor-pointer transition-colors">Privacy</a>
            <a onClick={() => setLocation("/contact")} className="hover:text-primary cursor-pointer transition-colors">Contact</a>
          </div>
        </div>
      </footer>

      {/* Sticky Mobile CTA */}
      <div className="sm:hidden fixed bottom-4 left-4 right-4 z-[60]">
        <Button onClick={handleCTA} className="w-full h-14 shadow-2xl rounded-2xl text-lg font-bold">
          Try the AI Tutor Today
        </Button>
      </div>
    </div>
  );
}
