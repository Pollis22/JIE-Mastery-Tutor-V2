/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */

import { useLocation } from "wouter";

export function Footer() {
  const [, setLocation] = useLocation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-card border-t border-border py-8 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0 mb-6">
          <div className="flex flex-wrap justify-center md:justify-start gap-6">
            <button
              onClick={() => setLocation("/terms")}
              className="text-muted-foreground hover:text-foreground transition-colors text-sm"
              data-testid="link-terms"
            >
              Terms & Conditions
            </button>
            <button
              onClick={() => setLocation("/privacy")}
              className="text-muted-foreground hover:text-foreground transition-colors text-sm"
              data-testid="link-privacy"
            >
              Privacy Policy
            </button>
            <button
              onClick={() => setLocation("/benefits")}
              className="text-muted-foreground hover:text-foreground transition-colors text-sm"
              data-testid="link-benefits"
            >
              Why JIE Mastery AI
            </button>
            <button
              onClick={() => setLocation("/offer")}
              className="text-muted-foreground hover:text-foreground transition-colors text-sm"
              data-testid="link-offers"
            >
              Offers
            </button>
            <button
              onClick={() => setLocation("/pricing")}
              className="text-muted-foreground hover:text-foreground transition-colors text-sm"
              data-testid="link-pricing"
            >
              Pricing
            </button>
            <button
              onClick={() => setLocation("/support")}
              className="text-muted-foreground hover:text-foreground transition-colors text-sm"
              data-testid="link-support"
            >
              Support
            </button>
            <button
              onClick={() => setLocation("/contact")}
              className="text-muted-foreground hover:text-foreground transition-colors text-sm"
              data-testid="link-contact"
            >
              Contact
            </button>
            <button
              onClick={() => setLocation("/trust-safety")}
              className="text-muted-foreground hover:text-foreground transition-colors text-sm"
              data-testid="link-trust-safety"
            >
              Trust & Compliance
            </button>
          </div>
        </div>
        
        <div className="border-t border-border pt-6 text-center">
          <p className="text-sm text-muted-foreground">
            © {currentYear} JIE Mastery AI, Inc. All Rights Reserved.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Patent Pending. Unauthorized use, reproduction, or distribution prohibited.
          </p>
        </div>
      </div>
    </footer>
  );
}
