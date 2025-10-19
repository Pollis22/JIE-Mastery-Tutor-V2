import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import jieLogo from "@/assets/jie-mastery-logo.png";
import aiTutorImage from "@assets/Create_an_image_of_an_AI_robot_tutoring_a_real_tee-1759438453563_1759521545083.png";
import aiTutorImage2 from "@assets/Create_an_image_of_an_AI_robot_tutoring_a_real_tee-1759521647218_1759521666544.png";
import { Clock, DollarSign, Target, Calendar, BookOpen, TrendingUp, Users } from "lucide-react";

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

              {/* Hero Image */}
              <div className="relative">
                <Card className="shadow-2xl overflow-hidden border-4 border-white/20 transform hover:scale-105 transition-transform duration-300">
                  <CardContent className="p-0">
                    <img 
                      src={aiTutorImage2} 
                      alt="Student learning with AI tutor assistant" 
                      className="w-full h-auto object-cover"
                      data-testid="img-hero-ai-tutor"
                    />
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

              {/* Benefit 7: Track Progress */}
              <Card className="shadow-sm">
                <CardContent className="pt-6 space-y-4">
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-red-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">Real Progress Tracking</h3>
                  <p className="text-muted-foreground">
                    Watch your improvement with detailed conversation transcripts, progress reports, and performance analytics. See exactly where you're excelling and where to focus next.
                  </p>
                </CardContent>
              </Card>
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
                      <h4 className="font-semibold text-foreground">Socratic Teaching Method</h4>
                      <p className="text-muted-foreground">Our AI guides you to find answers through thoughtful questions, helping you truly understand concepts.</p>
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
                    <img 
                      src={aiTutorImage} 
                      alt="AI robot tutor helping a student with homework" 
                      className="w-full h-auto object-cover"
                      data-testid="img-ai-tutor-hero"
                    />
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
                    <div className="text-4xl font-bold text-green-600">$19-99</div>
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
