import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StartTrialButton } from "@/components/StartTrialButton";
import {
  BookOpen, Calendar, Target, TrendingUp, Users, Bell, BarChart3,
  Flame, Award, GraduationCap, ArrowRight, CheckCircle, Clock,
  Star, Sparkles, MessageCircle, Shield
} from "lucide-react";

// Import the JIE logo
import jieLogo from "@/assets/jie-mastery-logo-new.jpg";

export default function StudyTrackerInfoPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* NAV */}
      <nav className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setLocation("/")}>
              <img src={jieLogo} alt="JIE Mastery" className="h-10 w-auto" />
              <span className="text-xl font-bold text-foreground">JIE Mastery</span>
            </div>
            <div className="hidden md:flex items-center space-x-2">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/benefits")}>Why JIE Mastery</Button>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/pricing")}>Pricing</Button>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/faq")}>FAQ</Button>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/schools")}>For Schools</Button>
              <div className="w-px h-6 bg-border mx-2" />
              <Button variant="outline" size="sm" onClick={() => setLocation("/auth")}>Sign In</Button>
            </div>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden py-20 lg:py-28">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10" />
        <div className="container mx-auto px-4 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-primary uppercase tracking-wider">New Feature</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-6">
              Not Just a Tutor.{" "}
              <span className="text-primary">A Complete Academic System.</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
              Study Tracker transforms JIE Mastery from a tutoring app into a full academic command center.
              Track every child, every subject, every deadline — with an AI tutor that knows exactly what's coming next.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <StartTrialButton
                size="lg"
                className="px-10 py-6 text-lg font-bold rounded-xl shadow-xl h-auto"
                showSubtext
              />
              <Button variant="outline" size="lg" className="px-8 py-6 text-lg h-auto" onClick={() => setLocation("/benefits")}>
                See All Features <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* THE PROBLEM */}
      <section className="py-20 bg-card border-y border-border">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                The Problem Every Parent Knows
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                AI tutors answer questions. But nobody helps you manage the big picture.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: <Calendar className="h-6 w-6" />, title: "Scattered Deadlines", desc: "Tests, projects, and homework across multiple kids and subjects — tracked on sticky notes, texts, and hope." },
                { icon: <Target className="h-6 w-6" />, title: "No Accountability", desc: "Kids say they studied. Parents aren't sure. There's no data, no streaks, no proof of progress." },
                { icon: <TrendingUp className="h-6 w-6" />, title: "Invisible Gaps", desc: "By the time you see a bad grade, the learning gap has been building for weeks. No early warning system." },
              ].map((item, i) => (
                <Card key={i} className="border-destructive/20 bg-destructive/5">
                  <CardContent className="p-6 space-y-3">
                    <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive">
                      {item.icon}
                    </div>
                    <h3 className="text-lg font-bold text-foreground">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* THE SOLUTION */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <span className="text-sm font-semibold text-primary uppercase tracking-widest bg-primary/10 px-4 py-2 rounded-full">
                The Solution
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-5 mb-4">
                Study Tracker: Your Family's Academic Command Center
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                One dashboard for every child. Every subject. Every deadline. Every study session.
                Connected directly to an AI tutor that uses it all.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { icon: <Users className="h-6 w-6" />, title: "Multi-Child Profiles", desc: "Add every child with their own avatar, grade level, and courses. One parent account manages it all.", highlight: true },
                { icon: <Calendar className="h-6 w-6" />, title: "Academic Calendar", desc: "See every test, project, and assignment across all children in one view. Add events manually or let AI extract them from syllabi." },
                { icon: <BookOpen className="h-6 w-6" />, title: "Smart Study Tasks", desc: "Auto-generated study tasks appear 7, 5, 3, and 1 day before every exam. Kids always know what to study next." },
                { icon: <Flame className="h-6 w-6" />, title: "Streaks & XP System", desc: "Daily activity tracking with streak flames, XP points, levels, and achievement badges. Gamification that actually motivates.", highlight: true },
                { icon: <Award className="h-6 w-6" />, title: "Family Leaderboard", desc: "Friendly sibling competition. See who's earning the most XP this week. Turns studying into a game the whole family plays." },
                { icon: <Target className="h-6 w-6" />, title: "Parent-Set Goals", desc: "Set study goals like '30 minutes of math, 3x per week.' Track progress with visual bars. The tutor references these in sessions." },
                { icon: <Bell className="h-6 w-6" />, title: "Smart Reminders", desc: "Automatic reminders before deadlines. In-app and email. Parents and kids both get notified — nobody misses a test." },
                { icon: <BarChart3 className="h-6 w-6" />, title: "Engagement Scoring", desc: "Each child gets a 0-100 engagement score updated weekly. See trends, risk levels, and exactly when to step in.", highlight: true },
                { icon: <MessageCircle className="h-6 w-6" />, title: "Weekly Progress Reports", desc: "One email per family with per-child sections. Specific insights like 'Emma mastered fractions and is ready for division.'" },
              ].map((item, i) => (
                <Card key={i} className={`transition-all hover:shadow-lg hover:-translate-y-0.5 duration-200 ${
                  item.highlight ? "border-primary/40 bg-gradient-to-br from-primary/5 to-background" : "bg-card"
                }`}>
                  {item.highlight && (
                    <div className="absolute top-3 right-3">
                      <Star className="h-4 w-4 text-primary fill-primary" />
                    </div>
                  )}
                  <CardContent className="p-6 space-y-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      {item.icon}
                    </div>
                    <h3 className="text-lg font-bold text-foreground">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TUTOR INTEGRATION */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                The Tutor That Knows What's Coming
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Other AI tutors are reactive — they answer what you ask. JIE Mastery is proactive.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Without Study Tracker */}
              <Card className="border-muted-foreground/20">
                <CardContent className="p-8">
                  <div className="text-center mb-6">
                    <div className="text-3xl mb-2">💬</div>
                    <h3 className="text-xl font-bold text-muted-foreground">Any Other AI Tutor</h3>
                  </div>
                  <div className="space-y-3">
                    {[
                      "\"Hi! What would you like to study today?\"",
                      "No idea what's due tomorrow",
                      "Doesn't know which subjects need attention",
                      "Every session starts from scratch",
                      "No connection to academic calendar",
                    ].map((text, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="text-destructive mt-0.5">✗</span>
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* With Study Tracker */}
              <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-background shadow-lg">
                <CardContent className="p-8">
                  <div className="text-center mb-6">
                    <div className="text-3xl mb-2">🎓</div>
                    <h3 className="text-xl font-bold text-primary">JIE Mastery + Study Tracker</h3>
                  </div>
                  <div className="space-y-3">
                    {[
                      "\"You have a chemistry test in 3 days — let's review reaction types!\"",
                      "Knows every deadline across all subjects",
                      "Suggests review topics based on upcoming exams",
                      "Remembers everything from every past session",
                      "Adapts personality by grade level (K-5 fun, 9-12 serious)",
                    ].map((text, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* GRADE-ADAPTED PERSONALITY */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                One Tutor. Every Age. Different Personality.
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                The voice tutor automatically adapts its teaching style to match each child's grade level.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { grade: "K-5", emoji: "🌟", style: "Encouraging & Celebratory", desc: "Uses simple language, celebrates every small win, lots of encouragement and emoji. Makes learning feel like play.", color: "from-green-500/10 to-green-500/5 border-green-500/30" },
                { grade: "6-8", emoji: "📘", style: "Structured & Supportive", desc: "Introduces academic vocabulary gradually. Encouraging but focused. Builds study habits and critical thinking.", color: "from-blue-500/10 to-blue-500/5 border-blue-500/30" },
                { grade: "9-12", emoji: "🎓", style: "Professional & Direct", desc: "Treats students like young adults. Focus on reasoning, analysis, and exam preparation. No hand-holding.", color: "from-primary/10 to-primary/5 border-primary/30" },
              ].map((item, i) => (
                <Card key={i} className={`bg-gradient-to-br ${item.color}`}>
                  <CardContent className="p-6 text-center space-y-3">
                    <div className="text-4xl">{item.emoji}</div>
                    <div className="text-sm font-semibold text-primary uppercase tracking-wider">{item.grade}</div>
                    <h3 className="text-lg font-bold text-foreground">{item.style}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SUMMER MODE */}
      <section className="py-16 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-y border-amber-200/50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-8">
            <div className="text-6xl">☀️</div>
            <div className="flex-1">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">Summer Learning Mode</h2>
              <p className="text-muted-foreground leading-relaxed">
                When school's out, the dashboard shifts to summer goals with review topic suggestions pulled from the school year's data.
                Keep the momentum going with the Summer Scholar badge for consistent study habits all summer long.
              </p>
            </div>
            <div>
              <StartTrialButton size="lg" className="px-8 py-5 text-lg font-bold h-auto" showSubtext />
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-20 bg-card">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Get Started in 3 Minutes</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { step: "1", title: "Add Your Children", desc: "Create a profile for each child with their name, grade, avatar, and photo. One click." },
                { step: "2", title: "Add Courses & Dates", desc: "Enter classes and key dates — tests, projects, homework. Or upload a syllabus and let AI extract them." },
                { step: "3", title: "Let JIE Do the Rest", desc: "Study tasks auto-generate. The tutor knows what's coming. Streaks and XP keep kids motivated. You get weekly reports." },
              ].map((item, i) => (
                <div key={i} className="text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground font-bold text-xl flex items-center justify-center mx-auto">
                    {item.step}
                  </div>
                  <h3 className="text-lg font-bold text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-64 h-64 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        </div>
        <div className="container mx-auto px-4 relative text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold leading-tight">
            Stop managing homework chaos.
            <br />
            <span className="opacity-90">Start running an academic system.</span>
          </h2>
          <p className="mt-6 text-lg opacity-80 max-w-xl mx-auto">
            30 minutes free. No credit card. Every child in your family gets their own profile, calendar, and AI tutor.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <StartTrialButton
              size="lg"
              className="bg-white text-primary hover:bg-white/90 px-10 py-6 text-lg font-bold rounded-xl h-auto"
              showSubtext
            />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-8 bg-card border-t border-border">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={jieLogo} alt="JIE Mastery" className="h-8 w-auto" />
            <span className="font-bold text-foreground">JIE Mastery</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} JIE Mastery. The AI tutoring platform families trust.
          </p>
          <div className="flex items-center justify-center gap-4 mt-3 text-sm text-muted-foreground">
            <a href="/terms" className="hover:text-primary">Terms</a>
            <a href="/privacy" className="hover:text-primary">Privacy</a>
            <a href="/contact" className="hover:text-primary">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
