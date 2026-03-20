import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { PublicMobileMenu } from "@/components/PublicMobileMenu";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";
import { StartTrialButton } from "@/components/StartTrialButton";
import {
  Brain,
  Sparkles,
  GraduationCap,
  Home,
  CheckCircle2,
  ArrowRight,
  MessageCircle,
  Lightbulb,
  Shield,
  Clock,
  Calculator,
  BookText,
  FlaskConical,
  Languages,
  TrendingUp,
  AlertTriangle,
  Target,
  Star,
  Zap,
  Users,
  Trophy,
  BookOpen,
  ChevronDown,
} from "lucide-react";

// ─── Data ────────────────────────────────────────────────────────────────────

const STATS = [
  { value: "3×", label: "Faster concept mastery vs passive reading" },
  { value: "94%", label: "Of students improve grades within 30 days" },
  { value: "K–Graduate", label: "Coverage across every grade level" },
  { value: "$0.11", label: "Per minute on Elite — less than a coffee" },
];

const FEATURES = [
  {
    icon: <Brain className="h-6 w-6" />,
    title: "Socratic Teaching — No Cheating",
    description:
      "Our AI never gives direct answers. It asks guiding questions that build genuine understanding, so homework time becomes real learning time.",
    highlight: true,
  },
  {
    icon: <AlertTriangle className="h-6 w-6" />,
    title: "Flags Learning Challenges",
    description:
      "The AI detects when a student is consistently struggling with a concept and alerts parents — catching gaps before they become bigger problems.",
    highlight: true,
  },
  {
    icon: <TrendingUp className="h-6 w-6" />,
    title: "Adaptive Learning Engine",
    description:
      "Each session builds a richer picture of your child's strengths and gaps. The tutor adjusts difficulty, pacing, and approach in real time.",
    highlight: false,
  },
  {
    icon: <Target className="h-6 w-6" />,
    title: "Custom Learning Paths",
    description:
      "Whether your child needs to master fractions or prep for the SAT, the AI creates a personalized roadmap and tracks progress session by session.",
    highlight: false,
  },
  {
    icon: <GraduationCap className="h-6 w-6" />,
    title: "College Prep: SAT, ACT, GMAT, LSAT",
    description:
      "From high school juniors to grad school applicants — rigorous test prep built right into the platform. No extra subscription needed.",
    highlight: true,
  },
  {
    icon: <Shield className="h-6 w-6" />,
    title: "Enterprise-Grade Safety",
    description:
      "Multi-layer content guardrails and age-appropriate filtering. Built for kids, secured like a bank. Parents can trust every session.",
    highlight: false,
  },
  {
    icon: <BookOpen className="h-6 w-6" />,
    title: "Real-Time Parent Transcripts",
    description:
      "Every session is saved. Parents can review exactly what was covered, see where their child struggled, and track growth over time.",
    highlight: false,
  },
  {
    icon: <Users className="h-6 w-6" />,
    title: "Unlimited Sibling Profiles",
    description:
      "One subscription covers every child in your family. Each gets a fully personalized experience — from kindergarten through college.",
    highlight: false,
  },
];

const SUBJECTS = [
  { icon: <Calculator className="h-5 w-5" />, label: "Mathematics", sub: "K–12 + Calculus" },
  { icon: <BookText className="h-5 w-5" />, label: "English & Writing", sub: "Reading, essays, grammar" },
  { icon: <FlaskConical className="h-5 w-5" />, label: "Science", sub: "Biology, Chemistry, Physics" },
  { icon: <Languages className="h-5 w-5" />, label: "Spanish", sub: "Conversational + academic" },
  { icon: <Trophy className="h-5 w-5" />, label: "SAT / ACT Prep", sub: "Standard & Pro plans" },
  { icon: <GraduationCap className="h-5 w-5" />, label: "GMAT / LSAT", sub: "Elite plan" },
  { icon: <Home className="h-5 w-5" />, label: "Homeschool Support", sub: "Any curriculum" },
  { icon: <Zap className="h-5 w-5" />, label: "History & Social Studies", sub: "K–12" },
];

