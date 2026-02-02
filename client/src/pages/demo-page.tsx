import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";

export default function DemoPage() {
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
            {/* Desktop navigation - hidden on mobile */}
            <div className="hidden lg:flex items-center space-x-4">
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
                onClick={() => setLocation("/offer")} 
                data-testid="button-nav-offers"
              >
                Offers
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/pricing")} 
                data-testid="button-nav-pricing"
              >
                Pricing
              </Button>
              <Button 
                onClick={() => setLocation("/auth?action=login")} 
                data-testid="button-sign-in"
              >
                Sign In
              </Button>
            </div>
            {/* Mobile Sign In button - always visible */}
            <Button 
              className="lg:hidden"
              onClick={() => setLocation("/auth?action=login")} 
              data-testid="button-sign-in-mobile"
            >
              Sign In
            </Button>
          </div>
        </div>
      </nav>

      {/* Demo Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-4">
              <h1 className="text-4xl font-bold" style={{ color: '#C32026' }}>
                Tutor Demo
              </h1>
              <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">
                Patent Pending
              </span>
            </div>
            <p className="text-xl text-muted-foreground">
              See JIE Mastery AI Tutor in action
            </p>
          </div>

          {/* Video Container */}
          <div className="flex justify-center w-full">
            <div className="w-full max-w-4xl">
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe 
                  src="https://www.youtube.com/embed/eZoNpF0F8AI" 
                  title="JIE Mastery AI Tutor Demo" 
                  frameBorder="0" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                  referrerPolicy="strict-origin-when-cross-origin" 
                  allowFullScreen 
                  className="absolute top-0 left-0 w-full h-full rounded-2xl shadow-2xl border border-gray-200"
                  data-testid="video-tutor-demo"
                />
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="mt-16 text-center space-y-6">
            <h2 className="text-2xl font-semibold text-foreground">
              Ready to Get Started?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Experience personalized AI tutoring for your whole family. Choose a plan that fits your needs.
            </p>
            <div className="flex justify-center gap-4">
              <Button 
                size="lg"
                onClick={() => setLocation("/pricing")}
                data-testid="button-view-pricing"
              >
                View Pricing
              </Button>
              <Button 
                size="lg"
                variant="outline"
                onClick={() => setLocation("/auth?action=register")}
                data-testid="button-get-started"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
