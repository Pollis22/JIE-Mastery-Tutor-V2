import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import jieLogo from "@/assets/jie-mastery-logo-new.jpg";
import { Footer } from "@/components/footer";

export default function TrustSafetyPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
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

      <div className="container mx-auto px-4 py-12 max-w-4xl flex-grow">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold mb-4">Trust, Safety & Compliance at JIE Mastery AI Tutor</h1>
          
          <p className="text-lg text-muted-foreground mb-8">
            At JIE Mastery AI Tutor ("JIE Mastery", "we", "us"), trust is not a feature – it's the product.
            Parents, students, schools, and businesses are handing us something incredibly valuable: their
            time, their learning, and their data. This page explains how we protect that trust across privacy,
            security, student safety, AI guardrails, and compliance.
          </p>

          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4">Our Mission: Real Learning, Not Shortcuts</h2>
            <p className="text-lg font-semibold mb-3">JIE Mastery is built to teach, not to cheat.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>We use a Socratic tutoring approach – the tutor guides students with questions and step-by-step reasoning instead of just giving answers.</li>
              <li>We log and store sessions so parents, educators, and administrators can see that the student is actually learning, not copying.</li>
            </ul>
            <p className="mt-4">This philosophy shapes our product and our compliance posture.</p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4">Data Privacy by Design</h2>
            <p className="mb-4">We collect only what we need to deliver safe, effective tutoring.</p>
            
            <h3 className="text-xl font-semibold mb-3">Types of data we handle (depending on how you use the platform):</h3>
            <ul className="list-disc pl-6 space-y-2 mb-6">
              <li><strong>Account data</strong> – names, email addresses, grade level, role (student, parent, teacher, admin, business learner).</li>
              <li><strong>Learning data</strong> – uploaded assignments, lesson choices, questions, transcripts of tutoring sessions, progress information.</li>
              <li><strong>Usage data</strong> – app activity, device/browser info, general analytics.</li>
              <li><strong>Voice data</strong> – audio sent to our speech and AI providers when you use voice features.</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3">Key privacy principles:</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>No selling personal data.</strong> We do not sell student or learner data.</li>
              <li><strong>No ads built on student data.</strong> We do not use student data to build targeted advertising profiles.</li>
              <li><strong>Limited use of data.</strong> Data is used only to:
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>Deliver and improve the JIE Mastery tutoring experience,</li>
                  <li>Maintain security and reliability,</li>
                  <li>Meet our legal obligations.</li>
                </ul>
              </li>
              <li><strong>Control and transparency.</strong> We provide mechanisms (directly or through the school/business) to:
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>Access and export data,</li>
                  <li>Correct inaccurate information,</li>
                  <li>Request deletion where applicable.</li>
                </ul>
              </li>
            </ul>
            <p className="mt-4">For all the legal details, see our <button onClick={() => setLocation("/privacy")} className="text-primary hover:underline">Privacy Policy</button>.</p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4">Security: How We Protect Your Data</h2>
            <p className="mb-4">We treat every account like it belongs to someone we know personally.</p>
            
            <h3 className="text-xl font-semibold mb-3">Core security practices include:</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Encryption in transit & at rest</strong> – all connections use HTTPS/TLS; stored data is protected using industry-standard encryption.</li>
              <li><strong>Role-based access control (RBAC)</strong> – separate roles for students, parents, teachers, school admins, and business admins, so people only see what they're supposed to see.</li>
              <li><strong>Tenant isolation</strong> – school and business customers are logically separated to prevent cross-organization data access.</li>
              <li><strong>Backups & recovery</strong> – regular database backups and documented recovery procedures.</li>
              <li><strong>Least-privilege internal access</strong> – only a small number of authorized team members can access production systems, and only when required.</li>
              <li><strong>Monitoring & logging</strong> – security-relevant events and administrative actions are logged for auditing and incident response.</li>
            </ul>
            <p className="mt-4">For a deeper dive, you can request our Security & Privacy Overview PDF.</p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4">Compliance for Schools (K–12 and Higher Education)</h2>
            <p className="mb-4">JIE Mastery is designed to support compliance with key US education privacy laws and state requirements.</p>
            
            <h3 className="text-xl font-semibold mb-3">FERPA (Family Educational Rights and Privacy Act)</h3>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>When used by schools, we typically act as a "school official" with a legitimate educational interest.</li>
              <li>Student education records remain the property of the school.</li>
              <li>We only use student data to provide the service as directed by the school or district.</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3">COPPA (Children's Online Privacy Protection Act)</h3>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>For children under 13 using JIE Mastery through a school, the school or district can provide consent on behalf of parents where allowed by law.</li>
              <li>For direct-to-consumer use (e.g., family plans), we obtain parent or guardian consent before collecting personal information from children under 13.</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3">State student privacy laws</h3>
            <p className="mb-2">We structure our contracts, data handling, and security practices to support compliance with state-level student privacy laws (such as SOPPA, SOPIPA, and similar laws), including:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>No sale of student data,</li>
              <li>Restrictions on redisclosure,</li>
              <li>Breach notification commitments,</li>
              <li>Student data deletion on request from the school.</li>
            </ul>
            <p className="mt-4">We're happy to review and sign district Data Privacy Agreements (DPAs) and addendums as part of your vendor onboarding process.</p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4">Compliance for Businesses & Adult Learners</h2>
            <p className="mb-4">For corporate training and adult education:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>We operate as a data processor/service provider on behalf of your organization under a Data Processing Addendum (DPA).</li>
              <li>We support obligations under data protection laws such as:
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>GDPR (for European data subjects),</li>
                  <li>CCPA/CPRA (for California residents),</li>
                  <li>and similar global privacy regulations where applicable.</li>
                </ul>
              </li>
              <li>We provide tools to help your organization honor data subject rights (access, correction, deletion) while maintaining auditability and security.</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4">AI Guardrails & Content Safety</h2>
            <p className="text-lg font-semibold mb-3">AI is powerful. We keep it on a tight leash.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Grounded tutoring</strong> – the tutor is designed to stick to the active lesson or uploaded content and avoid speculative or off-topic responses.</li>
              <li><strong>Content filters</strong> – we use automated filters and policy guardrails to reduce:
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>Harassment and hate speech,</li>
                  <li>Self-harm content,</li>
                  <li>Explicit or unsafe content.</li>
                </ul>
              </li>
              <li><strong>No model training on your content for unrelated purposes</strong> – We do not use student or enterprise data to train general-purpose public models. Any model improvements we implement are based on anonymized, aggregated patterns or separate training data, not on identifiable user content.</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4">Accessibility & Inclusion</h2>
            <p className="mb-4">We are committed to making JIE Mastery accessible to as many learners as possible.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>We are working toward conformance with WCAG 2.1 AA guidelines for web accessibility.</li>
              <li>We support key accessibility features such as keyboard navigation, screen reader compatibility, and adjustable text/audio experiences.</li>
              <li>For schools and organizations, we can provide an Accessibility Statement and, when available, a VPAT (Voluntary Product Accessibility Template).</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4">How to Contact Us About Privacy & Security</h2>
            <p className="mb-4">If you have questions about privacy, security, or compliance—or if you're a school district or business needing our documentation—contact:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Email:</strong> support@jiemastery.ai</li>
              <li><strong>Mailing address:</strong> 2863 W. 95th Street, Suite 123-129, Naperville, IL 60564</li>
              <li><strong>Subject line suggestion:</strong> "Attn: Security & Privacy – JIE Mastery AI Tutor"</li>
            </ul>
            <p className="mt-4">We take every inquiry seriously and work directly with your IT, legal, or compliance teams to ensure JIE Mastery fits your requirements.</p>
          </section>
        </div>
      </div>

      <Footer />
    </div>
  );
}
