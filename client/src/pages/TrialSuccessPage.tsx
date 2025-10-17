import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { CheckCircle, Clock, BookOpen, Calendar, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiRequest } from '@/lib/queryClient';

export default function TrialSuccessPage() {
  const [trialEndDate, setTrialEndDate] = useState<Date | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number>(7);
  const [userInfo, setUserInfo] = useState<{ studentName?: string; email?: string } | null>(null);

  useEffect(() => {
    // Fetch user info and trial details
    const fetchUserInfo = async () => {
      try {
        const user = await apiRequest('/api/auth/me');
        if (user) {
          setUserInfo({ studentName: user.studentName, email: user.email });
          
          // Calculate trial end date
          if (user.trialEndsAt) {
            const endDate = new Date(user.trialEndsAt);
            setTrialEndDate(endDate);
            
            // Calculate days remaining
            const now = new Date();
            const diffTime = endDate.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            setDaysRemaining(Math.max(0, diffDays));
          }
        }
      } catch (error) {
        console.error('Error fetching user info:', error);
      }
    };

    fetchUserInfo();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white dark:from-green-950 dark:to-gray-900 py-12 px-4 sm:px-6 lg:px-8" data-testid="page-trial-success">
      <div className="max-w-4xl mx-auto">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-green-500" data-testid="icon-success" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2" data-testid="text-welcome">
            Welcome to Your 7-Day Trial!
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300" data-testid="text-student-name">
            {userInfo?.studentName ? `${userInfo.studentName} is all set to start learning!` : 'Your trial is now active!'}
          </p>
        </div>

        {/* Trial Details Card */}
        <Card className="mb-8" data-testid="card-trial-details">
          <CardHeader>
            <CardTitle>Your Trial Benefits</CardTitle>
            <CardDescription>Here's what you get during your 7-day trial</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start space-x-3">
              <Clock className="h-5 w-5 text-blue-500 mt-1" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">30 Minutes of Voice Tutoring</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Experience our AI tutors across Math, English, and Spanish
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <BookOpen className="h-5 w-5 text-purple-500 mt-1" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Full Access to All Features</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Interactive lessons, quizzes, document uploads, and progress tracking
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Calendar className="h-5 w-5 text-orange-500 mt-1" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Trial Ends {trialEndDate ? trialEndDate.toLocaleDateString() : 'in 7 days'}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <Badge variant="secondary" data-testid="badge-days-remaining">
                    {daysRemaining} days remaining
                  </Badge>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Next Steps */}
        <Card className="mb-8" data-testid="card-next-steps">
          <CardHeader>
            <CardTitle>Ready to Start Learning?</CardTitle>
            <CardDescription>Here's how to get the most from your trial</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="text-center">
                <div className="bg-blue-100 dark:bg-blue-900 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-2">
                  <span className="font-bold text-blue-600 dark:text-blue-300">1</span>
                </div>
                <p className="font-semibold mb-1">Choose a Subject</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Pick Math, English, or Spanish to begin
                </p>
              </div>
              <div className="text-center">
                <div className="bg-green-100 dark:bg-green-900 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-2">
                  <span className="font-bold text-green-600 dark:text-green-300">2</span>
                </div>
                <p className="font-semibold mb-1">Start a Voice Session</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Click "Start Voice Tutoring" and talk with your AI tutor
                </p>
              </div>
              <div className="text-center">
                <div className="bg-purple-100 dark:bg-purple-900 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-2">
                  <span className="font-bold text-purple-600 dark:text-purple-300">3</span>
                </div>
                <p className="font-semibold mb-1">Track Progress</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  View your dashboard to see improvement over time
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Link href="/dashboard" className="w-full">
              <Button className="w-full" size="lg" data-testid="button-start-learning">
                Go to Learning Dashboard
              </Button>
            </Link>
          </CardFooter>
        </Card>

        {/* Email Confirmation Alert */}
        <Alert data-testid="alert-email-confirmation">
          <Mail className="h-4 w-4" />
          <AlertDescription>
            We've sent a confirmation email to <strong>{userInfo?.email || 'your registered email'}</strong> with your trial details.
            You'll receive a reminder email 24 hours before your trial ends.
          </AlertDescription>
        </Alert>

        {/* Trial Information */}
        <Card className="mt-8" data-testid="card-trial-info">
          <CardHeader>
            <CardTitle>Important Trial Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start space-x-2">
              <span className="text-green-500">✓</span>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>No charges during trial:</strong> Your card won't be charged until the trial ends
              </p>
            </div>
            <div className="flex items-start space-x-2">
              <span className="text-green-500">✓</span>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>Cancel anytime:</strong> You can cancel before the trial ends with no charges
              </p>
            </div>
            <div className="flex items-start space-x-2">
              <span className="text-green-500">✓</span>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>Automatic conversion:</strong> After 7 days, your trial will convert to your selected plan
              </p>
            </div>
            <div className="flex items-start space-x-2">
              <span className="text-green-500">✓</span>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>Email reminder:</strong> We'll email you 1 day before your trial expires
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Link href="/pricing">
              <Button variant="outline" data-testid="button-view-plans">View Plans</Button>
            </Link>
            <Link href="/account">
              <Button variant="outline" data-testid="button-manage-subscription">Manage Subscription</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}