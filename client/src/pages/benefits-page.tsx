import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import jieLogo from "@/assets/jie-mastery-logo-new.jpg";
import { Clock, DollarSign, Target, Calendar, BookOpen, TrendingUp, Users, Shield, Brain, LightbulbIcon, Bot, Sparkles, GraduationCap } from "lucide-react";

export default function BenefitsPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setLocation("/auth")}>
              <img src={jieLogo} alt="JIE Mastery" className="h-10 w-auto" />
              <span className="text-xl font-bold text-foreground">JIE Mastery Tutor</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => setLocation("/pricing")} data-testid="button-nav-pricing">
                Pricing
              </Button>
              <Button variant="default" onClick={() => setLocation("/auth")} data-testid="button-nav-signup">
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary to-primary/80 text-white py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Text Content */}
              <div className="space-y-6 text-center lg:text-left">
                <div className="inline-block mb-2">
                  <span className="text-sm font-bold text-white/90 uppercase tracking-wide bg-white/20 px-4 py-2 rounded-full backdrop-blur-sm">
                    🚀 The Future of Family Tutoring
                  </span>
                </div>
                <h1 className="text-5xl font-bold leading-tight" data-testid="heading-benefits">
                  One Family Plan.<br/>All Siblings Learn.
                </h1>
                <p className="text-2xl text-primary-foreground/90">
                  <strong>Save hundreds monthly!</strong> Replace expensive individual tutors with one affordable family plan. 
                  Create unlimited profiles - each child gets personalized AI tutoring from kindergarten through college.
                </p>
                <Button 
                  size="lg" 
                  variant="secondary"
                  onClick={() => setLocation("/auth")}
                  className="text-lg px-8 py-6"
                  data-testid="button-get-started-hero"
                >
                  Start Learning Today
                </Button>
              </div>

              {/* Hero Visual */}
              <div className="relative">
                <Card className="shadow-2xl overflow-hidden border-4 border-white/20 transform hover:scale-105 transition-transform duration-300">
                  <CardContent className="p-0">
                    <div 
                      className="w-full aspect-[4/3] bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-600 flex flex-col items-center justify-center gap-6 relative overflow-hidden"
                      data-testid="img-hero-ai-tutor"
                    >
                      {/* Background decorative elements */}
                      <Sparkles className="absolute top-6 right-8 w-12 h-12 text-white/30 animate-pulse" />
                      <Sparkles className="absolute bottom-8 left-8 w-8 h-8 text-white/20 animate-pulse delay-150" />
                      <GraduationCap className="absolute top-6 left-6 w-10 h-10 text-white/20 animate-bounce" />
                      
                      {/* Main icon */}
                      <div className="relative z-10 bg-white/20 backdrop-blur-sm rounded-full p-10 shadow-2xl">
                        <Bot className="w-32 h-32 text-white" />
                      </div>
                      
                      {/* Text */}
                      <div className="relative z-10 text-center px-4">
                        <h3 className="text-3xl font-bold text-white mb-3">AI Family Tutoring</h3>
                        <p className="text-white/95 text-lg max-w-md">One subscription for all siblings - personalized learning for every age</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
              Learning on Your Terms
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Benefit 1: 24/7 Availability */}
              <Card className="shadow-sm">
                <CardContent className="pt-6 space-y-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">24/7 Availability</h3>
                  <p className="text-muted-foreground">
                    Study whenever inspiration strikes. Your AI tutor is available around the clock, ready to help you learn at 3 PM or 3 AM. No scheduling conflicts, no waiting for appointments.
                  </p>
                </CardContent>
              </Card>

              {/* Benefit 2: Affordable Family Plans */}
              <Card className="shadow-sm border-2 border-green-500">
                <CardContent className="pt-6 space-y-4">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">One Plan, All Siblings</h3>
                  <p className="text-muted-foreground">
                    <strong>Save hundreds monthly!</strong> Instead of paying $50-100/hour per child for separate tutors, 
                    get one family plan that ALL siblings share. Create unlimited profiles - everyone learns!
                  </p>
                </CardContent>
              </Card>

              {/* Benefit 3: Personalized Learning */}
              <Card className="shadow-sm">
                <CardContent className="pt-6 space-y-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Target className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">Personalized Approach</h3>
                  <p className="text-muted-foreground">
                    Every student learns differently. Our AI adapts to your learning style, pace, and grade level with age-appropriate tutors from K-2 through college and adult learning.
                  </p>
                </CardContent>
              </Card>

              {/* Benefit 4: Flexible Scheduling */}
              <Card className="shadow-sm">
                <CardContent className="pt-6 space-y-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-purple-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">Your Schedule, Your Way</h3>
                  <p className="text-muted-foreground">
                    No more rushing to appointments or missing sessions. Learn during lunch breaks, after sports practice, or between chores. Pause and resume lessons whenever you need.
                  </p>
                </CardContent>
              </Card>

              {/* Benefit 5: Multiple Subjects */}
              <Card className="shadow-sm">
                <CardContent className="pt-6 space-y-4">
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-orange-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">Math, English, Science, Spanish & More</h3>
                  <p className="text-muted-foreground">
                    Get help across multiple subjects without hiring separate tutors. Whether you're struggling with algebra, essay writing, science concepts, or Spanish conjugations, we've got you covered.
                  </p>
                </CardContent>
              </Card>

              {/* Benefit 6: Family Sharing - HIGHLIGHTED */}
              <Card className="shadow-xl border-2 border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
                <CardContent className="pt-6 space-y-4">
                  <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">Unlimited Sibling Profiles 👨‍👩‍👧‍👦</h3>
                  <p className="text-muted-foreground">
                    <strong>The smart way for families!</strong> Create unlimited profiles for all your children. 
                    Each sibling gets personalized tutoring but shares the family minutes. Save $100s vs separate tutors!
                  </p>
                </CardContent>
              </Card>

              {/* Benefit 7: Transcript Saving */}
              <Card className="shadow-sm">
                <CardContent className="pt-6 space-y-4">
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-red-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">Complete Transcript Saving</h3>
                  <p className="text-muted-foreground">
                    Every conversation is automatically saved! Review what was discussed, share transcripts with teachers or parents, and reference past lessons anytime. Perfect for homework help and test prep.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Socratic Teaching Methodology Section */}
      <section className="py-16 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-block mb-4">
                <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto">
                  <Brain className="w-8 h-8 text-white" />
                </div>
              </div>
              <h2 className="text-4xl font-bold text-foreground mb-4">
                We Don't Give Answers. We Teach How to Think.
              </h2>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                Our tutors use the proven Socratic method — guiding students to discover answers through critical thinking, not memorization.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
              <Card className="shadow-lg border-2 border-blue-200 dark:border-blue-800">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-2xl">❌</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground mb-2">Other Tutoring Apps</h3>
                      <p className="text-muted-foreground mb-3">
                        Give direct answers and solutions
                      </p>
                      <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-3 rounded">
                        <p className="text-sm font-mono text-foreground">
                          <strong>Student:</strong> "What's 7 × 8?"<br/>
                          <strong>App:</strong> "The answer is 56."
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground mt-3 italic">
                        ⚠️ Result: Student memorizes, doesn't understand
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-lg border-2 border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-2xl">✅</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground mb-2">JIE Mastery Tutor</h3>
                      <p className="text-muted-foreground mb-3">
                        Guides students to discover answers themselves
                      </p>
                      <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-3 rounded">
                        <p className="text-sm font-mono text-foreground">
                          <strong>Student:</strong> "What's 7 × 8?"<br/>
                          <strong>Tutor:</strong> "Great question! What's 7 × 4? Can you double that?"
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground mt-3 italic">
                        ✨ Result: Student learns multiplication strategies
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="shadow-sm">
                <CardContent className="pt-6 space-y-3 text-center">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto">
                    <LightbulbIcon className="w-6 h-6 text-purple-600" />
                  </div>
                  <h4 className="font-bold text-foreground">Deeper Understanding</h4>
                  <p className="text-sm text-muted-foreground">
                    Students truly grasp concepts instead of just memorizing answers for tests
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardContent className="pt-6 space-y-3 text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto">
                    <Brain className="w-6 h-6 text-blue-600" />
                  </div>
                  <h4 className="font-bold text-foreground">Critical Thinking Skills</h4>
                  <p className="text-sm text-muted-foreground">
                    Develops problem-solving abilities that help across all subjects and life
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardContent className="pt-6 space-y-3 text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto">
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  </div>
                  <h4 className="font-bold text-foreground">Long-Term Success</h4>
                  <p className="text-sm text-muted-foreground">
                    Students become independent learners prepared for college and careers
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Safety & Security Section */}
      <section className="py-16 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-block mb-4">
                <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto">
                  <Shield className="w-8 h-8 text-white" />
                </div>
              </div>
              <h2 className="text-4xl font-bold text-foreground mb-4">
                Enterprise-Grade Safety for Your Peace of Mind
              </h2>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                Protecting children is our top priority. We've built industry-leading safeguards so parents can trust their kids are learning in a safe environment.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <Card className="shadow-lg">
                <CardContent className="pt-6 space-y-4">
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">🚫</span>
                  </div>
                  <h3 className="text-lg font-bold text-foreground">Real-Time Content Moderation</h3>
                  <p className="text-muted-foreground text-sm">
                    Every conversation is automatically monitored for inappropriate content using dual-layer AI detection — blocking profanity, sexual content, violence, and hate speech instantly.
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardContent className="pt-6 space-y-4">
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">⚠️</span>
                  </div>
                  <h3 className="text-lg font-bold text-foreground">3-Strike Warning System</h3>
                  <p className="text-muted-foreground text-sm">
                    If inappropriate behavior occurs: 1st strike = friendly warning, 2nd strike = serious warning with parent notification, 3rd strike = automatic 24-hour suspension.
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardContent className="pt-6 space-y-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">📝</span>
                  </div>
                  <h3 className="text-lg font-bold text-foreground">Complete Transcript Access</h3>
                  <p className="text-muted-foreground text-sm">
                    Parents can review every conversation their child has with the AI tutor. Complete transparency — nothing hidden, everything documented.
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardContent className="pt-6 space-y-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">👶</span>
                  </div>
                  <h3 className="text-lg font-bold text-foreground">Age-Appropriate Tutors</h3>
                  <p className="text-muted-foreground text-sm">
                    Five specialized tutors (K-2, 3-5, 6-8, 9-12, College) ensure content is always appropriate for your child's age and maturity level.
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardContent className="pt-6 space-y-4">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">🛡️</span>
                  </div>
                  <h3 className="text-lg font-bold text-foreground">COPPA Compliant</h3>
                  <p className="text-muted-foreground text-sm">
                    Full compliance with Children's Online Privacy Protection Act. We never collect unnecessary personal information or share data with third parties.
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardContent className="pt-6 space-y-4">
                  <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">🔒</span>
                  </div>
                  <h3 className="text-lg font-bold text-foreground">Secure by Design</h3>
                  <p className="text-muted-foreground text-sm">
                    Bank-level encryption, secure authentication, and automatic session monitoring ensure your family's data is always protected.
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="bg-white dark:bg-card border-2 border-emerald-500 rounded-xl p-6 shadow-xl">
              <div className="flex items-start space-x-4">
                <Shield className="w-8 h-8 text-emerald-500 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-bold text-foreground mb-2">
                    Why Parents Trust JIE Mastery Tutor
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Unlike other tutoring platforms that give children free rein, we've built enterprise-grade protection systems used by schools and organizations. Every interaction is safe, educational, and documented.
                  </p>
                  <p className="text-sm italic text-muted-foreground">
                    "One inappropriate incident can destroy a platform's reputation. That's why we over-invest in safety — because your trust is everything." — JIE Engineering Team
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Voice Feature */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <h2 className="text-4xl font-bold text-foreground">
                  Learn Through Natural Conversation
                </h2>
                <p className="text-lg text-muted-foreground">
                  Our AI tutors use interactive voice technology to create engaging, natural conversations. Just like talking to a real tutor, but with infinite patience and zero judgment.
                </p>
                <ul className="space-y-4">
                  <li className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">Upload Your Documents</h4>
                      <p className="text-muted-foreground">Upload homework, worksheets, or study materials (PDF, DOCX, or images). The AI reads and understands your documents to provide personalized help based on your actual assignments.</p>
                    </div>
                  </li>
                  <li className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">Socratic Teaching Method — No Direct Answers!</h4>
                      <p className="text-muted-foreground">Our AI NEVER gives answers. Instead, it guides you with strategic questions that help you discover solutions yourself and truly understand concepts.</p>
                    </div>
                  </li>
                  <li className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">Built-In Safety Guardrails</h4>
                      <p className="text-muted-foreground">Real-time content moderation, 3-strike warning system, and complete transcript access for parents. Your children learn in a protected environment.</p>
                    </div>
                  </li>
                  <li className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">Age-Appropriate Tutors</h4>
                      <p className="text-muted-foreground">Five specialized tutors for different age groups ensure the right vocabulary and complexity for every learner.</p>
                    </div>
                  </li>
                </ul>
              </div>
              
              <div className="space-y-6">
                <Card className="shadow-xl overflow-hidden border-2 border-primary/20">
                  <CardContent className="p-0">
                    <div 
                      className="w-full aspect-video bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex flex-col items-center justify-center gap-4 relative overflow-hidden"
                      data-testid="img-ai-tutor-hero"
                    >
                      {/* Background decorative elements */}
                      <Brain className="absolute top-4 right-6 w-10 h-10 text-white/20 animate-pulse" />
                      <BookOpen className="absolute bottom-4 left-6 w-10 h-10 text-white/20 animate-pulse delay-75" />
                      
                      {/* Main icon */}
                      <div className="relative z-10 bg-white/20 backdrop-blur-sm rounded-full p-8 shadow-2xl">
                        <GraduationCap className="w-24 h-24 text-white" />
                      </div>
                      
                      {/* Text */}
                      <div className="relative z-10 text-center px-4">
                        <h3 className="text-2xl font-bold text-white mb-2">Smart Learning Assistant</h3>
                        <p className="text-white/90 text-sm max-w-sm">Homework help, document analysis, and personalized guidance</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="shadow-lg">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <h3 className="text-2xl font-bold text-foreground text-center">Get Started</h3>
                      <p className="text-muted-foreground text-center">
                        Experience the difference AI tutoring makes. Sign up now and get access to all features.
                      </p>
                      <Button 
                        size="lg" 
                        className="w-full text-lg"
                        onClick={() => setLocation("/auth")}
                        data-testid="button-get-started"
                      >
                        Create Your Account
                      </Button>
                      <p className="text-xs text-center text-muted-foreground">
                        Choose your plan and start learning today.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cost Comparison */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
              Smart Investment in Education
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card className="shadow-sm border-2 border-muted">
                <CardContent className="pt-6 space-y-4">
                  <div className="text-center space-y-2">
                    <h3 className="text-2xl font-bold text-muted-foreground">Traditional Tutors</h3>
                    <div className="text-4xl font-bold text-red-600">$50-150</div>
                    <p className="text-muted-foreground">per hour</p>
                  </div>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-center space-x-2">
                      <span className="text-red-500">✗</span>
                      <span>Limited availability</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="text-red-500">✗</span>
                      <span>Scheduling conflicts</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="text-red-500">✗</span>
                      <span>Travel time required</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="text-red-500">✗</span>
                      <span>Single subject focus</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="shadow-lg border-2 border-primary">
                <CardContent className="pt-6 space-y-4">
                  <div className="text-center space-y-2">
                    <h3 className="text-2xl font-bold text-primary">JIE Mastery AI</h3>
                    <div className="text-4xl font-bold text-green-600">$19.99 to $199.99</div>
                    <p className="text-muted-foreground">per month</p>
                  </div>
                  <ul className="space-y-2 text-foreground">
                    <li className="flex items-center space-x-2">
                      <span className="text-green-500">✓</span>
                      <span>24/7 instant access</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="text-green-500">✓</span>
                      <span>Learn on your schedule</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="text-green-500">✓</span>
                      <span>Learn from anywhere</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="text-green-500">✓</span>
                      <span>Math, English, Science, Spanish & More</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8 text-center">
              <p className="text-lg text-muted-foreground">
                Save over <span className="font-bold text-green-600">90%</span> compared to traditional tutoring while getting better flexibility and coverage.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 bg-gradient-to-r from-primary to-primary/80 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="text-4xl font-bold">
              Ready to Transform Your Learning?
            </h2>
            <p className="text-xl text-primary-foreground/90">
              Join thousands of students already mastering their subjects with JIE Mastery AI Tutors.
            </p>
            <div className="flex justify-center">
              <Button 
                size="lg" 
                variant="secondary"
                onClick={() => setLocation("/auth")}
                className="text-lg px-8 py-6"
                data-testid="button-signup-cta"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-muted-foreground">&copy; 2025 JIE Mastery Tutor. All rights reserved.</p>
            <div className="flex space-x-6">
              <button
                onClick={() => setLocation("/terms")}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-terms"
              >
                Terms & Conditions
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
