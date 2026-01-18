import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";

export default function TermsPage() {
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

      {/* Content */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold mb-2">Terms and Conditions</h1>
          <p className="text-muted-foreground mb-8">Effective Date: October 3, 2025</p>
          <p className="text-xl font-semibold mb-8">JIE Mastery AI - AI-Powered Educational Tutoring Services</p>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">1. Acceptance of Terms</h2>
            <p>By creating an account, subscribing to, or using JIE Mastery AI ("Service," "we," "us," or "our"), you agree to be bound by these Terms and Conditions. If you do not agree, you may not use our Service.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">2. Description of Service</h2>
            <p>JIE Mastery AI provides AI-powered voice tutoring in Math, English, Science, and Spanish for students from Kindergarten through College/Adult levels. Our Service includes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Real-time voice conversations with AI tutors</li>
              <li>Progress tracking and learning analytics</li>
              <li>Optional document upload for study materials</li>
              <li>Subscription-based access to tutoring minutes</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">3. Account Registration</h2>
            <h3 className="text-xl font-semibold mb-2">3.1 Eligibility</h3>
            <p>You must be at least 18 years old to create an account. If you are under 18, your parent or legal guardian must create the account and agree to these terms on your behalf.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">3.2 Account Information</h3>
            <p>You agree to provide accurate, current, and complete information during registration and to update it as necessary. You are responsible for maintaining the confidentiality of your account credentials.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">3.3 Account Responsibility</h3>
            <p>You are responsible for all activities that occur under your account. Notify us immediately of any unauthorized access.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">4. Subscription Plans and Pricing</h2>
            <h3 className="text-xl font-semibold mb-2">4.1 Available Plans</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Starter Family: $19.99/month - 60 voice minutes</li>
              <li>Standard Family: $59.99/month - 240 voice minutes</li>
              <li>Pro Family: $99.99/month - 600 voice minutes</li>
              <li>Elite Family: $199.99/month - 1,800 voice minutes</li>
            </ul>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">4.2 Minute Top-ups</h3>
            <p>Additional minutes may be purchased at $19.99 per 60-minute block.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">4.3 Billing</h3>
            <p>Subscriptions are billed monthly in advance. By subscribing, you authorize us to charge your payment method on a recurring basis until you cancel.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">4.4 Price Changes</h3>
            <p>We reserve the right to change our pricing with 30 days' notice to active subscribers. Continued use after the notice period constitutes acceptance of new prices.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">4.5 Usage Tracking</h3>
            <p>Voice minutes are tracked in real-time. Unused minutes do not roll over to the next billing period. Bonus minutes from top-ups do not expire.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">5. Payment and Billing</h2>
            <h3 className="text-xl font-semibold mb-2">5.1 Payment Processing</h3>
            <p>Payments are processed securely through Stripe. We do not store your payment card information.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">5.2 Failed Payments</h3>
            <p>If payment fails, we will attempt to process it again. Continued payment failure may result in suspension or termination of your account.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">5.3 Taxes</h3>
            <p>You are responsible for any applicable taxes associated with your subscription.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">6. Cancellation and Refunds</h2>
            <h3 className="text-xl font-semibold mb-2">6.1 Cancellation by User</h3>
            <p>You may cancel your subscription at any time through your account settings or by contacting customer support at info@jiemastery.ai. Cancellation takes effect at the end of your current billing period. You will retain access to your remaining minutes until that date.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">6.2 No Refunds for Partial Months</h3>
            <p>We do not provide refunds for partial subscription periods. If you cancel mid-cycle, you will not be charged for subsequent periods, but no refund will be issued for the current period.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">6.3 Refunds for Technical Issues</h3>
            <p>If you experience technical problems that prevent you from using the Service, contact us within 7 days. We will investigate and may issue a prorated refund or credit at our discretion.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">6.4 Refunds for Unused Top-ups</h3>
            <p>Minute top-ups (60-minute blocks) are non-refundable once purchased, as they do not expire.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">6.5 14-Day Money-Back Guarantee (First Subscription Only)</h3>
            <p>First-time subscribers may request a full refund within 14 days of their initial subscription purchase if they have used less than 15 minutes of tutoring time.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">7. Acceptable Use</h2>
            <h3 className="text-xl font-semibold mb-2">7.1 Prohibited Conduct</h3>
            <p>You agree NOT to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use the Service for any illegal purpose</li>
              <li>Harass, abuse, or harm others</li>
              <li>Attempt to reverse-engineer, hack, or circumvent our systems</li>
              <li>Share your account with others</li>
              <li>Use automated systems or bots to interact with the Service</li>
              <li>Upload malicious files or content</li>
            </ul>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">7.2 Content Uploaded by Users</h3>
            <p>You retain ownership of any study materials you upload. By uploading content, you grant us a license to process and store it to provide the Service. You represent that you have the right to upload such content.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">7.3 Educational Use Only</h3>
            <p>Our Service is intended for legitimate educational purposes. We do not permit use for cheating on exams, completing assignments dishonestly, or any form of academic dishonesty.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">8. Intellectual Property</h2>
            <h3 className="text-xl font-semibold mb-2">8.1 Our Content</h3>
            <p>All content provided by JIE Mastery AI, including AI tutor responses, interface design, and software, is our intellectual property and protected by copyright and other laws.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">8.2 Limited License</h3>
            <p>We grant you a limited, non-exclusive, non-transferable license to use the Service for personal, educational purposes only.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">9. Service Availability</h2>
            <h3 className="text-xl font-semibold mb-2">9.1 Uptime</h3>
            <p>While we strive for continuous availability, we do not guarantee uninterrupted access. We may perform maintenance, updates, or repairs that temporarily affect availability.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">9.2 No Warranty</h3>
            <p>The Service is provided "as is" without warranties of any kind, express or implied. We do not guarantee specific educational outcomes.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">10. Limitation of Liability</h2>
            <h3 className="text-xl font-semibold mb-2">10.1 Damages</h3>
            <p>To the maximum extent permitted by law, JIE Mastery AI shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or educational opportunities.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">10.2 Maximum Liability</h3>
            <p>Our total liability to you for any claim arising from use of the Service shall not exceed the amount you paid us in the 12 months preceding the claim.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">10.3 Educational Supplement</h3>
            <p>Our Service is a supplemental educational tool and should not replace traditional schooling, qualified teachers, or professional educational assessment.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">11. Privacy and Data Protection</h2>
            <h3 className="text-xl font-semibold mb-2">11.1 Data Collection</h3>
            <p>We collect personal information as described in our Privacy Policy (below). This includes account information, usage data, and voice conversation transcripts.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">11.2 Data Security</h3>
            <p>We implement reasonable security measures to protect your data, but cannot guarantee absolute security.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">11.3 Third-Party Services</h3>
            <p>We use third-party services (Stripe, ElevenLabs, hosting providers) that may have access to certain data as necessary to provide the Service.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">12. Children's Privacy</h2>
            <h3 className="text-xl font-semibold mb-2">12.1 COPPA Compliance</h3>
            <p>While our Service may be used by children under 13, accounts must be created and managed by a parent or guardian. We do not knowingly collect personal information directly from children under 13.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">12.2 Parental Consent</h3>
            <p>By creating an account for a child, you represent that you are the parent or legal guardian and consent to the child's use of the Service.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">13. Termination</h2>
            <h3 className="text-xl font-semibold mb-2">13.1 By Us</h3>
            <p>We may suspend or terminate your account for violation of these Terms, fraudulent activity, or if required by law, with or without notice.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">13.2 Effect of Termination</h3>
            <p>Upon termination, your right to use the Service ceases immediately. We may delete your account data after termination, though we may retain certain information as required by law.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">14. Modifications to Terms</h2>
            <p>We may modify these Terms at any time. We will notify you of material changes via email or through the Service. Continued use after changes constitutes acceptance. If you disagree with changes, you must cancel your subscription.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">15. Governing Law and Disputes</h2>
            <h3 className="text-xl font-semibold mb-2">15.1 Governing Law</h3>
            <p>These Terms are governed by the laws of the United States, without regard to conflict of law principles.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">15.2 Dispute Resolution</h3>
            <p>Any disputes shall first be attempted to be resolved through good-faith negotiation. If unresolved, disputes shall be settled through binding arbitration in accordance with the American Arbitration Association rules.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">15.3 Class Action Waiver</h3>
            <p>You agree to resolve disputes individually and waive any right to participate in class actions.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">16. Miscellaneous</h2>
            <h3 className="text-xl font-semibold mb-2">16.1 Entire Agreement</h3>
            <p>These Terms constitute the entire agreement between you and JIE Mastery AI regarding the Service.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">16.2 Severability</h3>
            <p>If any provision is found unenforceable, the remaining provisions remain in effect.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">16.3 Assignment</h3>
            <p>You may not assign these Terms. We may assign our rights and obligations without restriction.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">16.4 Contact Information</h3>
            <p>For questions about these Terms, contact us at:<br />
            Email: info@jiemastery.ai</p>
          </section>

          <section className="mb-8">
            <h1 className="text-4xl font-bold mb-2 mt-12">Privacy Policy</h1>
            <p className="text-muted-foreground mb-8">Effective Date: October 3, 2025</p>

            <h2 className="text-2xl font-bold mb-4">1. Information We Collect</h2>
            <h3 className="text-xl font-semibold mb-2">1.1 Account Information</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Parent name and email</li>
              <li>Student name, age, and grade level</li>
              <li>Payment information (processed by Stripe)</li>
              <li>Marketing communication preferences</li>
            </ul>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">1.2 Usage Information</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Voice conversation transcripts</li>
              <li>Session duration and frequency</li>
              <li>Minutes used and remaining</li>
              <li>Subject areas and grade levels accessed</li>
            </ul>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">1.3 Uploaded Content</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Study materials (PDFs, documents) you choose to upload</li>
              <li>Document metadata (title, subject, upload date)</li>
            </ul>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">1.4 Technical Information</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>IP address, browser type, device information</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">2. How We Use Your Information</h2>
            <p>We use collected information to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide and improve the tutoring Service</li>
              <li>Process payments and manage subscriptions</li>
              <li>Track usage and enforce plan limits</li>
              <li>Send transactional emails (receipts, confirmations)</li>
              <li>Send marketing communications (if you've opted in)</li>
              <li>Analyze usage patterns to improve AI tutor quality</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">3. Information Sharing</h2>
            <h3 className="text-xl font-semibold mb-2">3.1 Service Providers</h3>
            <p>We share information with:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Stripe: Payment processing</li>
              <li>ElevenLabs: Voice AI technology</li>
              <li>Email service: Transactional and marketing emails</li>
              <li>Hosting provider: Data storage and infrastructure</li>
            </ul>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">3.2 Legal Requirements</h3>
            <p>We may disclose information if required by law, court order, or to protect our rights or others' safety.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">3.3 Business Transfers</h3>
            <p>If we are acquired or merge with another company, your information may be transferred as part of that transaction.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">3.4 No Sale of Personal Data</h3>
            <p>We do not sell your personal information to third parties.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">4. Data Retention</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Account data: Retained while your account is active</li>
              <li>Voice transcripts: Retained for 12 months for quality improvement</li>
              <li>Usage logs: Retained for 24 months for billing disputes</li>
              <li>Deleted account data: Retained for 30 days, then permanently deleted (except as required by law)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">5. Your Rights</h2>
            <h3 className="text-xl font-semibold mb-2">5.1 Access and Correction</h3>
            <p>You may access and update your account information at any time through your account settings.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">5.2 Data Deletion</h3>
            <p>You may request deletion of your account and associated data by contacting us. We will comply within 30 days, except for data we must retain legally.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">5.3 Marketing Opt-Out</h3>
            <p>You may opt out of marketing emails at any time via the unsubscribe link or account settings. Transactional emails cannot be opted out of while you have an active account.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">5.4 Data Portability</h3>
            <p>You may request a copy of your data in a portable format.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">6. Children's Privacy (COPPA)</h2>
            <h3 className="text-xl font-semibold mb-2">6.1 Parental Consent</h3>
            <p>We require parental consent for users under 13. Parents create and control the account.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">6.2 Limited Collection</h3>
            <p>We only collect information necessary to provide the Service: student name, age, grade level, and usage data.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">6.3 Parental Rights</h3>
            <p>Parents may review, modify, or delete their child's information at any time.</p>
            
            <h3 className="text-xl font-semibold mb-2 mt-4">6.4 No Third-Party Advertising</h3>
            <p>We do not display third-party advertising or share children's information for marketing purposes.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">7. Data Security</h2>
            <p>We implement industry-standard security measures including:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Encryption of data in transit (TLS/SSL)</li>
              <li>Encrypted storage of sensitive data</li>
              <li>Secure authentication and session management</li>
              <li>Regular security audits</li>
            </ul>
            <p className="mt-4">However, no system is completely secure. You are responsible for maintaining the confidentiality of your password.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">8. Cookies and Tracking</h2>
            <p>We use cookies and similar technologies for:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Authentication and session management</li>
              <li>Remembering your preferences</li>
              <li>Analytics to improve the Service</li>
            </ul>
            <p className="mt-4">You may disable cookies in your browser, but this may affect Service functionality.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">9. International Users</h2>
            <p>Our Service is operated in the United States. By using the Service, you consent to the transfer of your information to the United States and agree to the privacy laws of that jurisdiction.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">10. Changes to Privacy Policy</h2>
            <p>We may update this Privacy Policy. We will notify you of material changes via email or through the Service. Your continued use constitutes acceptance of changes.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">11. Contact Us</h2>
            <p>For privacy questions or to exercise your rights:<br />
            Email: info@jiemastery.ai</p>
            <p className="mt-4 text-muted-foreground">Last Updated: October 3, 2025</p>
          </section>
        </div>
      </div>

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
