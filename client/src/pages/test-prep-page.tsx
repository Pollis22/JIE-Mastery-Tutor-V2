import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { PublicMobileMenu } from "@/components/PublicMobileMenu";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";
import { StartTrialButton } from "@/components/StartTrialButton";
import {
  GraduationCap,
  BookOpen,
  Target,
  Clock,
  Brain,
  CheckCircle2,
  ArrowRight,
  Zap,
  Trophy,
  FileText,
  MessageCircle,
  HelpCircle,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";

// ─── Exam Coverage ───────────────────────────────────────────────────────────

const EXAM_CATEGORIES = [
  {
    title: "College Admissions",
    exams: [
      { name: "SAT", icon: "📝", description: "Reading/Writing + Math — Digital adaptive format" },
      { name: "ACT", icon: "📝", description: "English, Math, Reading, Science — Speed-focused" },
    ],
  },
  {
    title: "Graduate Admissions",
    exams: [
      { name: "GRE", icon: "🎓", description: "Verbal, Quantitative, Analytical Writing" },
      { name: "GMAT", icon: "🎓", description: "Quant, Verbal, Data Insights — Business school" },
      { name: "LSAT", icon: "⚖️", description: "Logical Reasoning, Logic Games, Reading Comp" },
      { name: "MCAT", icon: "🩺", description: "Bio/Biochem, Chem/Phys, Psych/Soc, CARS" },
      { name: "DAT", icon: "🦷", description: "Natural Sciences, PAT, Reading, Quant" },
      { name: "PCAT", icon: "💊", description: "Bio, Chemical Processes, Reading, Quant" },
      { name: "OAT", icon: "👁️", description: "Natural Sciences, Physics, Reading, Quant" },
    ],
  },
  {
    title: "Professional Certifications",
    exams: [
      { name: "CPA", icon: "🧮", description: "FAR, AUD, REG, BEC — Accounting certification" },
      { name: "CFA", icon: "📊", description: "Ethics, Financial Reporting, Equity — 3 levels" },
      { name: "Series 7", icon: "💹", description: "Options, suitability, regulations — Securities" },
      { name: "NCLEX-RN", icon: "🏥", description: "Prioritization, pharmacology, patient safety" },
      { name: "FE", icon: "⚙️", description: "Fundamentals of Engineering — Math, economics" },
      { name: "PE", icon: "🏗️", description: "Professional Engineering — Discipline-specific" },
      { name: "Praxis", icon: "🍎", description: "Teacher certification — Content + pedagogy" },
      { name: "PANCE", icon: "🩻", description: "Physician Assistant — Clinical decision-making" },
      { name: "ASWB", icon: "🤝", description: "Social Work licensing — Ethics, assessment" },
    ],
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: "1",
    title: "Select Your Exam",
    description: "Choose your target exam from the subject dropdown on the tutor page. Set your grade level to College/Adult to see all options.",
    icon: <Target className="h-6 w-6" />,
  },
  {
    step: "2",
    title: "Load a Study Guide (Optional)",
    description: "Browse the Study Guide Library in your dashboard under Study Materials. Add strategy guides and practice question banks to your documents.",
    icon: <FileText className="h-6 w-6" />,
  },
  {
    step: "3",
    title: "Enable Practice Mode (Optional)",
    description: "Check the Practice Mode box next to the subject selector. The tutor will run a structured drill — presenting questions, tracking your progress, and adapting difficulty.",
    icon: <Zap className="h-6 w-6" />,
  },
  {
    step: "4",
    title: "Start Your Session",
    description: "Hit Start Tutor Session. The AI tutor knows your exam inside and out — sections, timing, scoring, strategies. Ask anything or let Practice Mode guide you.",
    icon: <MessageCircle className="h-6 w-6" />,
  },
];

const WHAT_IT_IS = [
  "An AI tutor that knows the structure, timing, and strategy for 18 major exams",
  "Direct teaching — explains techniques and methods clearly, then lets you practice",
  "Practice Mode that drills you with exam-style questions and tracks your progress",
  "Study guides with strategy overviews and practice question walkthroughs",
  "Available 24/7 — study at 2 AM before your exam if you need to",
  "Works alongside your existing prep materials — upload your own documents too",
];

const WHAT_IT_IS_NOT = [
  "Not a replacement for a full test prep course (Kaplan, Princeton Review, etc.)",
  "Not an official question bank — questions are AI-generated in exam style, not from real past exams",
  "Not a score predictor — we help you learn, but cannot guarantee specific score improvements",
  "Not a proctor or testing simulation — we do not replicate the exact test-day software",
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function TestPrepPage() {
  const [, setLocation] = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleCTA = () => setLocation("/auth?action=register");
  const handlePricing = () => setLocation("/pricing");

  return (
    <div className="min-h-screen bg-background text-foreground">
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
                { label: "Benefits", path: "/benefits" },
                { label: "Test Prep", path: "/test-prep" },
                { label: "FAQ", path: "/faq" },
                { label: "Contact", path: "/contact" },
                { label: "Pricing", path: "/pricing" },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => setLocation(item.path)}
                  className={`text-sm transition-colors ${
                    item.path === "/test-prep"
                      ? "text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="hidden md:flex items-center space-x-3">
              <Button variant="outline" onClick={handlePricing}>
                View Pricing
              </Button>
              <Button variant="default" onClick={handleCTA}>
                Try JIE Mastery AI Tutor
              </Button>
            </div>
            <PublicMobileMenu onSignIn={() => setLocation("/auth?action=login")} />
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="py-16 md:py-24 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <GraduationCap className="h-4 w-4" />
            College & Post-Graduate Test Prep
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Your AI Test Prep Coach
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Direct teaching, exam-specific strategy, and structured practice for 18 major exams — from SAT to CPA. 
            No Socratic questioning. Just clear explanations and real practice.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <StartTrialButton size="lg" className="text-lg h-14 px-8" />
            <Button size="lg" variant="outline" onClick={handlePricing} className="text-lg h-14 px-8">
              View Plans
            </Button>
          </div>
        </div>
      </section>

      {/* ── What It Is / What It Is Not ── */}
      <section className="py-12 md:py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-5xl">
          <div className="grid md:grid-cols-2 gap-8">
            {/* What It Is */}
            <Card className="border-green-200 dark:border-green-800">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <h3 className="text-lg font-bold">What Test Prep Includes</h3>
                </div>
                <ul className="space-y-3">
                  {WHAT_IT_IS.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* What It Is Not */}
            <Card className="border-amber-200 dark:border-amber-800">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <h3 className="text-lg font-bold">What It Is Not</h3>
                </div>
                <ul className="space-y-3">
                  {WHAT_IT_IS_NOT.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <HelpCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    <strong>Our recommendation:</strong> Use JIE Mastery as a supplement to your primary study plan. 
                    It is most effective for concept review, strategy coaching, and practice drilling — especially 
                    when you are stuck on a specific topic or want extra reps before test day.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-12 md:py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold text-center mb-10">How to Use Test Prep</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {HOW_IT_WORKS_STEPS.map((step) => (
              <Card key={step.step} className="relative overflow-hidden">
                <CardContent className="pt-6">
                  <div className="absolute top-3 right-3 text-4xl font-bold text-primary/10">{step.step}</div>
                  <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary mb-3">
                    {step.icon}
                  </div>
                  <h3 className="font-bold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Two Modes ── */}
      <section className="py-12 md:py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold text-center mb-10">Two Ways to Study</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <Card>
              <CardContent className="pt-6">
                <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-4">
                  <Brain className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-bold mb-2">Open Tutoring Mode</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Ask the tutor anything about your exam. Get direct explanations of concepts, strategies, 
                  and techniques. Upload your own study materials and work through them together. 
                  The tutor knows your exam structure and coaches accordingly.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Lightbulb className="h-4 w-4 text-blue-500" />
                    <span>Ask about any concept or strategy</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Lightbulb className="h-4 w-4 text-blue-500" />
                    <span>Upload and work through your own materials</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Lightbulb className="h-4 w-4 text-blue-500" />
                    <span>Request practice questions on specific topics</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/30">
              <CardContent className="pt-6">
                <div className="h-12 w-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-2">Practice Mode</h3>
                <div className="inline-block bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5 rounded mb-3">
                  Structured Drill
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Enable Practice Mode and the tutor runs a focused drill session. Questions presented 
                  one at a time, answers evaluated with explanations, progress tracked every 5 questions, 
                  and difficulty adapts to your performance.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Target className="h-4 w-4 text-primary" />
                    <span>Structured question-by-question drills</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Target className="h-4 w-4 text-primary" />
                    <span>Progress tracking with score updates</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Target className="h-4 w-4 text-primary" />
                    <span>Adaptive difficulty — gets harder as you improve</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ── Exam Coverage ── */}
      <section className="py-12 md:py-16 px-4" id="exams">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold text-center mb-3">18 Exams Covered</h2>
          <p className="text-center text-muted-foreground mb-10 max-w-xl mx-auto">
            Each exam has a dedicated AI coaching profile with section-specific strategies, 
            plus downloadable study guides and practice question banks.
          </p>

          {EXAM_CATEGORIES.map((category) => (
            <div key={category.title} className="mb-8">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                {category.title}
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {category.exams.map((exam) => (
                  <div
                    key={exam.name}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-2xl">{exam.icon}</span>
                    <div>
                      <div className="font-semibold text-sm">{exam.name}</div>
                      <div className="text-xs text-muted-foreground">{exam.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tips for Best Results ── */}
      <section className="py-12 md:py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold text-center mb-8">Tips for Best Results</h2>
          <div className="space-y-4">
            {[
              {
                title: "Load the study guide for your exam",
                detail: "Go to Dashboard → Study Materials → Study Guides. Add the strategy guide AND the practice questions guide for your exam. Select both before starting a session.",
              },
              {
                title: "Start with Open Tutoring, then switch to Practice Mode",
                detail: "Use Open Tutoring to review concepts you are shaky on. Once you feel solid, enable Practice Mode to drill and test yourself.",
              },
              {
                title: "Tell the tutor your target score",
                detail: "Early in the session, mention your goal score and your current practice score. The tutor will calibrate its coaching to close that specific gap.",
              },
              {
                title: "Focus on one section per session",
                detail: "Rather than jumping between sections, dedicate each session to one section of your exam. Depth beats breadth in test prep.",
              },
              {
                title: "Upload your own practice test results",
                detail: "If you have taken a practice test through another service, upload the score report. The tutor can analyze where you lost points and target those areas.",
              },
            ].map((tip, i) => (
              <Card key={i}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-3">
                    <div className="h-7 w-7 bg-primary/10 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-primary">{i + 1}</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm mb-1">{tip.title}</h4>
                      <p className="text-xs text-muted-foreground">{tip.detail}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16 md:py-20 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Start Preparing Today
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            Your exam is not going to wait. Get 30 minutes free — no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <StartTrialButton size="lg" className="text-lg h-14 px-8" />
            <Button size="lg" variant="outline" onClick={handlePricing} className="text-lg h-14 px-8">
              See Plans & Pricing
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-8 px-4">
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-2">
            <img src={jieLogo} alt="JIE Mastery" className="h-8 w-auto" />
            <span className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} JIE Mastery AI, Inc. All rights reserved.</span>
          </div>
          <div className="flex space-x-6">
            <a onClick={() => setLocation("/terms")} className="hover:text-primary cursor-pointer transition-colors text-sm text-muted-foreground">Terms</a>
            <a onClick={() => setLocation("/privacy")} className="hover:text-primary cursor-pointer transition-colors text-sm text-muted-foreground">Privacy</a>
            <a onClick={() => setLocation("/contact")} className="hover:text-primary cursor-pointer transition-colors text-sm text-muted-foreground">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