const TESTIMONIALS = [
  {
    quote:
      "My son went from Ds to Bs in 6 weeks. The AI caught that he was guessing on fractions — something his teacher hadn't noticed.",
    initials: "SM",
    role: "Parent of 4th grader, Chicago",
  },
  {
    quote:
      "As a homeschool mom of 4, this replaced three separate tutors. Each child gets a completely different experience. Game changer.",
    initials: "JT",
    role: "Homeschool Parent, Texas",
  },
  {
    quote:
      "My daughter used the SAT prep feature and jumped from a 1150 to a 1380. At $99/month for the whole family? Unreal value.",
    initials: "RM",
    role: "Dad of 3, New York",
  },
];

const PLANS = [
  { name: "Starter", price: "$19.99", minutes: "2 hrs", highlight: false, badge: "", satact: false, gmat: false },
  { name: "Standard", price: "$59.99", minutes: "7 hrs", highlight: false, badge: "", satact: true, gmat: false },
  { name: "Pro", price: "$99.99", minutes: "13 hrs", highlight: true, badge: "Most Popular", satact: true, gmat: false },
  { name: "Elite", price: "$199.99", minutes: "25 hrs", highlight: false, badge: "Best Value", satact: true, gmat: true },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function BenefitsPage() {
  const [, setLocation] = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleCTA = () => setLocation("/auth?action=register");
  const handlePricing = () => setLocation("/pricing");

  return (
    <div className="min-h-screen bg-background font-sans selection:bg-primary/10">

      {/* ── Navigation ── */}
      <nav
        className={`border-b border-border sticky top-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-card/95 backdrop-blur-md shadow-sm" : "bg-card/80 backdrop-blur-md"
        }`}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div
              className="flex items-center space-x-3 cursor-pointer"
              onClick={() => setLocation("/")}
            >
              <img src={jieLogo} alt="JIE Mastery" className="h-10 w-auto" />
              <span className="text-xl font-bold text-foreground">JIE Mastery</span>
            </div>
            <div className="hidden md:flex items-center space-x-6">
              {[
                { label: "Why JIE Mastery AI Tutors", path: "#benefits" },
                { label: "Tutor Demo", path: "/demo" },
                { label: "FAQ", path: "/faq" },
                { label: "Live Support", path: "/support" },
                { label: "Contact", path: "/contact" },
                { label: "Offers", path: "/offer" },
                { label: "Pricing", path: "/pricing" },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() =>
                    item.path.startsWith("#")
                      ? document.getElementById("benefits")?.scrollIntoView({ behavior: "smooth" })
                      : setLocation(item.path)
                  }
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="hidden md:flex items-center space-x-3">
              <Button variant="outline" onClick={handlePricing} data-testid="button-nav-pricing">
                View Pricing
              </Button>
              <Button variant="default" onClick={handleCTA} data-testid="button-nav-cta">
                Try JIE Mastery AI Tutor
              </Button>
            </div>
            <PublicMobileMenu onSignIn={() => setLocation("/auth?action=login")} />
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-16 pb-20 lg:pt-24 lg:pb-32">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-background pointer-events-none" />
        <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-primary/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            {/* Left */}
            <div className="space-y-7 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-sm font-semibold px-4 py-2 rounded-full">
                <Sparkles className="h-4 w-4" />
                50% off first month —{" "}
                <button
                  onClick={() => setLocation("/contact")}
                  className="underline hover:no-underline"
                >
                  Get your code
                </button>
              </div>

              <h1
                className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.08]"
                data-testid="heading-hero"
              >
                The AI Tutor That{" "}
                <span className="text-primary">Teaches</span> —{" "}
                Not Just Answers
              </h1>

              <p className="text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Personalized AI homework help for every subject and every grade — K through graduate school.
                Flags learning gaps. Builds real skills. Covers your whole family for one price.
              </p>

              <div className="flex flex-wrap items-center gap-4 justify-center lg:justify-start text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-500" /> 30-min free trial
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-500" /> Card required, cancel anytime
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-500" /> Cancel anytime
                </span>
              </div>

              <div className="flex flex-col gap-3 max-w-sm mx-auto lg:mx-0 pt-1">
                <StartTrialButton size="lg" className="text-lg h-14 w-full" showSubtext />
                <Button size="lg" onClick={handleCTA} className="text-lg h-14 w-full" data-testid="button-hero-cta">
                  Try JIE Mastery AI Tutor
                </Button>
                <Button
                  size="lg"
                  onClick={() => setLocation("/support")}
                  className="text-lg h-14 w-full bg-red-600 hover:bg-red-700 text-white border-0"
                  data-testid="button-chat-live"
                >
                  Chat with Live AI Agent
                </Button>
                <Button size="lg" variant="outline" onClick={handlePricing} className="text-lg h-14 w-full" data-testid="button-hero-pricing">
                  View Pricing
                </Button>
              </div>

              <p className="text-sm text-muted-foreground pt-1">
                Plans start at <strong className="text-foreground">$19.99/month</strong> • Whole family covered • Cancel anytime
              </p>
            </div>

            {/* Right — video */}
            <div className="relative lg:ml-auto w-full">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-border/40">
                <div className="aspect-video w-full">
                  <iframe
                    src="https://www.youtube.com/embed/e8WgxSMhnGY"
                    title="JIE Mastery AI Tutor"
                    className="w-full h-full"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    data-testid="video-hero-ai-tutor"
                  />
                </div>
              </div>
              {/* Floating trust badge */}
              <div className="absolute -bottom-5 -left-4 bg-card border border-border rounded-xl px-4 py-3 shadow-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Brain className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Teaching method</p>
                  <p className="text-sm font-bold text-foreground">Socratic AI — Builds real skills</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center mt-20">
            <button
              onClick={() => document.getElementById("stats")?.scrollIntoView({ behavior: "smooth" })}
              className="flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors animate-bounce"
            >
              <span className="text-xs uppercase tracking-widest font-medium">See the Results</span>
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section id="stats" className="py-14 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            {STATS.map((s, i) => (
              <div key={i} className="space-y-1">
                <p className="text-4xl font-extrabold">{s.value}</p>
                <p className="text-sm opacity-80 leading-snug">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section id="benefits" className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-sm font-semibold text-primary uppercase tracking-widest bg-primary/10 px-4 py-2 rounded-full">
              Why JIE Mastery Works
            </span>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mt-5 mb-4">
              More Than Homework Help — A Complete Learning System
            </h2>
            <p className="text-lg text-muted-foreground">
              Built for families who want their kids to actually understand — not just finish assignments.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f, i) => (
              <Card
                key={i}
                className={`relative border transition-all hover:shadow-lg hover:-translate-y-0.5 duration-200 ${
                  f.highlight
                    ? "border-primary/40 bg-gradient-to-br from-primary/5 to-background shadow-md"
                    : "bg-card"
                }`}
              >
                {f.highlight && (
                  <div className="absolute top-3 right-3">
                    <Star className="h-4 w-4 text-primary fill-primary" />
                  </div>
                )}
                <CardContent className="p-6 space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    {f.icon}
                  </div>
                  <h3 className="text-lg font-bold leading-snug">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button size="lg" onClick={handlePricing} className="text-lg h-12 px-8" data-testid="button-benefits-pricing">
              View Plans & Pricing
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── Subjects ── */}
      <section className="py-24 bg-muted/40">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Every Subject. Every Grade. One Subscription.
            </h2>
            <p className="text-lg text-muted-foreground">
              From kindergarten math to LSAT prep — JIE Mastery covers the full academic journey.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {SUBJECTS.map((s, i) => (
              <div
                key={i}
                className="bg-card border border-border rounded-xl p-5 flex flex-col items-center text-center gap-3 hover:border-primary/40 hover:shadow-md transition-all duration-200 cursor-default"
              >
                <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  {s.icon}
                </div>
                <div>
                  <p className="font-bold text-sm text-foreground">{s.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button size="lg" variant="outline" onClick={handleCTA} className="text-lg h-12 px-8" data-testid="button-subjects-cta">
              Try It Free — 30 Minutes, Card Required
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-24 bg-card">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works in 3 Steps</h2>
            <p className="text-lg text-muted-foreground">
              Simple enough for a kindergartner. Powerful enough for grad school prep.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                icon: <MessageCircle className="h-8 w-8 text-primary" />,
                step: "01",
                title: "Student Asks a Question",
                description: "Speak, type, or upload a photo of any homework problem. Works on any device, anytime — 24/7.",
              },
              {
                icon: <Brain className="h-8 w-8 text-primary" />,
                step: "02",
                title: "AI Guides With Questions",
                description:
                  "The tutor never gives the answer. It asks smart guiding questions that lead students to discover solutions themselves.",
              },
              {
                icon: <Lightbulb className="h-8 w-8 text-primary" />,
                step: "03",
                title: "Real Understanding Sticks",
                description: "Students build skills that transfer to tests and future classes — not just tonight's homework.",
              },
            ].map((item, idx) => (
              <div key={idx} className="relative text-center">
                <div className="absolute top-4 left-1/2 -translate-x-1/2 text-8xl font-black text-muted/15 select-none pointer-events-none leading-none">
                  {item.step}
                </div>
                <Card className="relative p-8 border shadow-sm hover:shadow-md transition-shadow duration-200 bg-background">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
                    {item.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{item.description}</p>
                </Card>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Button size="lg" onClick={handleCTA} className="text-lg h-12 px-8" data-testid="button-howitworks-cta">
              Start Your Free Trial
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-24 bg-primary/5">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Families Are Seeing Real Results</h2>
            <p className="text-lg text-muted-foreground">Real stories from parents using JIE Mastery every day.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {TESTIMONIALS.map((t, i) => (
              <Card key={i} className="p-6 border shadow-sm bg-card hover:shadow-md transition-shadow duration-200">
                <div className="flex text-amber-400 mb-4 gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <blockquote className="text-base font-medium italic text-foreground mb-5 leading-relaxed">
                  "{t.quote}"
                </blockquote>
                <div className="flex items-center space-x-3 pt-4 border-t border-border">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">
                    {t.initials}
                  </div>
                  <p className="text-sm text-muted-foreground">{t.role}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing Preview ── */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple Family Pricing</h2>
            <p className="text-lg text-muted-foreground">
              One subscription covers every child. Unlimited sibling profiles. No per-child fees.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
            {PLANS.map((plan, idx) => (
              <Card
                key={idx}
                className={`relative p-6 transition-all hover:shadow-lg duration-200 ${
                  plan.highlight ? "border-2 border-primary shadow-lg scale-[1.02]" : "border"
                }`}
              >
                {plan.badge && (
                  <div
                    className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                      plan.highlight ? "bg-primary text-white" : "bg-muted text-foreground"
                    }`}
                  >
                    {plan.badge}
                  </div>
                )}
                <div className="text-center space-y-4 pt-2">
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <div>
                    <span className="text-3xl font-extrabold">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">/mo</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.minutes} shared by family</p>
                  <ul className="text-sm text-left space-y-2 pt-4 border-t">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      Unlimited sibling profiles
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      Flags learning challenges
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      Socratic teaching method
                    </li>
                    {plan.satact && (
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        SAT / ACT prep
                      </li>
                    )}
                    {plan.gmat && (
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        GMAT / LSAT prep
                      </li>
                    )}
                  </ul>
                  <Button
                    onClick={handleCTA}
                    className="w-full"
                    variant={plan.highlight ? "default" : "outline"}
                    data-testid={`button-plan-${plan.name.toLowerCase()}`}
                  >
                    Get Started
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          <div className="text-center mt-10 space-y-4">
            <p className="text-muted-foreground text-sm">
              All plans include a 30-minute free trial • No contracts • Cancel anytime
            </p>
            <Button size="lg" onClick={handlePricing} className="text-lg h-12 px-8" data-testid="button-pricing-full">
              View Full Pricing Details
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 text-center space-y-8 relative z-10">
          <h2 className="text-3xl md:text-5xl font-extrabold leading-tight">
            Stop Paying $50+/Hour for One Tutor.<br />
            <span className="opacity-90">Cover Your Whole Family for Less.</span>
          </h2>
          <p className="text-lg opacity-85 max-w-2xl mx-auto">
            JIE Mastery teaches every child in your family — detecting gaps, building skills, and preparing them
            from kindergarten all the way through grad school exams.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" onClick={handleCTA} className="text-lg h-14 px-10 font-bold" data-testid="button-final-cta">
              Start Your Free Trial
            </Button>
            <Button
              size="lg"
              onClick={handlePricing}
              className="text-lg h-14 px-10 bg-white/20 hover:bg-white/30 text-white border border-white/30"
              data-testid="button-final-pricing"
            >
              View Pricing
            </Button>
          </div>
          <p className="text-sm opacity-70">30-minute free trial • Card required • Cancel anytime to pay nothing</p>
        </div>
      </section>

      {/* ── Footer ── */}
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

      {/* ── Sticky Mobile CTA ── */}
      <div className="sm:hidden fixed bottom-4 left-4 right-4 z-[60]">
        <Button onClick={handleCTA} className="w-full h-14 shadow-2xl rounded-2xl text-lg font-bold" data-testid="button-mobile-sticky">
          Try JIE Mastery AI Tutor
        </Button>
      </div>
    </div>
  );
}
