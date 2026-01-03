import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import jieLogo from "@/assets/jie-mastery-logo-new.jpg";

export default function FAQPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Bar */}
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setLocation("/auth")}>
              <img src={jieLogo} alt="JIE Mastery" className="h-10 w-auto" />
              <span className="text-xl font-bold text-foreground">JIE Mastery Tutor</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/benefits")} 
                data-testid="button-nav-benefits"
              >
                Why JIE Mastery AI Tutors
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/demo")} 
                data-testid="button-nav-demo"
              >
                Tutor Demo
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/faq")} 
                data-testid="button-nav-faq"
              >
                FAQ
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/support")} 
                data-testid="button-nav-support"
              >
                Live Support
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/contact")} 
                data-testid="button-nav-contact"
              >
                Contact
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/pricing")} 
                data-testid="button-nav-pricing"
              >
                Pricing
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* FAQ Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4" style={{ color: '#C32026' }}>
              Frequently Asked Questions
            </h1>
            <p className="text-xl text-muted-foreground">
              Everything you need to know about JIE Mastery AI Tutor
            </p>
          </div>

          {/* FAQ Accordion */}
          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="faq-1" className="border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-lg font-medium hover:text-primary text-left" data-testid="faq-trigger-1">
                What's the difference between JIE Mastery AI Tutor and ChatGPT or other AI chatbots?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed" data-testid="faq-content-1">
                Most AI chat tools are text-only—they answer questions but don't actually teach. <strong>JIE Mastery AI Tutor</strong> was built for real learning. It uses a powerful conversational voice engine that allows natural, two-way dialogue. The tutor remembers what you're studying, adapts to your level, and walks you step-by-step through problems in math, English, science, and more. Think of ChatGPT as an assistant; JIE Mastery is your personal tutor that listens, speaks, and guides you in real time.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-2" className="border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-lg font-medium hover:text-primary text-left" data-testid="faq-trigger-2">
                How does the voice tutoring work?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed" data-testid="faq-content-2">
                JIE Mastery's voice engine lets you talk naturally—simply ask a question aloud, and the tutor responds instantly. No typing, no delays—just a smooth back-and-forth conversation like having a live teacher beside you.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-3" className="border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-lg font-medium hover:text-primary text-left" data-testid="faq-trigger-3">
                Is it really personalized for each student?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed" data-testid="faq-content-3">
                Yes. Each family member has their own profile and learning history. The tutor tracks progress individually, strengthens weak areas, and adjusts pacing for every learner.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-4" className="border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-lg font-medium hover:text-primary text-left" data-testid="faq-trigger-4">
                What subjects are available?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed" data-testid="faq-content-4">
                Nearly every subject and level is supported right now—from kindergarten to graduate school. Whether it's math, English, science, Spanish, or specialized study help, JIE Mastery adapts to each learner's needs.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-5" className="border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-lg font-medium hover:text-primary text-left" data-testid="faq-trigger-5">
                How do the family plans work?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed" data-testid="faq-content-5">
                One subscription covers everyone. Each plan includes unlimited student profiles, and families share a pool of voice-minutes. The <strong>Elite Family</strong> plan supports three concurrent devices so multiple kids can learn simultaneously.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-6" className="border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-lg font-medium hover:text-primary text-left" data-testid="faq-trigger-6">
                What happens when we run out of minutes?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed" data-testid="faq-content-6">
                You can top up anytime with 60-minute add-on blocks for $19.99. The new minutes are added instantly and roll seamlessly into your family plan.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-7" className="border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-lg font-medium hover:text-primary text-left" data-testid="faq-trigger-7">
                How is progress tracked?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed" data-testid="faq-content-7">
                Parents can view real-time transcripts and learning summaries for every child—see what subjects they studied, how long, and which skills improved.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-8" className="border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-lg font-medium hover:text-primary text-left" data-testid="faq-trigger-8">
                How safe is it for kids?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed" data-testid="faq-content-8">
                Extremely safe. The tutor focuses only on education—no web browsing, no social chat, no outside links. All sessions are private, and transcripts are visible to parents for full transparency.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-9" className="border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-lg font-medium hover:text-primary text-left" data-testid="faq-trigger-9">
                Can it replace a human tutor?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed" data-testid="faq-content-9">
                For many families, yes. It's always available, consistent, and affordable. You get expert-level guidance without scheduling hassles or expensive hourly rates.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-10" className="border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-lg font-medium hover:text-primary text-left" data-testid="faq-trigger-10">
                Does it work on phones and tablets?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed" data-testid="faq-content-10">
                Yes—it runs smoothly in any modern browser on desktop, tablet, or mobile. A dedicated mobile app is coming soon, but for the best experience, we recommend using a laptop or desktop.
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* CTA Section */}
          <div className="mt-16 text-center space-y-6">
            <h2 className="text-2xl font-semibold text-foreground">
              Still Have Questions?
            </h2>
            <p className="text-lg text-muted-foreground">
              Contact our support team for personalized assistance.
            </p>
            <Button 
              size="lg"
              onClick={() => setLocation("/contact")}
              data-testid="button-contact-us"
            >
              Contact Us
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
