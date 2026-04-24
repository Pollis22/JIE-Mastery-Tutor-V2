import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NavigationHeader } from "@/components/navigation-header";
import {
  BookOpen, Calendar, Target, TrendingUp, Users, Bell, BarChart3,
  Flame, Award, ArrowRight, CheckCircle, MessageCircle, Mail,
  Sun, Sparkles
} from "lucide-react";

export default function AboutStudyTrackerPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10">
          <div className="flex items-center gap-3">
            <img src="/jie-logo-nav.png" alt="JIE Mastery" className="w-10 h-10 object-contain" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold text-foreground">About Study Tracker</h1>
                <span className="text-xs font-bold text-primary-foreground bg-primary px-2 py-0.5 rounded-full uppercase tracking-wider">AI Tutor + SRM</span>
              </div>
              <p className="text-muted-foreground mt-1">How it works and what each feature does.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setLocation("/family")}>
              Open Study Tracker <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setLocation("/family/calendar")}>
              <Calendar className="mr-2 h-4 w-4" /> Calendar
            </Button>
          </div>
        </div>

        {/* What Is Study Tracker */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-foreground mb-4">What Is Study Tracker?</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Study Tracker turns JIE Mastery from a tutoring app into a complete academic management system.
            It combines your AI tutor with course tracking, academic calendars, automated study tasks,
            engagement scoring, and progress reports — all in one place.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            When your student starts a tutoring session, the AI already knows what classes they're taking,
            what tests are coming up, which study tasks they've completed, and where they need to focus.
            No other AI tutor can do this.
          </p>
        </section>

        {/* How It Works — 5 Steps */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-foreground mb-6">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              { step: "1", icon: <Users className="h-5 w-5" />, title: "Add Your Students", desc: "Create a profile for each student with their name, grade level, and avatar. Each student gets their own dashboard, calendar, and tutor profile." },
              { step: "2", icon: <BookOpen className="h-5 w-5" />, title: "Add Courses & Dates", desc: "Enter their classes and key dates — tests, projects, homework deadlines. The AI can also extract dates from uploaded syllabi." },
              { step: "3", icon: <Calendar className="h-5 w-5" />, title: "Calendar Fills In", desc: "Every deadline appears on a color-coded calendar. View all students at once or filter by student and course." },
              { step: "4", icon: <CheckCircle className="h-5 w-5" />, title: "Tasks Auto-Generate", desc: "Study reminders appear automatically: 7 days (start reviewing), 5 days (deep study), 3 days (practice), 1 day (final review)." },
              { step: "5", icon: <MessageCircle className="h-5 w-5" />, title: "Tutor Uses It All", desc: "Sessions open with context: \"You have a math test Thursday — let's review fractions.\" The tutor knows their entire schedule." },
            ].map((item, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center mb-3">
                    {item.step}
                  </div>
                  <h3 className="text-sm font-bold text-foreground mb-2">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Features In Detail */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-foreground mb-6">Features In Detail</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              {
                icon: <Users className="h-5 w-5" />,
                title: "Multi-Student Profiles",
                desc: "Add every student in your family. Each gets their own avatar, color, grade level, courses, calendar, and engagement score. One parent account manages everything. Each student's profile is automatically linked to their AI tutor profile — so the tutor knows their name, grade, and preferences."
              },
              {
                icon: <Calendar className="h-5 w-5" />,
                title: "Academic Calendar",
                desc: "A visual month view showing every test, project, assignment, and homework deadline — color-coded by course. Click any day to see details. Add events manually or upload a class schedule and let the AI extract dates automatically."
              },
              {
                icon: <CheckCircle className="h-5 w-5" />,
                title: "Smart Study Tasks",
                desc: "When you add a test or exam, the system auto-generates study tasks at 7, 5, 3, and 1 day before. Each task includes estimated study time and earns XP when completed. Tasks escalate in priority as the deadline approaches."
              },
              {
                icon: <BarChart3 className="h-5 w-5" />,
                title: "Engagement Scoring",
                desc: "Each student receives a weekly engagement score from 0 to 100 based on sessions completed, tasks finished, study minutes, and consistency. Risk levels: On Track (70+), Needs Attention (50–69), At Risk (30–49), Critical (0–29). Parents and admins see alerts when scores drop."
              },
              {
                icon: <Flame className="h-5 w-5" />,
                title: "Streaks, XP & Badges",
                desc: "Daily activity tracking with streak flames. Completing tasks and sessions earns XP points that accumulate into levels. Achievement badges include First Session, Task Machine, Streak Master, Goal Crusher, Early Bird, Night Owl, and Summer Scholar. Keeps kids motivated with visible progress."
              },
              {
                icon: <Award className="h-5 w-5" />,
                title: "Family Leaderboard",
                desc: "Weekly XP rankings across siblings. See who's earning the most points this week. Friendly competition that turns studying into a family activity. Rankings reset weekly so everyone gets a fresh start."
              },
              {
                icon: <Target className="h-5 w-5" />,
                title: "Parent-Set Study Goals",
                desc: "Set goals like \"30 minutes of math, 3 times per week\" for each student. Progress bars show how close they are to meeting each goal. The AI tutor references these goals during sessions — \"Your goal is 3 math sessions this week. This is session 2.\""
              },
              {
                icon: <Bell className="h-5 w-5" />,
                title: "Smart Reminders",
                desc: "Automatic reminders before deadlines — both in-app and via email. Parents and students both get notified. Reminders escalate as deadlines approach so nothing gets missed."
              },
              {
                icon: <Mail className="h-5 w-5" />,
                title: "Weekly Progress Reports",
                desc: "One email per family each week with per-student sections. Includes specific insights like \"Emma mastered fraction multiplication this week and is ready for division\" — not just generic usage stats. Engagement scores, upcoming deadlines, and session summaries included."
              },
              {
                icon: <TrendingUp className="h-5 w-5" />,
                title: "Early Intervention Alerts",
                desc: "The admin dashboard automatically flags students who show warning signs: no activity for 7+ days, declining engagement scores, missed study tasks before an exam, or consistently low engagement. Advisors and parents can step in before problems become grades."
              },
            ].map((item, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0 mt-0.5">
                      {item.icon}
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground mb-1">{item.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* How the Tutor Uses Study Tracker */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-foreground mb-6">How the AI Tutor Uses Study Tracker</h2>
          <Card className="border-primary/30">
            <CardContent className="p-6">
              <p className="text-muted-foreground mb-6">
                When your student clicks "Study with JIE" from their profile, the tutor automatically receives their full academic context. Here's what changes:
              </p>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-bold text-muted-foreground mb-3 text-sm uppercase tracking-wider">Without Study Tracker</h3>
                  <div className="space-y-2">
                    {[
                      "\"Hi! What would you like to study today?\"",
                      "No idea what's due this week",
                      "Doesn't know which subjects need attention",
                      "Every session starts from zero context",
                    ].map((text, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="text-destructive mt-0.5 flex-shrink-0">✗</span>
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-primary mb-3 text-sm uppercase tracking-wider">With Study Tracker Active</h3>
                  <div className="space-y-2">
                    {[
                      "\"You have a chemistry test in 3 days — let's review reaction types!\"",
                      "Knows every deadline across all subjects",
                      "Suggests review topics based on upcoming exams",
                      "References streaks, goals, and completed tasks",
                      "Adapts personality by grade level (K-5 fun, 9-12 professional)",
                    ].map((text, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Grade-Adapted Personality */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-foreground mb-6">Tutor Personality by Grade Level</h2>
          <p className="text-muted-foreground mb-6">
            The voice tutor automatically adapts its teaching style to match each student's grade level. Same tutor, different personality.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { grade: "K–5", emoji: "🌟", style: "Encouraging & Celebratory", desc: "Simple language, celebrates every small win, lots of encouragement. Makes learning feel like play." },
              { grade: "6–8", emoji: "📘", style: "Structured & Supportive", desc: "Introduces academic vocabulary gradually. Encouraging but focused. Builds study habits and critical thinking." },
              { grade: "9–12", emoji: "🎓", style: "Professional & Direct", desc: "Treats students like young adults. Focus on reasoning, analysis, and exam preparation. No hand-holding." },
            ].map((item, i) => (
              <Card key={i}>
                <CardContent className="p-5 text-center">
                  <div className="text-3xl mb-2">{item.emoji}</div>
                  <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">{item.grade}</div>
                  <h3 className="font-bold text-foreground mb-2">{item.style}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Summer Mode */}
        <section className="mb-12">
          <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200/50">
            <CardContent className="p-6 flex flex-col md:flex-row items-center gap-6">
              <Sun className="h-12 w-12 text-amber-500 flex-shrink-0" />
              <div>
                <h3 className="text-xl font-bold text-foreground mb-2">Summer Learning Mode</h3>
                <p className="text-muted-foreground leading-relaxed">
                  When school's out, Study Tracker automatically shifts to summer goals with review topic suggestions pulled from the school year's data.
                  Keep the momentum going with the Summer Scholar badge for consistent study habits all summer long.
                  The dashboard adapts to show summer-specific progress and goals.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Getting Started */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-4">Getting Started</h2>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-6">
              <div className="grid md:grid-cols-3 gap-6 text-center">
                <div>
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-lg flex items-center justify-center mx-auto mb-3">1</div>
                  <h3 className="font-bold text-foreground mb-1">Open Study Tracker</h3>
                  <p className="text-sm text-muted-foreground">Click "Study Tracker" in the navigation bar at the top of any page.</p>
                </div>
                <div>
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-lg flex items-center justify-center mx-auto mb-3">2</div>
                  <h3 className="font-bold text-foreground mb-1">Add a Student</h3>
                  <p className="text-sm text-muted-foreground">Click "+ Add Student" and fill in their name, grade, and pick an avatar or upload a photo.</p>
                </div>
                <div>
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-lg flex items-center justify-center mx-auto mb-3">3</div>
                  <h3 className="font-bold text-foreground mb-1">Add Courses & Dates</h3>
                  <p className="text-sm text-muted-foreground">Click into the student's dashboard, add their courses, then add test dates and homework deadlines. Everything else is automatic.</p>
                </div>
              </div>
              <div className="text-center mt-6">
                <Button onClick={() => setLocation("/family")} size="lg">
                  Open Study Tracker <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

      </div>
    </div>
  );
}
