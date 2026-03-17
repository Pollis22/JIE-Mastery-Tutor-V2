import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Link } from "wouter";
import { Clock, Sparkles, Zap, Crown } from "lucide-react";

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  remainingMinutes?: number;
}

const topUpPackages = [
  {
    id: '60',
    minutes: 60,
    hours: '1 hour',
    price: '$8.99',
    perHour: '$9.00/hr',
    icon: Sparkles,
    label: '',
  },
  {
    id: '180',
    minutes: 180,
    hours: '3 hours',
    price: '$24.99',
    perHour: '$8.33/hr',
    icon: Zap,
    label: 'Popular',
  },
  {
    id: '360',
    minutes: 360,
    hours: '6 hours',
    price: '$44.99',
    perHour: '$7.50/hr',
    icon: Crown,
    label: 'Best Value',
  },
];

export function TopUpModal({ isOpen, onClose, remainingMinutes = 0 }: TopUpModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleBuyMinutes = async (packageId: string) => {
    setIsLoading(packageId);
    try {
      const response = await apiRequest('POST', '/api/checkout/buy-minutes', {
        minutePackage: packageId
      });
      
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to start checkout',
        variant: 'destructive',
      });
      setIsLoading(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg" data-testid="modal-topup">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            {remainingMinutes > 0 ? 'Running Low on Hours' : 'Out of Hours'}
          </DialogTitle>
          <DialogDescription>
            {remainingMinutes > 0
              ? `You have less than ${Math.ceil(remainingMinutes / 60)} hour${Math.ceil(remainingMinutes / 60) === 1 ? '' : 's'} left. Top up to keep learning without interruption.`
              : "You've used all your included hours. Top up to continue your tutoring sessions."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3">
          {topUpPackages.map((pkg) => {
            const Icon = pkg.icon;
            return (
              <Card 
                key={pkg.id} 
                className={`border shadow-sm transition-all hover:border-primary/40 ${
                  pkg.label === 'Best Value' ? 'border-2 border-primary/30 bg-primary/5' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{pkg.hours}</h3>
                          {pkg.label && (
                            <Badge variant={pkg.label === 'Best Value' ? 'default' : 'secondary'} className="text-xs">
                              {pkg.label}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{pkg.hours} • {pkg.perHour}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold text-foreground">{pkg.price}</span>
                      <Button 
                        size="sm"
                        onClick={() => handleBuyMinutes(pkg.id)}
                        disabled={isLoading !== null}
                        data-testid={`button-buy-${pkg.id}-minutes`}
                      >
                        {isLoading === pkg.id ? (
                          <div className="flex items-center">
                            <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-1" />
                          </div>
                        ) : (
                          'Buy'
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="text-center space-y-2 pt-2">
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>
              Never expires
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>
              Available instantly
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>
              All subjects
            </span>
          </div>
        </div>

        <DialogFooter className="sm:justify-center">
          <p className="text-sm text-muted-foreground text-center">
            Or <Link href="/pricing" className="text-primary hover:underline">upgrade your plan</Link> for more included hours every month
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
