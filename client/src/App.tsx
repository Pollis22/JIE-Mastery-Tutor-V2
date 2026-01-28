/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */

import { lazy } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute, PublicOrAuthRoute, LazyRoute } from "./lib/protected-route";
import AuthPage from "@/pages/auth-page";
import { usePageTracking } from "@/hooks/use-page-tracking";
import { useTracking } from "@/hooks/use-tracking";

if (typeof window !== 'undefined' && window.location.hostname === 'jiemastery.ai') {
  window.location.replace('https://www.jiemastery.ai' + window.location.pathname + window.location.search + window.location.hash);
}

const NotFound = lazy(() => import("@/pages/not-found"));
const OfferPage = lazy(() => import("@/pages/offer-page"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const SettingsPage = lazy(() => import("@/pages/settings-page"));
const AdminPageEnhanced = lazy(() => import("@/pages/admin-page-enhanced"));
const PricingPage = lazy(() => import("@/pages/pricing-page"));
const SubscribePage = lazy(() => import("@/pages/subscribe-page"));
const TutorPage = lazy(() => import("@/pages/tutor-page"));
const BenefitsPage = lazy(() => import("@/pages/benefits-page"));
const UnsubscribePage = lazy(() => import("@/pages/unsubscribe-page"));
const DemoPage = lazy(() => import("@/pages/demo-page"));
const FAQPage = lazy(() => import("@/pages/faq-page"));
const SchoolsPage = lazy(() => import("@/pages/schools-page"));
const SupportPage = lazy(() => import("@/pages/support-page"));
const ContactPage = lazy(() => import("@/pages/contact-page"));
const AdminUsers = lazy(() => import("@/pages/admin-users"));
const AdminSubscriptions = lazy(() => import("@/pages/admin-subscriptions"));
const AdminDocuments = lazy(() => import("@/pages/admin-documents"));
const AdminAnalytics = lazy(() => import("@/pages/admin-analytics"));
const AdminLogs = lazy(() => import("@/pages/admin-logs"));
const AdminUserDetail = lazy(() => import("@/pages/admin-user-detail"));
const AdminContacts = lazy(() => import("@/pages/admin/admin-contacts-page"));
const AdminAgents = lazy(() => import("@/pages/admin/admin-agents-page"));
const TermsPage = lazy(() => import("@/pages/terms-page"));
const PrivacyPage = lazy(() => import("@/pages/privacy-page"));
const TrustSafetyPage = lazy(() => import("@/pages/trust-safety-page"));
const AdminSetupPage = lazy(() => import("@/pages/admin-setup-page"));
const SessionDetailsPage = lazy(() => import("@/pages/session-details"));
const ForgotPasswordPage = lazy(() => import("@/pages/forgot-password"));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password"));
const VerifyEmailPage = lazy(() => import("@/pages/verify-email-page"));
const RegistrationSuccessPage = lazy(() => import("@/pages/registration-success-page"));
const PersonalityTestPage = lazy(() => import("@/pages/PersonalityTestPage").then(m => ({ default: m.PersonalityTestPage })));
const ProfilePage = lazy(() => import("@/pages/profile-page"));
const PracticeLessonsPage = lazy(() => import("@/pages/practice-lessons-page"));
const TrialVerifyPage = lazy(() => import("@/pages/trial-verify-page"));
const TrialEndedPage = lazy(() => import("@/pages/trial-ended-page"));
const TrialTutorPage = lazy(() => import("@/pages/trial-tutor-page"));
const MagicLinkPage = lazy(() => import("@/pages/magic-link-page"));
const StartTrialPage = lazy(() => import("@/pages/start-trial-page"));

function PageTracking() {
  usePageTracking();
  useTracking();
  return null;
}

function Router() {
  return (
    <>
      <PageTracking />
      <Switch>
        <PublicOrAuthRoute path="/" publicComponent={AuthPage} authComponent={TutorPage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/login" component={AuthPage} />
        <LazyRoute path="/offer" component={OfferPage} />
        <LazyRoute path="/welcome" component={OfferPage} />
        <ProtectedRoute path="/dashboard" component={DashboardPage} />
        <ProtectedRoute path="/sessions/:id" component={SessionDetailsPage} />
        <ProtectedRoute path="/tutor" component={TutorPage} />
        <ProtectedRoute path="/practice-lessons" component={PracticeLessonsPage} />
        <ProtectedRoute path="/settings" component={SettingsPage} />
        <ProtectedRoute path="/profile" component={ProfilePage} />
        <ProtectedRoute path="/admin" component={AdminPageEnhanced} />
        <ProtectedRoute path="/admin/users" component={AdminUsers} />
        <ProtectedRoute path="/admin/users/:userId" component={AdminUserDetail} />
        <ProtectedRoute path="/admin/subscriptions" component={AdminSubscriptions} />
        <ProtectedRoute path="/admin/documents" component={AdminDocuments} />
        <ProtectedRoute path="/admin/analytics" component={AdminAnalytics} />
        <ProtectedRoute path="/admin/agents" component={AdminAgents} />
        <ProtectedRoute path="/admin/contacts" component={AdminContacts} />
        <ProtectedRoute path="/admin/logs" component={AdminLogs} />
        <ProtectedRoute path="/subscribe" component={SubscribePage} />
        <ProtectedRoute path="/personality-test" component={PersonalityTestPage} />
        <LazyRoute path="/auth/registration-success" component={RegistrationSuccessPage} />
        <LazyRoute path="/auth/magic" component={MagicLinkPage} />
        <LazyRoute path="/forgot-password" component={ForgotPasswordPage} />
        <LazyRoute path="/reset-password" component={ResetPasswordPage} />
        <LazyRoute path="/verify-email" component={VerifyEmailPage} />
        <LazyRoute path="/admin-setup" component={AdminSetupPage} />
        <LazyRoute path="/pricing" component={PricingPage} />
        <LazyRoute path="/benefits" component={BenefitsPage} />
        <LazyRoute path="/demo" component={DemoPage} />
        <LazyRoute path="/faq" component={FAQPage} />
        <LazyRoute path="/schools" component={SchoolsPage} />
        <LazyRoute path="/support" component={SupportPage} />
        <LazyRoute path="/contact" component={ContactPage} />
        <LazyRoute path="/terms" component={TermsPage} />
        <LazyRoute path="/privacy" component={PrivacyPage} />
        <LazyRoute path="/trust-safety" component={TrustSafetyPage} />
        <LazyRoute path="/unsubscribe" component={UnsubscribePage} />
        <LazyRoute path="/trial/verify" component={TrialVerifyPage} />
        <LazyRoute path="/trial/ended" component={TrialEndedPage} />
        <LazyRoute path="/trial/tutor" component={TrialTutorPage} />
        <LazyRoute path="/start-trial" component={StartTrialPage} />
        <LazyRoute component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
