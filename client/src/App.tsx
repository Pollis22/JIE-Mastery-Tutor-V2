import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import HomePage from "@/pages/home-page";
import DashboardPage from "@/pages/dashboard";
import LessonsPage from "@/pages/lessons-page";
import LessonPage from "@/pages/lesson-page";
import QuizPage from "@/pages/quiz-page";
import SettingsPage from "@/pages/settings-page";
import AdminPage from "@/pages/admin-page";
import PricingPage from "@/pages/pricing-page";
import SubscribePage from "@/pages/subscribe-page";
import TutorPage from "@/pages/tutor-page";
import BenefitsPage from "@/pages/benefits-page";
import UnsubscribePage from "@/pages/unsubscribe-page";
import AdminOverview from "@/pages/admin-overview";
import AdminUsers from "@/pages/admin-users";
import AdminSubscriptions from "@/pages/admin-subscriptions";
import AdminDocuments from "@/pages/admin-documents";
import AdminAnalytics from "@/pages/admin-analytics";
import AdminLogs from "@/pages/admin-logs";
import AdminContacts from "@/pages/admin/admin-contacts-page";
import AdminAgents from "@/pages/admin/admin-agents-page";
import TermsPage from "@/pages/terms-page";
import AdminSetupPage from "@/pages/admin-setup-page";
import SessionDetailsPage from "@/pages/session-details";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import VerifyEmailPage from "@/pages/verify-email";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={TutorPage} />
      <ProtectedRoute path="/dashboard" component={DashboardPage} />
      <ProtectedRoute path="/sessions/:id" component={SessionDetailsPage} />
      <ProtectedRoute path="/tutor" component={TutorPage} />
      <ProtectedRoute path="/old-lessons" component={HomePage} />
      <ProtectedRoute path="/lessons" component={LessonsPage} />
      <ProtectedRoute path="/lesson/:lessonId" component={LessonPage} />
      <ProtectedRoute path="/quiz/:lessonId" component={QuizPage} />
      <ProtectedRoute path="/settings" component={SettingsPage} />
      <ProtectedRoute path="/admin" component={AdminOverview} />
      <ProtectedRoute path="/admin/users" component={AdminUsers} />
      <ProtectedRoute path="/admin/subscriptions" component={AdminSubscriptions} />
      <ProtectedRoute path="/admin/documents" component={AdminDocuments} />
      <ProtectedRoute path="/admin/analytics" component={AdminAnalytics} />
      <ProtectedRoute path="/admin/agents" component={AdminAgents} />
      <ProtectedRoute path="/admin/contacts" component={AdminContacts} />
      <ProtectedRoute path="/admin/logs" component={AdminLogs} />
      <ProtectedRoute path="/subscribe" component={SubscribePage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/login" component={AuthPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/admin-setup" component={AdminSetupPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/benefits" component={BenefitsPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/unsubscribe" component={UnsubscribePage} />
      <Route component={NotFound} />
    </Switch>
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
