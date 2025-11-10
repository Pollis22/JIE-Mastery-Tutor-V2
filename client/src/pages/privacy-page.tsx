import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import jieLogo from "@/assets/jie-mastery-logo-new.jpg";

export default function PrivacyPage() {
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
                Support
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

      {/* Privacy Policy Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto prose prose-lg dark:prose-invert">
          <h1 className="text-4xl font-bold mb-4" style={{ color: '#C32026' }}>Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Effective Date: November 2025</p>

          <div className="space-y-8 text-foreground">
            <p>
              At JIE Mastery AI Tutor, your family's privacy and safety come first. We are committed to protecting 
              the personal information of all users — especially children — in compliance with the Children's Online 
              Privacy Protection Act (COPPA) and other applicable privacy laws.
            </p>

            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Information We Collect</h2>
              <p>We may collect basic information such as:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Parent or guardian name and contact details (email or phone)</li>
                <li>Student's first name, grade level, and subject preferences</li>
                <li>Learning session data (e.g., transcripts or lesson progress) to improve educational quality</li>
              </ul>
              <p className="mt-4">
                We do not collect or request sensitive personal identifiers such as home address, payment information, 
                or social media accounts within the tutor experience.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. How We Use Information</h2>
              <p>Collected data is used solely to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide and improve tutoring experiences</li>
                <li>Personalize lessons and track learning progress</li>
                <li>Communicate updates, product news, and early-access invitations to parents or guardians</li>
                <li>Maintain security, performance, and educational quality of the platform</li>
              </ul>
              <p className="mt-4">
                We <strong>never</strong> use or sell personal data for advertising purposes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. Parental Consent and Control</h2>
              <p>Parents or legal guardians must create and manage all student accounts.</p>
              <p className="mt-4">You can:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Access, review, or delete your child's information at any time</li>
                <li>Withdraw consent for data storage or participation by contacting us directly</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. Data Protection</h2>
              <p>
                All data is transmitted and stored securely using encrypted protocols. Access is limited to 
                authorized personnel who are trained in privacy and data protection.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Data Retention</h2>
              <p>
                Learning data and transcripts are retained only as long as necessary to support your child's 
                active tutoring experience or as required by law. Upon request or account closure, personal 
                data is deleted promptly and permanently.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. Contact Us</h2>
              <p>If you have questions or wish to exercise your privacy rights, please contact us at:</p>
              <p className="mt-4 space-y-2">
                📧 <a href="mailto:support@jiemastery.ai" className="text-primary hover:underline">support@jiemastery.ai</a>
                <br />
                🌐 <a href="https://jiemastery.ai/privacy" className="text-primary hover:underline">https://jiemastery.ai/privacy</a>
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">7. Updates</h2>
              <p>
                This policy may be updated periodically to reflect improvements in privacy practices. Any changes 
                will be posted on our website, and parents will be notified of material updates.
              </p>
            </section>
          </div>

          {/* CTA Section */}
          <div className="mt-16 pt-8 border-t border-border text-center space-y-6">
            <h2 className="text-2xl font-semibold text-foreground">
              Questions About Privacy?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              We're here to help. Contact our support team anytime.
            </p>
            <div className="flex justify-center gap-4">
              <Button 
                size="lg"
                onClick={() => setLocation("/contact")}
                data-testid="button-contact-support"
              >
                Contact Support
              </Button>
              <Button 
                size="lg"
                variant="outline"
                onClick={() => setLocation("/auth")}
                data-testid="button-back-home"
              >
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
