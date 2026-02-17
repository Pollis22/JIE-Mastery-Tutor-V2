import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Footer } from "@/components/footer";
import { PublicMobileMenu } from "@/components/PublicMobileMenu";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";
import schoolClassroom from "@/assets/school-classroom.png";
import familyHomework from "@/assets/family-homework.png";
import { 
  FileText,
  ShieldCheck, 
  Brain, 
  Lock, 
  MessageCircle, 
  HelpCircle, 
  Users, 
  GraduationCap,
  Phone,
  Mail,
  Globe,
  ChevronRight,
  Building2,
  Heart
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function SchoolsPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Bar */}
      <nav className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div 
              className="flex items-center space-x-3 cursor-pointer" 
              onClick={() => setLocation("/")}
            >
              <img src={jieLogo} alt="JIE Mastery" className="h-10 w-auto" />
              <span className="text-xl font-bold text-foreground">JIE Mastery Tutor</span>
            </div>
            <div className="hidden md:flex items-center space-x-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setLocation("/")} 
                data-testid="button-nav-home"
              >
                For Families
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setLocation("/schools")} 
                data-testid="button-nav-schools-active"
                className="text-primary"
              >
                For Schools
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setLocation("/contact")} 
                data-testid="button-nav-contact"
              >
                Contact
              </Button>
              <div className="w-px h-6 bg-border mx-2" />
              <Button 
                variant="default" 
                size="sm"
                onClick={() => setLocation("/contact")}
                data-testid="button-nav-demo-request"
              >
                Request Demo
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setLocation("/auth?action=login")}
                data-testid="button-sign-in"
              >
                Sign In
              </Button>
            </div>
            <PublicMobileMenu onSignIn={() => setLocation("/auth?action=login")} />
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="py-16 lg:py-24 bg-gradient-to-b from-background to-muted/20">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-7xl mx-auto">
            {/* Left Column - Copy */}
            <div className="space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium">
                <Building2 className="w-4 h-4" />
                For Schools & Districts
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-5xl font-bold text-foreground leading-tight">
                JIE Mastery™ — AI Tutoring for Schools
              </h1>
              
              <p className="text-xl text-primary font-semibold">
                Real Tutoring. Transparent Learning. Built for Accountability.
              </p>
              
              <p className="text-lg text-muted-foreground leading-relaxed">
                AI-powered tutoring that supports learning outside the classroom while maintaining 
                full transparency and accountability. Our Socratic tutoring method uses guided questions — 
                never direct solutions — with every session logged and transcribed for educator review.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center lg:items-start gap-4 pt-4">
                <Button 
                  size="lg" 
                  className="px-8 py-6 text-lg font-bold rounded-xl shadow-lg"
                  onClick={() => setLocation("/contact")}
                  data-testid="button-hero-demo"
                >
                  Request a School Demo
                  <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
              
              {/* Trust Microline */}
              <p className="text-sm text-muted-foreground pt-2">
                Session transcripts included • Anti-cheating by design • Works for families
              </p>
            </div>
            
            {/* Right Column - Image */}
            <div>
              <img 
                src={schoolClassroom} 
                alt="Students learning together in a modern classroom" 
                className="w-full max-h-[450px] object-cover rounded-2xl shadow-2xl"
                data-testid="img-hero-classroom"
              />
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
                How It Works
              </h2>
              <p className="text-lg text-muted-foreground">
                A tutoring approach built for academic integrity and real learning
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Step 1 */}
              <Card className="bg-card border-border shadow-md text-center">
                <CardContent className="pt-8 pb-8 px-6">
                  <div className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
                    1
                  </div>
                  <h3 className="font-semibold text-foreground text-xl mb-3">Students Talk or Type</h3>
                  <p className="text-muted-foreground">
                    Students engage with their AI tutor through voice conversation or text chat, 
                    asking questions about their homework or concepts they're struggling with.
                  </p>
                </CardContent>
              </Card>

              {/* Step 2 */}
              <Card className="bg-card border-border shadow-md text-center">
                <CardContent className="pt-8 pb-8 px-6">
                  <div className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
                    2
                  </div>
                  <h3 className="font-semibold text-foreground text-xl mb-3">Socratic Guidance</h3>
                  <p className="text-muted-foreground">
                    The tutor guides learning through thoughtful questions — never giving away answers. 
                    Students discover solutions themselves, building real understanding.
                  </p>
                </CardContent>
              </Card>

              {/* Step 3 */}
              <Card className="bg-card border-border shadow-md text-center">
                <CardContent className="pt-8 pb-8 px-6">
                  <div className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
                    3
                  </div>
                  <h3 className="font-semibold text-foreground text-xl mb-3">Sessions Logged</h3>
                  <p className="text-muted-foreground">
                    Every session is logged and transcribed for educator and parent review. 
                    Full transparency on what students learned and how they got there.
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="mt-12 text-center">
              <p className="text-lg text-foreground bg-card border border-border rounded-xl px-6 py-4 inline-block shadow-sm">
                <GraduationCap className="w-5 h-5 inline mr-2 text-primary" />
                <strong>Supports Math, English, Science, Spanish, and more</strong> — aligned to standards and grade-level expectations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ACCOUNTABILITY & TRANSPARENCY SECTION */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
                Built for Academic Integrity
              </h2>
              <p className="text-lg text-muted-foreground">
                Designed from the ground up to support learning, not shortcut it
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Card 1: Full Session Transcripts */}
              <Card className="bg-card border-border shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="pt-6 pb-6 px-6 text-center">
                  <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg mb-2">Full Session Transcripts</h3>
                  <p className="text-sm text-muted-foreground">
                    Complete records of every tutoring conversation available to educators and parents.
                  </p>
                </CardContent>
              </Card>

              {/* Card 2: No Answer-Dumping */}
              <Card className="bg-card border-border shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="pt-6 pb-6 px-6 text-center">
                  <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg mb-2">No Answer-Dumping</h3>
                  <p className="text-sm text-muted-foreground">
                    The tutor never provides direct answers. Students must work through problems themselves.
                  </p>
                </CardContent>
              </Card>

              {/* Card 3: Critical Thinking Focus */}
              <Card className="bg-card border-border shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="pt-6 pb-6 px-6 text-center">
                  <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Brain className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg mb-2">Critical Thinking Focus</h3>
                  <p className="text-sm text-muted-foreground">
                    Every interaction is designed to develop problem-solving skills and deeper understanding.
                  </p>
                </CardContent>
              </Card>

              {/* Card 4: Anti-Cheating Design */}
              <Card className="bg-card border-border shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="pt-6 pb-6 px-6 text-center">
                  <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Lock className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg mb-2">Anti-Cheating Design</h3>
                  <p className="text-sm text-muted-foreground">
                    Built to support homework help without enabling academic dishonesty.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* PARTNERSHIP MODEL SECTION */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
                Family Access & School Partnership Model
              </h2>
              <p className="text-lg text-muted-foreground">
                Flexible options for districts looking to support student success at home
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 items-start">
              {/* Family-Based Access */}
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-xl mb-2">Family-Based Access</h3>
                    <ul className="space-y-2 text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <ChevronRight className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                        One subscription supports multiple students in a household
                      </li>
                      <li className="flex items-start gap-2">
                        <ChevronRight className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                        Shared minute pool across siblings — all grade levels supported
                      </li>
                      <li className="flex items-start gap-2">
                        <ChevronRight className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                        Schools can sponsor or subsidize family access through district partnerships
                      </li>
                    </ul>
                  </div>
                </div>

                <img 
                  src={familyHomework} 
                  alt="Family helping children with homework at kitchen table" 
                  className="w-full max-h-[300px] object-cover rounded-xl shadow-lg mt-6"
                  data-testid="img-family-homework"
                />
              </div>

              {/* Pricing */}
              <div>
                <h3 className="font-semibold text-foreground text-xl mb-6">Family Plans</h3>
                
                <div className="space-y-4">
                  {/* Starter Plan */}
                  <Card className="bg-card border-border shadow-md">
                    <CardContent className="py-6 px-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold text-foreground text-lg">Starter Family Plan</h4>
                          <p className="text-muted-foreground">300 minutes/month</p>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-bold text-foreground">$29</p>
                          <p className="text-sm text-muted-foreground">/month</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Standard Plan */}
                  <Card className="bg-card border-2 border-primary shadow-md">
                    <CardContent className="py-6 px-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-foreground text-lg">Standard Family Plan</h4>
                            <span className="bg-primary text-white text-xs px-2 py-1 rounded-full">Popular</span>
                          </div>
                          <p className="text-muted-foreground">800 minutes/month</p>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-bold text-foreground">$69</p>
                          <p className="text-sm text-muted-foreground">/month</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <p className="text-sm text-muted-foreground mt-4 italic">
                  Custom and Enterprise Plans available upon request.
                </p>

                <Button 
                  className="w-full mt-6 py-6 text-lg font-semibold"
                  onClick={() => setLocation("/contact")}
                  data-testid="button-district-pricing"
                >
                  Request District Pricing
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* INSTITUTIONAL REINVESTMENT SECTION */}
      <section className="py-16 bg-primary text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Heart className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold mb-6">
              Institutional Reinvestment Program
            </h2>
            <p className="text-2xl font-semibold mb-6">
              10% of sponsored revenue is reinvested directly into participating schools.
            </p>
            <p className="text-lg opacity-90 max-w-2xl mx-auto">
              When districts sponsor family access, we reinvest a portion back into schools for:
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
              <div className="bg-white/10 rounded-xl px-4 py-4">
                <p className="font-semibold">Technology Upgrades</p>
              </div>
              <div className="bg-white/10 rounded-xl px-4 py-4">
                <p className="font-semibold">Enrichment Programs</p>
              </div>
              <div className="bg-white/10 rounded-xl px-4 py-4">
                <p className="font-semibold">Professional Development</p>
              </div>
              <div className="bg-white/10 rounded-xl px-4 py-4">
                <p className="font-semibold">Academic Initiatives</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
                For Administrators
              </h2>
              <p className="text-lg text-muted-foreground">
                Common questions from school and district leaders
              </p>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="transcripts" className="bg-card border border-border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline py-4">
                  <div className="flex items-center gap-3">
                    <HelpCircle className="w-5 h-5 text-primary flex-shrink-0" />
                    How do transcripts work?
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  Every tutoring session — voice or text — is automatically transcribed and stored. 
                  Parents receive session summaries via email, and administrators can request access 
                  to full transcripts for review. This provides complete visibility into what students 
                  learned and how they were guided.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="cheating" className="bg-card border border-border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline py-4">
                  <div className="flex items-center gap-3">
                    <HelpCircle className="w-5 h-5 text-primary flex-shrink-0" />
                    How does it prevent cheating?
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  JIE Mastery uses a Socratic method — the tutor asks guiding questions to help students 
                  think through problems, but never provides direct answers. The system is designed to 
                  support homework completion through genuine understanding, not answer delivery. All 
                  sessions are logged so educators can verify the learning process.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="sponsor" className="bg-card border border-border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline py-4">
                  <div className="flex items-center gap-3">
                    <HelpCircle className="w-5 h-5 text-primary flex-shrink-0" />
                    How do schools sponsor families?
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  Districts can purchase bulk access for families at reduced rates. We offer flexible 
                  sponsorship models — full coverage, partial subsidies, or matching programs. Contact 
                  our partnerships team to design a program that fits your district's budget and goals.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="ferpa" className="bg-card border border-border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline py-4">
                  <div className="flex items-center gap-3">
                    <HelpCircle className="w-5 h-5 text-primary flex-shrink-0" />
                    Is this FERPA-friendly?
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  We can align to district requirements for student data privacy. During the demo process, 
                  we'll work with your team to ensure our implementation meets your specific compliance needs.
                  Please reach out to discuss your district's requirements.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      {/* FOOTER CTA SECTION */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground">
              Ready to Partner?
            </h2>
            <p className="text-lg text-muted-foreground">
              Learn how JIE Mastery can support student success in your district.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button 
                size="lg" 
                className="px-10 py-6 text-lg font-bold rounded-xl shadow-lg"
                onClick={() => setLocation("/contact")}
                data-testid="button-footer-demo"
              >
                Request a Demo
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                className="px-10 py-6 text-lg rounded-xl"
                onClick={() => setLocation("/contact")}
                data-testid="button-footer-sales"
              >
                Contact Sales
              </Button>
            </div>

            <div className="pt-8 border-t border-border mt-8">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-8 text-muted-foreground">
                <a href="https://jiemastery.ai" className="flex items-center gap-2 hover:text-foreground transition-colors">
                  <Globe className="w-5 h-5" />
                  jiemastery.ai
                </a>
                <a href="tel:+18008640367" className="flex items-center gap-2 hover:text-foreground transition-colors">
                  <Phone className="w-5 h-5" />
                  1-800-864-0367
                </a>
                <a href="mailto:sales@jiemastery.ai" className="flex items-center gap-2 hover:text-foreground transition-colors">
                  <Mail className="w-5 h-5" />
                  sales@jiemastery.ai
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
