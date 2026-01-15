import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, UserPlus, CreditCard, CheckCircle } from 'lucide-react';

export default function TrialEndedPage() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get('email') || '';

  const features = [
    'Unlimited AI tutoring sessions',
    'Multiple student profiles',
    'Progress tracking & reports',
    'All subjects: Math, English, Spanish & more',
    'Voice conversations with patient AI tutors',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 py-12 px-4" data-testid="page-trial-ended">
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-xl border-0">
          <CardHeader className="text-center pb-2">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-10 h-10 text-red-600" />
            </div>
            <CardTitle className="text-3xl font-bold" data-testid="text-title">
              Your Free Trial Has Ended
            </CardTitle>
            <CardDescription className="text-lg mt-2">
              We hope you enjoyed your 5-minute preview of JIE Mastery AI Tutor!
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-8">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
              <h3 className="font-semibold text-lg mb-4 text-center">
                Create an account to unlock:
              </h3>
              <ul className="space-y-3">
                {features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="flex flex-col gap-4">
              <Link href={email ? `/auth?prefill=${encodeURIComponent(email)}` : '/auth'}>
                <Button 
                  className="w-full bg-red-600 hover:bg-red-700 text-lg py-6"
                  data-testid="button-create-account"
                >
                  <UserPlus className="w-5 h-5 mr-2" />
                  Create Account
                </Button>
              </Link>
              
              <Link href="/pricing">
                <Button 
                  variant="outline"
                  className="w-full text-lg py-6 border-2 border-red-600 text-red-600 hover:bg-red-50 hover:text-red-700"
                  data-testid="button-view-plans"
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  View Plans
                </Button>
              </Link>

              <div className="grid grid-cols-2 gap-4 mt-2">
                <Link href="/">
                  <Button variant="ghost" className="w-full text-gray-600">Home</Button>
                </Link>
                <Link href="/benefits">
                  <Button variant="ghost" className="w-full text-gray-600">Benefits</Button>
                </Link>
              </div>
            </div>
            
            <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
              Questions? <Link href="/contact" className="text-red-600 hover:underline">Contact us</Link> for help.
            </p>
          </CardContent>
        </Card>
        
        <div className="text-center mt-8">
          <Link href="/">
            <span className="text-gray-600 dark:text-gray-400 hover:text-red-600 text-sm cursor-pointer">
              Return to Home
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
