import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NavigationHeader } from "@/components/navigation-header";
import {
  Brain, Sparkles, Target, TrendingUp, Shield, Clock,
  ArrowRight, CheckCircle, XCircle, Layers, BookOpen,
  Lightbulb, LineChart, MessageCircle, UserCheck, Zap, Database
} from "lucide-react";

export default function AboutLSISPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain className="h-7 w-7 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-3xl font-bold text-foreground">What is LSIS?</h1>
                <span className="text-xs font-bold text-primary-foreground bg-primary px-2 py-0.5 rounded-full uppercase tracking-wider">Proprietary AI Moat</span>
              </div>
              <p className="text-muted-foreground mt-1">Longitudinal Student Intelligence System — the tutor that remembers.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setLocation("/tutor")}>
              Start a Session <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Hero value proposition */}
        <section className="mb-14">
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
            <CardContent className="p-8 md:p-10">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-4">
                  <Sparkles className="h-3.5 w-3.5" /> The Moat
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 leading-tight">
                  Most AI tutors are amnesiac.<br />
                  <span className="text-primary">JIE remembers every session.</span>
                </h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  LSIS is the engine that turns JIE from a voice-chat app into a true learning companion.
                  After every session, LSIS extracts what a student understood, what confused them, and what
                  teaching style worked — then feeds that knowledge back into the next session. Session 20
                  is dramatically better than session 1 because the tutor has been learning about the student
                  the whole time. A competitor starting cold cannot catch up.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* The Problem — ChatGPT vs JIE side-by-side */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold text-foreground mb-2">Why This Changes Everything</h2>
          <p className="text-muted-foreground mb-6 max-w-3xl">
            ChatGPT, Claude, Gemini, and every generic AI tutor start every conversation from zero. They are
            brilliant strangers who meet your student for the first time, every time. LSIS is the difference
            between a stranger and a tutor who knows your child.
          </p>
          <div className="grid md:grid-cols-2 gap-5">
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <XCircle className="h-5 w-5 text-destructive" />
                  <h3 className="font-bold text-foreground">Typical AI Tutor (ChatGPT, generic apps)</h3>
                </div>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-2"><span className="text-destructive flex-shrink-0">✗</span><span>Every session begins with "Hi, what would you like to learn today?"</span></li>
                  <li className="flex gap-2"><span className="text-destructive flex-shrink-0">✗</span><span>No memory of which concepts the student has mastered</span></li>
                  <li className="flex gap-2"><span className="text-destructive flex-shrink-0">✗</span><span>Re-explains things the student already understands — wasting session time</span></li>
                  <li className="flex gap-2"><span className="text-destructive flex-shrink-0">✗</span><span>Doesn't know which teaching strategies actually work for this student</span></li>
                  <li className="flex gap-2"><span className="text-destructive flex-shrink-0">✗</span><span>Can't spot recurring misconceptions that resurface across weeks</span></li>
                  <li className="flex gap-2"><span className="text-destructive flex-shrink-0">✗</span><span>Session 20 is no better than session 1</span></li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  <h3 className="font-bold text-foreground">JIE with LSIS</h3>
                </div>
                <ul className="space-y-3 text-sm text-foreground">
                  <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /><span>Opens with: "Last time we were working on fraction multiplication — ready to continue?"</span></li>
                  <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /><span>Remembers every concept the student has engaged with, scored 0–100% mastery</span></li>
                  <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /><span>Skips mastered material and zeros in on growth areas</span></li>
                  <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /><span>Knows the student learns faster with visual analogies than verbal explanations</span></li>
                  <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /><span>Catalogs misconceptions and revisits them until resolved</span></li>
                  <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /><span>Session 20 is a completely different experience from session 1 — personalized, faster, deeper</span></li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* How It Works — 3 Stages */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold text-foreground mb-2">How LSIS Works</h2>
          <p className="text-muted-foreground mb-6 max-w-3xl">
            Three stages run automatically in the background. The student never sees any of this — they just
            experience a tutor who seems to know them better every week.
          </p>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                step: "1",
                icon: <Layers className="h-5 w-5" />,
                title: "Extract",
                subtitle: "Session ends",
                desc: "When a session ends, LSIS reads the full transcript with a structured AI pipeline. It asks: What concepts did the student engage with? Did they understand them? What evidence tells you so? What misconceptions appeared? What teaching strategy worked? Output is structured data — each concept scored 0–100% mastery with specific evidence."
              },
              {
                step: "2",
                icon: <Database className="h-5 w-5" />,
                title: "Remember",
                subtitle: "Profile updates",
                desc: "Those extracted concepts roll up into a single persistent profile per student: total sessions analyzed, strengths, growth areas, misconception catalog, effective teaching strategies, emotional patterns, and next-session recommendations. The profile compounds over time. Every session makes it sharper."
              },
              {
                step: "3",
                icon: <Zap className="h-5 w-5" />,
                title: "Adapt",
                subtitle: "Next session starts",
                desc: "When the student returns, their profile is silently injected into the tutor's instructions before they say a word. The tutor now knows everything about this student and adapts pacing, examples, vocabulary, and strategy in real time. The student just experiences a tutor who \"gets them.\""
              },
            ].map((item, i) => (
              <Card key={i} className="relative">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center">
                      {item.step}
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      {item.icon}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">{item.subtitle}</div>
                  <h3 className="text-xl font-bold text-foreground mb-3">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* What LSIS Tracks */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold text-foreground mb-2">What LSIS Tracks For Every Student</h2>
          <p className="text-muted-foreground mb-6 max-w-3xl">
            A rolling longitudinal profile that gets richer every session.
          </p>
          <div className="grid md:grid-cols-2 gap-5">
            {[
              {
                icon: <Target className="h-5 w-5" />,
                title: "Concept Mastery",
                desc: "Every academic concept the student engages with is scored 0–100% with evidence. Example: spanish.alphabet.letter_a mastery 0.75 — recalled pronunciation correctly on first prompt. Scores update across sessions and reveal learning curves per concept."
              },
              {
                icon: <Lightbulb className="h-5 w-5" />,
                title: "Misconception Catalog",
                desc: "Wrong answers aren't just noted — their underlying misconceptions are named and remembered. \"Student believes 1/4 > 1/2 because 4 > 2.\" The tutor revisits these until they're resolved, then archives them."
              },
              {
                icon: <UserCheck className="h-5 w-5" />,
                title: "Learning Style",
                desc: "Does this student respond better to visual analogies or verbal explanations? Short pointed questions or longer setups? Humor or straight instruction? LSIS measures effectiveness and adapts."
              },
              {
                icon: <TrendingUp className="h-5 w-5" />,
                title: "Effective Strategies",
                desc: "Every teaching strategy the tutor tries is scored for effectiveness with this specific student. \"Drawing parallels to basketball helped with ratio problems — effectiveness 0.9.\" Winning strategies get reused."
              },
              {
                icon: <MessageCircle className="h-5 w-5" />,
                title: "Emotional Patterns",
                desc: "Does the student get frustrated after three wrong answers? What recovery strategies work? When does engagement peak? LSIS notices patterns no human tutor could track across 20 sessions."
              },
              {
                icon: <LineChart className="h-5 w-5" />,
                title: "Next-Session Recommendations",
                desc: "Before every session, LSIS generates a priority list of topics to cover, strategies to use, and things to avoid — tailored to this student, this week, this moment."
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

        {/* Session 1 vs Session 20 */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold text-foreground mb-6">Session 1 vs. Session 20 — A Real Example</h2>
          <Card className="border-primary/30">
            <CardContent className="p-6 md:p-8">
              <p className="text-muted-foreground mb-6 italic">
                Imagine Emma, a 4th grader working on fractions with JIE.
              </p>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-bold text-muted-foreground text-sm uppercase tracking-wider">Session 1 — Cold start</h3>
                  </div>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>Tutor: "Hi Emma! What would you like to work on today?"</p>
                    <p>Emma: "Fractions, I guess."</p>
                    <p>Tutor delivers a standard 4th-grade fraction lesson. Emma engages politely but the pacing is generic. Tutor has no idea she already knows equivalent fractions cold but struggles specifically with unlike denominators. Session ends neutrally.</p>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-primary text-sm uppercase tracking-wider">Session 20 — LSIS-powered</h3>
                  </div>
                  <div className="space-y-3 text-sm text-foreground">
                    <p>Tutor: "Hey Emma — last time we cracked unlike denominators with the pizza analogy. Want to try applying it to word problems today? I have a good one about a soccer team."</p>
                    <p>Emma: "Yeah!"</p>
                    <p>Tutor opens with the student's preferred learning modality (visual/sports analogies), avoids already-mastered concepts (equivalent fractions), targets the known growth area, and references a teaching strategy that previously scored 0.9 effectiveness. Emma hits mastery 5 minutes into the session.</p>
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-border">
                <p className="text-sm text-foreground">
                  <strong className="text-primary">That compounding advantage is the moat.</strong> A competitor
                  starting a new student from session 1 cannot replicate 19 sessions of personal knowledge no matter
                  how powerful their underlying LLM is.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Competitive Comparison */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold text-foreground mb-2">How JIE Compares</h2>
          <p className="text-muted-foreground mb-6 max-w-3xl">
            We're frequently asked "why not just use ChatGPT?" Here's the honest answer.
          </p>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    <th className="p-4 font-semibold text-foreground">Feature</th>
                    <th className="p-4 font-semibold text-muted-foreground">ChatGPT / Claude / Gemini</th>
                    <th className="p-4 font-semibold text-muted-foreground">Khan / Duolingo</th>
                    <th className="p-4 font-semibold text-primary">JIE with LSIS</th>
                  </tr>
                </thead>
                <tbody className="[&>tr]:border-t [&>tr]:border-border">
                  {[
                    ["Voice-first tutor", "Limited", "No", "Yes — sub-second loop"],
                    ["Remembers student across sessions", "No", "Partial (progress only)", "Full longitudinal profile"],
                    ["Tracks concept mastery per student", "No", "Basic", "0–100% per concept, with evidence"],
                    ["Catalogs misconceptions over time", "No", "No", "Yes, until resolved"],
                    ["Adapts teaching strategy to student", "No", "No", "Measured and refined per session"],
                    ["Knows what to teach next session", "No", "Linear curriculum", "AI-generated, personalized"],
                    ["Grade-adapted persona", "No", "Fixed", "K-2 → College, 6 personas"],
                    ["Parent / institutional dashboards", "No", "Partial", "Full family + institutional admin"],
                  ].map((row, i) => (
                    <tr key={i} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                      <td className="p-4 font-medium text-foreground">{row[0]}</td>
                      <td className="p-4 text-muted-foreground">{row[1]}</td>
                      <td className="p-4 text-muted-foreground">{row[2]}</td>
                      <td className="p-4 text-foreground font-medium">{row[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>

        {/* Privacy */}
        <section className="mb-14">
          <Card className="bg-secondary/5 border-secondary/30">
            <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center gap-5">
              <Shield className="h-10 w-10 text-secondary flex-shrink-0" />
              <div>
                <h3 className="text-xl font-bold text-foreground mb-2">Privacy by Design</h3>
                <p className="text-muted-foreground leading-relaxed">
                  LSIS profiles are stored per-student in an encrypted database, never shared across families or
                  institutions, and never used to train foundation models. The system is designed to be FERPA and
                  COPPA compliant. Parents and administrators can view and delete any student's profile at any time.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Technical Note — builds credibility */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold text-foreground mb-4">Under the Hood</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Extraction</div>
                <p className="text-sm text-muted-foreground">
                  Structured concept extraction via frontier LLM with a purpose-built educational taxonomy.
                  Normalized concept keys enable cross-session aggregation at scale.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Storage</div>
                <p className="text-sm text-muted-foreground">
                  Per-student knowledge profiles, append-only concept mastery records, and a background job queue —
                  all in Postgres with indexed lookups for sub-100ms injection at session start.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Injection</div>
                <p className="text-sm text-muted-foreground">
                  Profiles are silently injected into the tutor's system prompt before each session. The tutor
                  doesn't have to be told to "remember" — memory is built into its instructions.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mb-10">
          <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-background">
            <CardContent className="p-8 md:p-10 text-center">
              <div className="max-w-2xl mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                  <Brain className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
                  The tutor that gets smarter every week.
                </h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Every session with JIE teaches the tutor how to teach your student better.
                  That compounding advantage is unique to JIE and impossible to replicate with a generic AI.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button size="lg" onClick={() => setLocation("/tutor")}>
                    Start a Session <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => setLocation("/family")}>
                    <BookOpen className="mr-2 h-4 w-4" /> Explore Study Tracker
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

      </div>
    </div>
  );
}
