import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Link } from "wouter";
import { Clock, Sparkles } from "lucide-react";

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  remainingMinutes?: number;
}

export function TopUpModal({ isOpen, onClose, remainingMinutes = 0 }: TopUpModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleBuyMinutes = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/checkout/buy-minutes', {
        minutePackage: '60'
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
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="modal-topup">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            {remainingMinutes > 0 ? 'Running Low on Minutes' : 'Out of Minutes'}
          </DialogTitle>
          <DialogDescription>
            {remainingMinutes > 0
              ? `You have ${remainingMinutes} minutes left. Purchase more to continue learning without interruption.`
              : "You've used all your included minutes. Purchase more to continue your tutoring sessions."}
          </DialogDescription>
        </DialogHeader>
        
        <Card className="border-2 border-primary/20 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-foreground">60 Minutes</h3>
                  <p className="text-sm text-muted-foreground">One-time purchase</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-foreground">$19.99</p>
              </div>
            </div>
            
            <div className="space-y-2 mb-4">
              <div className="flex items-center text-sm text-muted-foreground">
                <svg className="w-4 h-4 mr-2 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                Never expires
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <svg className="w-4 h-4 mr-2 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                Use across all subjects
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <svg className="w-4 h-4 mr-2 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                Available immediately
              </div>
            </div>

            <Button 
              onClick={handleBuyMinutes}
              disabled={isLoading}
              className="w-full"
              data-testid="button-buy-minutes"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                  Processing...
                </div>
              ) : (
                'Buy 60 Minutes Now'
              )}
            </Button>
          </CardContent>
        </Card>

        <DialogFooter className="sm:justify-center">
          <p className="text-sm text-muted-foreground text-center">
            Or <Link href="/pricing" className="text-primary hover:underline">upgrade your plan</Link> for more included minutes
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
