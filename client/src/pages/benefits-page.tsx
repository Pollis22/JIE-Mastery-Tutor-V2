import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";
import { StartTrialButton } from "@/components/StartTrialButton";
import { 
  BookOpen, 
  Users, 
  Brain, 
  Sparkles, 
  GraduationCap, 
  Home, 
  CheckCircle2,
  ArrowRight,
  MessageCircle,
  Lightbulb,
  Shield,
  DollarSign,
  Clock,
  Calculator,
  BookText,
  FlaskConical,
  Languages
} from "lucide-react";

export default function BenefitsPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleCTA = () => setLocation("/auth");
  const handlePricing = () => setLocation("/pricing");

  return (
    <div className="min-h-screen bg-background font-sans selection:bg-primary/10">
      {/* Navigation - Full Navigation for Landing Page */}
      <nav className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setLocation("/")}>
              <img src={jieLogo} alt="JIE Mastery" className="h-10 w-auto" />
              <span className="text-xl font-bold text-foreground">JIE Mastery</span>
            </div>
            
            {/* Standard Navigation Links */}
            <div className="hidden md:flex items-center space-x-6">
              <a href="#benefits" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-why">
                Why JIE Mastery AI Tutors
              </a>
              <button onClick={() => setLocation("/demo")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-demo">
                Tutor Demo
              </button>
              <button onClick={() => setLocation("/faq")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-faq">
                FAQ
              </button>
              <button onClick={() => setLocation("/support")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-support">
                Live Support
              </button>
              <button onClick={() => setLocation("/contact")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-contact">
                Contact
              </button>
              <button onClick={() => setLocation("/offer")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-offers">
                Offers
              </button>
              <button onClick={handlePricing} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-pricing">
                Pricing
              </button>
            </div>
            
            <div className="flex items-center space-x-3">
              <Button variant="outline" onClick={handlePricing} className="hidden sm:inline-flex" data-testid="button-nav-pricing">
                View Pricing
              </Button>
              <Button variant="default" onClick={handleCTA} data-testid="button-nav-cta">
                Try JIE Mastery AI Tutor
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Above the Fold */}
      <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-24 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-6 text-center lg:text-left">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.1]" data-testid="heading-hero">
                Online Homework Help — AI Tutor for Students
              </h1>
              
              <p className="text-lg font-semibold text-primary bg-primary/10 px-4 py-2 rounded-lg inline-block" data-testid="text-promo-discount">
                Get 50% off the first month with your discount code! <button onClick={() => setLocation("/contact")} className="underline hover:no-underline">Contact us</button> if you need the code.
              </p>
              
              <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto lg:mx-0">
                Personalized AI homework help that teaches students how to think — not just give answers.
              </p>
              
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto lg:mx-0">
                An online tutor for kids in homeschool and traditional classrooms.<br />
                Math, English, Science, Spanish & more.
              </p>

              <div className="flex flex-col gap-4 max-w-sm mx-auto lg:mx-0 pt-2">
                <StartTrialButton size="lg" className="text-lg h-14 w-full" showSubtext />
                <Button size="lg" onClick={handleCTA} className="text-lg h-14 w-full" data-testid="button-hero-cta">
                  Try JIE Mastery AI Tutor
                </Button>
                <Button size="lg" onClick={() => setLocation("/support")} className="text-lg h-14 w-full bg-red-600 hover:bg-red-700 text-white border-0" data-testid="button-chat-live">
                  Chat with Live AI Agent
                </Button>
                <Button size="lg" variant="outline" onClick={handlePricing} className="text-lg h-14 w-full" data-testid="button-hero-pricing">
                  View Pricing
                </Button>
              </div>

              <p className="text-sm text-muted-foreground pt-2">
                Plans start at <strong className="text-foreground">$19.99/month</strong> • Family-friendly • Cancel anytime
              </p>
            </div>

            <div className="relative lg:ml-auto w-full lg:w-[600px] xl:w-[700px]">
              <Card className="relative shadow-2xl overflow-hidden border-0">
                <CardContent className="p-0">
                  <div className="aspect-video w-full">
                    <iframe
                      src="https://www.youtube.com/embed/Dzi3rJmnRg0"
                      title="JIE Mastery AI Tutor"
                      className="w-full h-full"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      data-testid="video-hero-ai-tutor"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-card">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Why Families Choose JIE Mastery for Homework Help</h2>
            <p className="text-lg text-muted-foreground">Affordable AI tutoring that builds real understanding for students of all ages.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: <GraduationCap className="h-7 w-7 text-primary" />,
                title: "AI Tutor for Students",
                description: "Personalized online homework help that adapts to grade level and learning style."
              },
              {
                icon: <Brain className="h-7 w-7 text-primary" />,
                title: "Help My Child With Homework",
                description: "Guided explanations that build understanding—no answer-giving."
              },
              {
                icon: <Home className="h-7 w-7 text-primary" />,
                title: "Homeschool Tutor & Classroom Support",
                description: "Online homeschool tutoring that works with any curriculum."
              },
              {
                icon: <DollarSign className="h-7 w-7 text-primary" />,
                title: "Affordable Online Tutoring",
                description: "One subscription gives your whole family AI homework help."
              }
            ].map((item, idx) => (
              <Card key={idx} className="border shadow-sm bg-background p-6 transition-all hover:shadow-md">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                  {item.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button size="lg" onClick={handlePricing} className="text-lg h-12 px-8" data-testid="button-benefits-pricing">
              View Pricing
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Keyword-Reinforced Feature Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Homework Help for Students in Every Subject</h2>
            <p className="text-lg text-muted-foreground">An online tutor for kids and teens covering all the subjects they need—from K-12 to college.</p>
          </div>
          
          <div className="max-w-3xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { icon: <Calculator className="h-5 w-5 text-primary" />, text: "Math homework help—step by step" },
                { icon: <BookText className="h-5 w-5 text-primary" />, text: "English reading and writing support" },
                { icon: <FlaskConical className="h-5 w-5 text-primary" />, text: "Science explanations made simple" },
                { icon: <Languages className="h-5 w-5 text-primary" />, text: "Spanish practice and tutoring" },
                { icon: <Clock className="h-5 w-5 text-primary" />, text: "Homeschool homework help—available 24/7" },
                { icon: <Shield className="h-5 w-5 text-primary" />, text: "Safe, parent-approved homeschool learning support" }
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-4 bg-card p-4 rounded-xl border">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {item.icon}
                  </div>
                  <span className="text-lg font-medium">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center mt-12">
            <Button size="lg" variant="outline" onClick={handleCTA} className="text-lg h-12 px-8" data-testid="button-features-cta">
              Try JIE Mastery AI Tutor
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-card">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How JIE Mastery AI Tutor Works</h2>
            <p className="text-lg text-muted-foreground">Three simple steps to better learning.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                icon: <MessageCircle className="h-8 w-8 text-primary" />,
                title: "Student Asks a Question",
                description: "Type, speak, or upload a photo of any homework problem or concept."
              },
              {
                icon: <Brain className="h-8 w-8 text-primary" />,
                title: "AI Tutor Guides Reasoning",
                description: "The tutor asks guiding questions to help students think through the problem."
              },
              {
                icon: <Lightbulb className="h-8 w-8 text-primary" />,
                title: "Student Gains Understanding",
                description: "Real comprehension and confidence that lasts beyond the assignment."
              }
            ].map((item, idx) => (
              <Card key={idx} className="text-center p-8 border shadow-sm">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
                  {item.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button size="lg" onClick={handlePricing} className="text-lg h-12 px-8" data-testid="button-howitworks-pricing">
              View Pricing
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Social Proof / Trust Section */}
      <section className="py-20 bg-primary/5">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Trusted by Families and Students</h2>
            <p className="text-lg text-muted-foreground">See what parents are saying about our AI tutor for students.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                quote: "My child finally understands math instead of memorizing answers. This is real homework help for students.",
                initials: "SM",
                role: "Parent of 4th grader"
              },
              {
                quote: "As a homeschool mom, having an AI tutor for homeschool students changed everything. Homework time is now productive.",
                initials: "JT",
                role: "Homeschool Mom"
              },
              {
                quote: "Way better value than private tutors at $50/hour. The AI tutor is available whenever my kids need it.",
                initials: "RM",
                role: "Dad of 3"
              }
            ].map((item, idx) => (
              <Card key={idx} className="p-6 border shadow-sm">
                <div className="flex text-amber-500 mb-4">
                  {[1, 2, 3, 4, 5].map(i => <Sparkles key={i} className="h-4 w-4 fill-current" />)}
                </div>
                <blockquote className="text-lg font-medium italic text-foreground mb-4">
                  "{item.quote}"
                </blockquote>
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary text-sm">
                    {item.initials}
                  </div>
                  <p className="text-sm text-muted-foreground">{item.role}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, Affordable Plans</h2>
            <p className="text-lg text-muted-foreground">One plan covers all your children. No per-child fees.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {[
              { name: "Starter", price: "$19.99", minutes: "60 min", perMin: "$0.33/min", highlight: false },
              { name: "Standard", price: "$59.99", minutes: "240 min", perMin: "$0.25/min", highlight: false },
              { name: "Pro", price: "$99.99", minutes: "600 min", perMin: "$0.17/min", highlight: true, badge: "Most Popular" },
              { name: "Elite", price: "$199.99", minutes: "1,800 min", perMin: "$0.11/min", highlight: false, badge: "Best Value" }
            ].map((plan, idx) => (
              <Card key={idx} className={`relative p-6 ${plan.highlight ? 'border-2 border-primary shadow-lg' : 'border'}`}>
                {plan.badge && (
                  <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${plan.highlight ? 'bg-primary text-white' : 'bg-muted text-foreground'}`}>
                    {plan.badge}
                  </div>
                )}
                <div className="text-center space-y-4 pt-2">
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <div>
                    <span className="text-3xl font-extrabold">{plan.price}</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.minutes} shared by family</p>
                  <p className="text-xs text-primary font-medium">{plan.perMin}</p>
                  <ul className="text-sm text-left space-y-2 pt-4 border-t">
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" /> Unlimited student profiles</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" /> Socratic teaching method</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" /> Math, English, Spanish</li>
                  </ul>
                  <Button 
                    onClick={handleCTA} 
                    className="w-full"
                    variant={plan.highlight ? 'default' : 'outline'}
                    data-testid={`button-plan-${plan.name.toLowerCase()}`}
                  >
                    Get Started
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          
          <div className="text-center mt-10 space-y-3">
            <p className="text-muted-foreground">Family-friendly subscriptions • Multiple learners per account • No contracts</p>
            <Button size="lg" onClick={handlePricing} className="text-lg h-12 px-8" data-testid="button-pricing-full">
              View Full Pricing
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center space-y-8">
          <h2 className="text-3xl md:text-4xl font-bold">Ready for Better Homework Help?</h2>
          <p className="text-lg opacity-90 max-w-2xl mx-auto">
            Join families using personalized AI tutoring for homework help—teaching, not cheating.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" onClick={handleCTA} className="text-lg h-14 px-8" data-testid="button-final-cta">
              Try JIE Mastery AI Tutor
            </Button>
            <Button size="lg" onClick={handlePricing} className="text-lg h-14 px-8 bg-white/20 hover:bg-white/30 text-white border-0" data-testid="button-final-pricing">
              View Pricing
            </Button>
          </div>
          <p className="text-sm opacity-75">One plan for the whole family • Cancel anytime</p>
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
        <Button onClick={handleCTA} className="w-full h-14 shadow-2xl rounded-2xl text-lg font-bold" data-testid="button-mobile-sticky">
          Try JIE Mastery AI Tutor
        </Button>
      </div>
    </div>
  );
}
